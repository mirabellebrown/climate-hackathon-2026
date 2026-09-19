import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/route/route";
import { POST as classifyOnly } from "@/app/api/classify/route";
import { CLASSIFIER_FALLBACK_MODEL, CLASSIFIER_MODEL, MAX_PROMPT_LENGTH, MODELS } from "@/lib/config";
import { parseClassification } from "@/lib/classify";
import type { RouteResult, Tier } from "@/lib/types";

const calls: { url: string; body: Record<string, unknown> }[] = [];
let tier: Tier = "light";
let classifierStatus = 200;
let generationStatus = 200;
let classifierText: string | undefined;
let omitClassifierUsage = false;
let omitGenerationUsage = false;
let firstModelMissing = false;
let stopReason = "end_turn";
let finishReason = "STOP";

beforeEach(() => {
  calls.length = 0; tier = "light"; classifierStatus = 200; generationStatus = 200;
  classifierText = undefined; omitClassifierUsage = false; omitGenerationUsage = false;
  firstModelMissing = false; stopReason = "end_turn"; finishReason = "STOP";
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-secret");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-secret");
  // Exercise the real official SDK serialization/response parsing, intercepting only HTTP.
  // Any unrecognized request fails; no test can call the public providers.
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = JSON.parse(init?.body as string ?? "{}");
    calls.push({ url, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("generativelanguage.googleapis.com")) {
      if (firstModelMissing && url.includes(CLASSIFIER_MODEL)) return json({ error: { code: 404, message: "Model missing", status: "NOT_FOUND" } }, 404);
      if (classifierStatus !== 200) return json({ error: { code: classifierStatus, message: "Provider private details test-gemini-secret" } }, classifierStatus);
      return json({
        candidates: [{ content: { role: "model", parts: [{ text: classifierText ?? JSON.stringify({ tier, reason: "The task complexity fits this model." }) }] }, finishReason }],
        usageMetadata: omitClassifierUsage ? {} : { promptTokenCount: 200, candidatesTokenCount: 40, thoughtsTokenCount: 5, totalTokenCount: 245 },
      });
    }
    if (url === "https://api.anthropic.com/v1/messages") {
      if (generationStatus !== 200) return json({ type: "error", error: { type: "api_error", message: "Private provider error test-anthropic-secret" } }, generationStatus);
      return json({ id: "msg_test", type: "message", role: "assistant", model: MODELS[tier].id,
        content: [{ type: "text", text: "A useful **answer**." }], stop_reason: stopReason, stop_sequence: null,
        usage: omitGenerationUsage ? {} : { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      });
    }
    throw new Error(`Unexpected network request: ${url}`);
  }));
});

