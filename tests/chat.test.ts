import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { POST as chat } from "@/app/api/chat/route";
import { clearActivities, listActivities } from "@/lib/activity";
import { MODELS } from "@/lib/config";
import type { ChatReply, Tier } from "@/lib/types";

// The real chat route and spawn path, with Gemini intercepted over HTTP and a fake `claude`.
const FAKE_CLAUDE = fileURLToPath(new URL("./fixtures/fake-claude.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "canopy-chat-test-"));
let log = "";
let tier: Tier = "light";

beforeEach(() => {
  clearActivities();
  tier = "light";
  log = join(dir, `claude-${Math.random()}.log`);
  writeFileSync(log, "");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-secret");
  vi.stubEnv("CANOPY_CLAUDE_BIN", FAKE_CLAUDE);
  vi.stubEnv("FAKE_CLAUDE_LOG", log);
  vi.stubEnv("FAKE_CLAUDE_MODE", "");
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes("generativelanguage.googleapis.com")) throw new Error(`Unexpected network request: ${url}`);
    return new Response(JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ tier, reason: "Fits this model." }) }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 40 },
    }), { headers: { "Content-Type": "application/json" } });
  }));
});

const calls = () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
function request(body: unknown) {
  return new Request("http://127.0.0.1:3000/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3000" }, body: JSON.stringify(body) });
}

describe("POST /api/chat", () => {
  it("routes, runs Claude Code with tools disabled, and returns the answer with impact", async () => {
    tier = "medium";
    const response = await chat(request({ prompt: "Explain leaves; $(whoami)" }));
    const reply = await response.json() as ChatReply;
    expect(response.status).toBe(200);
    expect(reply.answer).toBe("Leaves change color because chlorophyll breaks down.");
    expect(reply.sessionId).toBe("11111111-2222-3333-4444-555555555555");
    expect(reply.result.routing.model).toBe(MODELS.medium.id);
    expect(reply.result.usage.models[0]).toMatchObject({ model: MODELS.medium.id, cacheReadInputTokens: 1000, cacheCreationInputTokens: 500 });
    expect(reply.result.impact.routed.energyWh).toBeGreaterThan(0);
    const [call] = calls();
    expect(call.stdin).toBe("Explain leaves; $(whoami)");
    expect(call.geminiKey).toBeNull();
    expect(call.argv.slice(0, 11)).toEqual(["-p", "--model", MODELS.medium.id, "--output-format", "json", "--permission-prompts", "none", "--tools", "", "--strict-mcp-config", "--append-system-prompt"]);
    expect(call.argv).not.toContain("--resume");
    expect(listActivities()[0].status).toBe("completed");
    expect(JSON.stringify(listActivities())).not.toContain("chlorophyll");
  });
  it("continues a conversation with --resume", async () => {
    await chat(request({ prompt: "Follow up", sessionId: "11111111-2222-3333-4444-555555555555" }));
    expect(calls()[0].argv.slice(-2)).toEqual(["--resume", "11111111-2222-3333-4444-555555555555"]);
  });
  it.each(["not-a-uuid", "--dangerously-skip-permissions", 42])("rejects an invalid session ID (%s) before any provider call", async (sessionId) => {
    const response = await chat(request({ prompt: "Hi", sessionId }));
    expect(response.status).toBe(400);
    expect(calls()).toHaveLength(0);
  });
  it("reports a Claude Code login problem and records the run as failed", async () => {
    vi.stubEnv("FAKE_CLAUDE_MODE", "login");
    const response = await chat(request({ prompt: "Hi" }));
    expect(response.status).toBe(502);
    expect((await response.json()).error.message).toContain("/login");
    expect(listActivities()[0].status).toBe("failed");
  });
  it("refuses to estimate when usage is missing", async () => {
    vi.stubEnv("FAKE_CLAUDE_MODE", "no-usage");
    const response = await chat(request({ prompt: "Hi" }));
    expect((await response.json()).error.code).toBe("MISSING_USAGE");
    expect(listActivities()[0].status).toBe("failed");
  });
  it("explains a missing claude executable", async () => {
    vi.stubEnv("CANOPY_CLAUDE_BIN", join(dir, "no-such-claude"));
    const response = await chat(request({ prompt: "Hi" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toContain("isn't installed");
  });
  it("rejects cross-site requests", async () => {
    const response = await chat(new Request("http://127.0.0.1:3000/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://evil.example" }, body: JSON.stringify({ prompt: "Hi" }) }));
    expect(response.status).toBe(403);
    expect(calls()).toHaveLength(0);
  });
});
