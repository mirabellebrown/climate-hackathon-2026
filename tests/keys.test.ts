import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { POST as chat } from "@/app/api/chat/route";
import { clearActivities, listActivities } from "@/lib/activity";
import { VENDORS } from "@/lib/config";
import { keysFor, mode, pickVendors } from "@/lib/keys";
import type { ChatReply } from "@/lib/types";

const FAKE_CLAUDE = fileURLToPath(new URL("./fixtures/fake-claude.mjs", import.meta.url));
const GEMINI_KEY = "AIzaTestGeminiKey000000000000000000000";
const ANTHROPIC_KEY = "sk-ant-test-key-0000000000";
let dir = "";

const calls: string[] = [];
function stubProviders(options: { geminiTier?: string; anthropicText?: string } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("generativelanguage.googleapis.com")) {
      const classifying = String(init?.body ?? "").includes("classify task complexity");
      return json({
        candidates: [{ content: { role: "model", parts: [{ text: classifying ? JSON.stringify({ tier: options.geminiTier ?? "medium", reason: "Fits this model." }) : "A Gemini answer." }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 40, cachedContentTokenCount: 0 },
      });
    }
    if (url.startsWith("https://api.anthropic.com/")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const classifying = String(body.system ?? "").includes("classify task complexity");
      return json({
        id: "msg_test", type: "message", role: "assistant", model: body.model, stop_reason: "end_turn",
        content: [{ type: "text", text: classifying ? JSON.stringify({ tier: "heavy", reason: "Dense analysis." }) : options.anthropicText ?? "A Claude answer." }],
        usage: { input_tokens: 120, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      });
    }
    throw new Error(`Unexpected network request: ${url}`);
  }));
}