function request(prompt: unknown = "Explain leaves.") {
  return new Request("http://localhost/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
}

describe("POST /api/route through the official SDKs", () => {
  it("returns a companion routing decision without an Anthropic key or generation call", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await classifyOnly(request("Keep generation in the user's own Claude app."));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.routing.model).toBe(MODELS.light.id);
    expect(result.usage.classifier).toEqual({ inputTokens: 200, outputTokens: 45 });
    expect(result.classifierImpact.energyWh).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("answer");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("generativelanguage.googleapis.com");
  });
  it.each<Tier>(["light", "medium", "heavy"])("routes %s and makes exactly one generation call, never an extra baseline call", async (chosen) => {
    tier = chosen;
    const original = "  Keep this exact prompt.\nIncluding whitespace.  ";
    const response = await POST(request(original));
    const result = await response.json() as RouteResult;
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(result.routing.model).toBe(MODELS[chosen].id);
    expect(result.routing.baselineModel).toBe("claude-opus-5");
    expect(result.answer).toBe("A useful **answer**.");
    expect(result.usage.classifier).toEqual({ inputTokens: 200, outputTokens: 45 });
    expect(result.usage.total).toEqual({ inputTokens: 1200, outputTokens: 1045 });
    expect(calls).toHaveLength(2);
    expect(calls[0].body.contents).toEqual([{ role: "user", parts: [{ text: original }] }]);
    expect(calls[0].body.generationConfig).toMatchObject({ responseMimeType: "application/json" });
    expect(calls[1].body.model).toBe(MODELS[chosen].id);
    expect(calls[1].body.messages).toEqual([{ role: "user", content: original }]);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result.impact.baseline.energyWh).toBeCloseTo(6.03, 10);
    expect(Math.sign(result.impact.savings.energyWh)).toBe(chosen === "heavy" ? -1 : 1);
  });
  it("uses only the configured Flash Lite fallback when the primary returns 404", async () => {
    firstModelMissing = true;
    const response = await POST(request());
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(3);
    expect(calls[1].url).toContain(CLASSIFIER_FALLBACK_MODEL);
    expect(result.routing.classifierFallback).toBe(true);
    expect(result.routing.classifierModel).toBe(CLASSIFIER_FALLBACK_MODEL);
  });
  it.each([401, 403, 429, 500, 503])("fails clearly on Gemini %s without retrying or calling Claude", async (status) => {
    classifierStatus = status;
    const response = await POST(request());
    expect(response.status).toBe(status === 429 ? 429 : 502);
    const result = await response.json();
    expect(result.error.stage).toBe("classification");
    expect(result.error.message).toContain("Gemini");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(calls).toHaveLength(1);
  });
  it.each([401, 403, 404, 429, 500])("fails clearly on Claude %s without switching to Opus or retrying", async (status) => {
    generationStatus = status;
    const response = await POST(request());
    expect(response.status).toBe(status === 429 ? 429 : 502);
    const result = await response.json();
    expect(result.error.stage).toBe("generation");
    expect(result.error.message).toContain("Claude");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(calls).toHaveLength(2);
  });
  it.each(["not json", '{"tier":"opus","reason":"hi"}', '{"tier":"light"}', '{"tier":"heavy","reason":""}'])("rejects malformed routing output: %s", async (text) => {
    classifierText = text;
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("INVALID_CLASSIFICATION");
    expect(calls).toHaveLength(1);
  });
  it("fails on a blocked classification before generation", async () => {
    finishReason = "SAFETY";
    const response = await POST(request());
    expect((await response.json()).error.code).toBe("CLASSIFICATION_INCOMPLETE");
    expect(calls).toHaveLength(1);
  });
  it.each(["classification", "generation"])("refuses to fabricate missing %s usage", async (stage) => {
    omitClassifierUsage = stage === "classification"; omitGenerationUsage = stage === "generation";
    const response = await POST(request());
    const result = await response.json();
    expect(response.status).toBe(502);
    expect(result.error.code).toBe("MISSING_USAGE");
    expect(result.error.stage).toBe(stage);
  });
  it("marks an output-limit answer as truncated while accounting for its usage", async () => {
    stopReason = "max_tokens";
    const result = await (await POST(request())).json();
    expect(result.truncated).toBe(true);
    expect(result.usage.generation.outputTokens).toBe(1000);
  });
  it.each([null, "", "   ", 123, {}])("rejects invalid prompts before provider calls: %j", async (prompt) => {
    expect((await POST(request(prompt))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("rejects overlong prompts", async () => {
    expect((await POST(request("x".repeat(MAX_PROMPT_LENGTH + 1)))).status).toBe(413);
    expect(calls).toHaveLength(0);
  });
  it("rejects malformed JSON and unsupported content types", async () => {
    expect((await POST(new Request("http://localhost/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/route", { method: "POST", body: "hello" }))).status).toBe(415);
    expect(calls).toHaveLength(0);
  });
  it("preflights both keys before spending classifier tokens", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toContain("ANTHROPIC_API_KEY");
    expect(calls).toHaveLength(0);
  });
});

it("validates classifier rationale length and valid JSON shape", () => {
  expect(() => parseClassification(JSON.stringify({ tier: "light", reason: "x".repeat(301) }))).toThrow();
  expect(() => parseClassification("null")).toThrow();
});
