import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as route } from "@/app/api/route/route";
import { POST as classifyAlias } from "@/app/api/classify/route";
import { POST as usage } from "@/app/api/usage/route";
import { GET as session } from "@/app/api/session/route";
import { clearActivities, createDecision, listActivities, MAX_ENTRIES, PENDING_TTL_MS } from "@/lib/activity";
import { CLASSIFIER_FALLBACK_MODEL, CLASSIFIER_MODEL, MAX_PROMPT_LENGTH, MODELS } from "@/lib/config";
import { parseClassification } from "@/lib/classify";
import type { DashboardState, RouteResult, RoutingDecision, Tier } from "@/lib/types";

const calls: { url: string; body: Record<string, unknown> }[] = [];
let tier: Tier = "light";
let classifierStatus = 200;
let classifierText: string | undefined;
let omitClassifierUsage = false;
let firstModelMissing = false;
let finishReason = "STOP";

beforeEach(() => {
  clearActivities();
  calls.length = 0; tier = "light"; classifierStatus = 200; classifierText = undefined;
  omitClassifierUsage = false; firstModelMissing = false; finishReason = "STOP";
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-secret");
  // Exercise the real Gemini SDK serialization/response parsing, intercepting only HTTP.
  // Any other request fails; no test can reach a real provider, and nothing calls Anthropic.
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, body: JSON.parse(init?.body as string ?? "{}") });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("generativelanguage.googleapis.com")) {
      if (firstModelMissing && url.includes(CLASSIFIER_MODEL)) return json({ error: { code: 404, message: "Model missing", status: "NOT_FOUND" } }, 404);
      if (classifierStatus !== 200) return json({ error: { code: classifierStatus, message: "Provider private details test-gemini-secret" } }, classifierStatus);
      return json({
        candidates: [{ content: { role: "model", parts: [{ text: classifierText ?? JSON.stringify({ tier, reason: "The task complexity fits this model." }) }] }, finishReason }],
        usageMetadata: omitClassifierUsage ? {} : { promptTokenCount: 200, candidatesTokenCount: 35, thoughtsTokenCount: 5, totalTokenCount: 240 },
      });
    }
    throw new Error(`Unexpected network request: ${url}`);
  }));
});