beforeEach(() => {
  clearActivities();
  calls.length = 0;
  dir = mkdtempSync(join(tmpdir(), "canopy-keys-"));
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("CANOPY_MODE", "hosted");
  vi.stubEnv("CANOPY_ESG_DIR", dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://greenroute.example/api/chat", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

describe("bring-your-own-key handling", () => {
  it("reads keys from headers and falls back to the server's own", () => {
    const keys = keysFor(request({}, { "x-gemini-key": GEMINI_KEY }));
    expect(keys).toMatchObject({ gemini: GEMINI_KEY, anthropic: undefined, geminiFromEnv: false });
    vi.stubEnv("ANTHROPIC_API_KEY", ANTHROPIC_KEY);
    expect(keysFor(request({}))).toMatchObject({ anthropic: ANTHROPIC_KEY, anthropicFromEnv: true });
  });
  // A newline never reaches us: the Headers API rejects it when the request is built.
  it.each(["not a key", "x".repeat(301), "sk-ant; DROP"])("rejects a malformed key: %j", (value) => {
    expect(() => keysFor(request({}, { "x-anthropic-key": value }))).toThrow(/not in the expected format/);
  });
  it("is hosted on a deployment and local otherwise", () => {
    expect(mode()).toBe("hosted");
    vi.stubEnv("CANOPY_MODE", "");
    vi.stubEnv("VERCEL", "1");
    expect(mode()).toBe("hosted");
    vi.stubEnv("VERCEL", "");
    expect(mode()).toBe("local");
  });
  it("routes and answers with whichever single vendor has a key", () => {
    const gemini = pickVendors({ gemini: GEMINI_KEY, geminiFromEnv: false, anthropicFromEnv: false }, "hosted");
    expect(gemini.classifier.vendor).toBe("gemini");
    expect(gemini.answerer).toMatchObject({ kind: "api", vendor: "gemini" });
    const anthropic = pickVendors({ anthropic: ANTHROPIC_KEY, geminiFromEnv: false, anthropicFromEnv: false }, "hosted");
    expect(anthropic.classifier.vendor).toBe("anthropic");
    expect(anthropic.answerer).toMatchObject({ kind: "api", vendor: "anthropic" });
  });
  it("prefers the cheap Gemini classifier and Claude answers when both keys are present", () => {
    const both = pickVendors({ gemini: GEMINI_KEY, anthropic: ANTHROPIC_KEY, geminiFromEnv: false, anthropicFromEnv: false }, "hosted");
    expect(both.classifier.vendor).toBe("gemini");
    expect(both.answerer).toMatchObject({ kind: "api", vendor: "anthropic" });
  });
  it("keeps local Claude Code answers when only a Gemini key is present locally", () => {
    expect(pickVendors({ gemini: GEMINI_KEY, geminiFromEnv: false, anthropicFromEnv: false }, "local").answerer).toEqual({ kind: "claude-code" });
  });
  it("asks for a key when there is none", () => {
    expect(() => pickVendors({ geminiFromEnv: false, anthropicFromEnv: false }, "hosted")).toThrow(/Gemini or Anthropic API key/);
  });
});

describe("POST /api/chat with a visitor's key", () => {
  it("routes and answers with Gemini when that is the only key", async () => {
    stubProviders({ geminiTier: "medium" });
    const response = await chat(request({ prompt: "Explain leaves." }, { "x-gemini-key": GEMINI_KEY }));
    const reply = await response.json() as ChatReply;
    expect(response.status).toBe(200);
    expect(reply.vendor).toBe("Gemini");
    expect(reply.answer).toBe("A Gemini answer.");
    expect(reply.result.routing.model).toBe(VENDORS.gemini.models.medium.id);
    expect(reply.result.routing.classifierModel).toBe(VENDORS.gemini.classifier.id);
    expect(reply.result.routing.baselineModel).toBe(VENDORS.gemini.models.heavy.id);
    expect(reply.result.impact.routed.energyWh).toBeGreaterThan(0);
    expect(calls.every((url) => url.includes("generativelanguage.googleapis.com"))).toBe(true);
    expect(JSON.stringify(reply)).not.toContain(GEMINI_KEY);
  });
  it("routes and answers with Claude when that is the only key", async () => {
    stubProviders();
    const response = await chat(request({ prompt: "Design a ledger." }, { "x-anthropic-key": ANTHROPIC_KEY }));
    const reply = await response.json() as ChatReply;
    expect(reply.vendor).toBe("Claude");
    expect(reply.answer).toBe("A Claude answer.");
    expect(reply.result.routing.model).toBe(VENDORS.anthropic.models.heavy.id);
    expect(reply.result.routing.classifierModel).toBe(VENDORS.anthropic.classifier.id);
    expect(reply.result.usage.models[0]).toMatchObject({ inputTokens: 120, outputTokens: 300 });
    expect(calls.every((url) => url.startsWith("https://api.anthropic.com/"))).toBe(true);
    expect(JSON.stringify(reply)).not.toContain(ANTHROPIC_KEY);
  });
  it("sends the conversation history so hosted follow-ups keep context", async () => {
    stubProviders();
    const bodies: Record<string, unknown>[] = [];
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      return (original as typeof fetch)(input, init);
    }));
    await chat(request({ prompt: "And in code?", history: [{ role: "user", content: "Explain leaves." }, { role: "assistant", content: "They change color." }] }, { "x-anthropic-key": ANTHROPIC_KEY }));
    const answerCall = bodies.at(-1) as { messages: { role: string; content: string }[] };
    expect(answerCall.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(answerCall.messages.at(-1)!.content).toBe("And in code?");
  });
  it.each([
    [{ prompt: "Hi", history: "nope" }, /at most 40 earlier messages|must be an object|array/i],
    [{ prompt: "Hi", history: [{ role: "system", content: "x" }] }, /role of user or assistant/],
  ])("rejects malformed history: %j", async (body, message) => {
    stubProviders();
    const response = await chat(request(body, { "x-anthropic-key": ANTHROPIC_KEY }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(message);
  });
  it("tells a hosted visitor with no key what to add, and records nothing", async () => {
    const response = await chat(request({ prompt: "Hi" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toMatch(/Gemini or Anthropic API key/);
    expect(listActivities()).toHaveLength(0);
  });
  it("never writes a key to the activity store or an error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: `bad key ${ANTHROPIC_KEY}` } }), { status: 401, headers: { "Content-Type": "application/json" } })));
    const response = await chat(request({ prompt: "Hi" }, { "x-anthropic-key": ANTHROPIC_KEY }));
    const body = await response.text();
    expect(body).not.toContain(ANTHROPIC_KEY);
    expect(JSON.stringify(listActivities())).not.toContain(ANTHROPIC_KEY);
  });
  it("still uses local Claude Code when running locally with only a Gemini key", async () => {
    vi.stubEnv("CANOPY_MODE", "local");
    vi.stubEnv("CANOPY_CLAUDE_BIN", FAKE_CLAUDE);
    const log = join(dir, "claude.log");
    writeFileSync(log, "");
    vi.stubEnv("FAKE_CLAUDE_LOG", log);
    stubProviders({ geminiTier: "light" });
    const response = await chat(new Request("http://127.0.0.1:3000/api/chat", { method: "POST", headers: { "Content-Type": "application/json", "x-gemini-key": GEMINI_KEY }, body: JSON.stringify({ prompt: "Hi" }) }));
    const reply = await response.json() as ChatReply;
    expect(reply.result.routing.model).toBe(VENDORS.anthropic.models.light.id);
    expect(readFileSync(log, "utf8")).toContain("--model");
  });
});