const LOCAL = "http://127.0.0.1:3000";
function request(prompt: unknown = "Explain leaves.", init: { origin?: string; host?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.origin) headers.Origin = init.origin;
  return new Request(`${init.host ?? LOCAL}/api/route`, { method: "POST", headers, body: JSON.stringify({ prompt }) });
}
function report(body: unknown) {
  return new Request(`${LOCAL}/api/usage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function decide(chosen: Tier = "light"): Promise<RoutingDecision> {
  tier = chosen;
  return (await route(request())).json();
}
const sonnet = { model: "claude-sonnet-5", inputTokens: 1000, outputTokens: 1000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };

describe("POST /api/route (classification only)", () => {
  it.each<Tier>(["light", "medium", "heavy"])("routes %s with one Gemini call and no generation", async (chosen) => {
    tier = chosen;
    const original = "  Keep this exact prompt.\nIncluding whitespace.  ";
    const response = await route(request(original));
    const decision = await response.json() as RoutingDecision;
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(decision.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(decision.routing.model).toBe(MODELS[chosen].id);
    expect(decision.routing.baselineModel).toBe("claude-opus-5");
    expect(decision.usage.classifier).toEqual({ inputTokens: 200, outputTokens: 40 });
    expect(decision.classifierImpact.energyWh).toBeCloseTo(0.03555, 10);
    expect(decision).not.toHaveProperty("answer");
    expect(calls).toHaveLength(1);
    expect(calls[0].body.contents).toEqual([{ role: "user", parts: [{ text: original }] }]);
    expect(calls[0].url).toContain(CLASSIFIER_MODEL);
    expect(calls[0].body.generationConfig).toMatchObject({ responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "MINIMAL" } });
    expect(JSON.stringify(decision)).not.toContain("secret");
  });
  it("stores the decision as in-progress activity without the prompt", async () => {
    await route(request("A private prompt about leaves."));
    const [activity] = listActivities();
    expect(activity.status).toBe("routed");
    expect(JSON.stringify(listActivities())).not.toContain("private prompt");
  });
  it("is also served at /api/classify", async () => {
    const response = await classifyAlias(request());
    expect(response.status).toBe(200);
    expect((await response.json()).routing.model).toBe(MODELS.light.id);
  });
  it("uses only the configured Flash Lite fallback when the primary returns 404", async () => {
    firstModelMissing = true;
    const decision = await (await route(request())).json();
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain(CLASSIFIER_FALLBACK_MODEL);
    expect(calls[1].body.generationConfig).toMatchObject({ thinkingConfig: { thinkingBudget: 0 } });
    expect(decision.routing.classifierFallback).toBe(true);
  });
  it.each([401, 403, 429, 500, 503])("fails clearly on Gemini %s without retrying", async (status) => {
    classifierStatus = status;
    const response = await route(request());
    expect(response.status).toBe(status === 429 ? 429 : 502);
    const result = await response.json();
    expect(result.error.stage).toBe("classification");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(calls).toHaveLength(1);
    expect(listActivities()).toHaveLength(0);
  });
  it.each(["not json", '{"tier":"opus","reason":"hi"}', '{"tier":"light"}', '{"tier":"heavy","reason":""}'])("rejects malformed routing output: %s", async (text) => {
    classifierText = text;
    const response = await route(request());
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("INVALID_CLASSIFICATION");
  });
  it("fails on a blocked classification", async () => {
    finishReason = "SAFETY";
    expect((await (await route(request())).json()).error.code).toBe("CLASSIFICATION_INCOMPLETE");
  });
  it("refuses to fabricate missing classifier usage", async () => {
    omitClassifierUsage = true;
    const result = await (await route(request())).json();
    expect(result.error.code).toBe("MISSING_USAGE");
  });
  it.each([null, "", "   ", 123, {}])("rejects invalid prompts before provider calls: %j", async (prompt) => {
    expect((await route(request(prompt))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("rejects overlong prompts, malformed JSON and unsupported content types", async () => {
    expect((await route(request("x".repeat(MAX_PROMPT_LENGTH + 1)))).status).toBe(413);
    expect((await route(new Request(`${LOCAL}/api/route`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status).toBe(400);
    expect((await route(new Request(`${LOCAL}/api/route`, { method: "POST", body: "hello" }))).status).toBe(415);
    expect(calls).toHaveLength(0);
  });
  it("needs only the Gemini key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await route(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toContain("GEMINI_API_KEY");
    expect(calls).toHaveLength(0);
  });
  it("rejects non-local hosts and cross-origin browser requests", async () => {
    expect((await route(request("Hi", { host: "http://evil.example" }))).status).toBe(403);
    expect((await route(request("Hi", { origin: "http://evil.example" }))).status).toBe(403);
    expect((await route(request("Hi", { origin: LOCAL }))).status).toBe(200);
  });
});

describe("POST /api/usage", () => {
  it("completes a run from actual per-model usage, idempotently", async () => {
    const decision = await decide("medium");
    const response = await usage(report({ id: decision.id, status: "completed", models: [sonnet], durationMs: 1234 }));
    const result = await response.json() as RouteResult;
    expect(response.status).toBe(200);
    expect(result.impact.routed.energyWh).toBeCloseTo(3.05055, 10);
    expect(result.impact.baseline.energyWh).toBeCloseTo(6.03, 10);
    expect(result.usage.total).toEqual({ inputTokens: 1200, outputTokens: 1040 });
    expect(result.modelMismatch).toBe(false);
    const again = await (await usage(report({ id: decision.id, status: "completed", models: [{ ...sonnet, outputTokens: 5 }], durationMs: 1 }))).json();
    expect(again).toEqual(result);
  });
  it("uses the models Claude Code actually reported and flags a mismatch", async () => {
    const decision = await decide("light");
    const haiku = { model: "claude-haiku-4-5", inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
    const result = await (await usage(report({ id: decision.id, status: "completed", models: [haiku, sonnet], durationMs: 5 }))).json() as RouteResult;
    expect(result.modelMismatch).toBe(true);
    expect(result.usage.models.map((model) => model.model)).toEqual(["claude-haiku-4-5", "claude-sonnet-5"]);
    expect(result.impact.generation.energyWh).toBeCloseTo(3.015 + (10 * 0.000135 + 20 * 0.00288) * 0.5, 10);
  });
  it("marks failures without inventing usage, and refuses to complete them later", async () => {
    const decision = await decide();
    const failed = await (await usage(report({ id: decision.id, status: "failed", reason: "cancelled" }))).json();
    expect(failed.status).toBe("failed");
    expect(failed.result).toBeUndefined();
    expect(failed.error).toContain("cancelled");
    expect((await usage(report({ id: decision.id, status: "completed", models: [sonnet], durationMs: 1 }))).status).toBe(409);
  });
  it("fails a run whose model has no impact factor instead of guessing", async () => {
    const decision = await decide();
    const response = await usage(report({ id: decision.id, status: "completed", models: [{ ...sonnet, model: "claude-fable-5" }], durationMs: 1 }));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("UNSUPPORTED_MODEL");
    expect(listActivities()[0].status).toBe("failed");
  });
  it.each([
    { status: "completed", models: [], durationMs: 1 },
    { status: "completed", models: [{ ...sonnet, inputTokens: -1 }], durationMs: 1 },
    { status: "completed", models: [{ ...sonnet, cacheReadInputTokens: undefined }], durationMs: 1 },
    { status: "completed", models: [sonnet], durationMs: 1.5 },
    { status: "done" },
  ])("rejects invalid reports: %j", async (body) => {
    const decision = await decide();
    expect((await usage(report({ id: decision.id, ...body }))).status).toBe(400);
    expect(listActivities()[0].status).toBe("routed");
  });
  it("returns 404 for unknown routing IDs", async () => {
    expect((await usage(report({ id: "00000000-0000-0000-0000-000000000000", status: "failed" }))).status).toBe(404);
  });
});

describe("GET /api/session and the activity store", () => {
  it("lists newest activity first and reports configuration", async () => {
    const first = await decide();
    const second = await decide("heavy");
    const state = await (await session(new Request(`${LOCAL}/api/session`))).json() as DashboardState;
    expect(state.configured).toBe(true);
    expect(state.activities.map((activity) => activity.id)).toEqual([second.id, first.id]);
  });
  it("expires runs that never report back", async () => {
    await decide();
    vi.useFakeTimers({ now: Date.now() + PENDING_TTL_MS + 1000 });
    try { expect(listActivities()[0].status).toBe("failed"); } finally { vi.useRealTimers(); }
  });
  it("keeps memory bounded even when every run is still pending", () => {
    const routing = { tier: "light", reason: "r", model: "claude-haiku-4-5", modelName: "Haiku", classifierModel: "g", classifierFallback: false, baselineModel: "claude-opus-5" } as const;
    for (let index = 0; index < MAX_ENTRIES + 25; index++) {
      createDecision({ routing, usage: { classifier: { inputTokens: 1, outputTokens: 1 } }, classifierImpact: {} as never, methodologyVersion: "v" });
    }
    expect(listActivities().length).toBeLessThanOrEqual(100);
    expect((globalThis as { canopyActivities?: Map<string, unknown> }).canopyActivities!.size).toBe(MAX_ENTRIES);
  });
});

it("validates classifier rationale length and valid JSON shape", () => {
  expect(() => parseClassification(JSON.stringify({ tier: "light", reason: "x".repeat(301) }))).toThrow();
  expect(() => parseClassification("null")).toThrow();
});
