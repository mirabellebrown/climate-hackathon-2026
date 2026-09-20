import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OPTIONS as chatPreflight, POST as chat } from "@/app/api/chat/route";
import { GET as bridgeCheck, OPTIONS as bridgePreflight } from "@/app/api/bridge/route";
import { clearActivities } from "@/lib/activity";
import { checkOrigin, connectCode, parseArgs } from "@/scripts/pair.mjs";
import type { ChatReply } from "@/lib/types";

const FAKE_CLAUDE = fileURLToPath(new URL("./fixtures/fake-claude.mjs", import.meta.url));
const SITE = "https://canopy.example";
const TOKEN = "pair-token-0123456789abcdef";
let dir = "";

beforeEach(() => {
  clearActivities();
  dir = mkdtempSync(join(tmpdir(), "canopy-bridge-"));
  vi.stubEnv("CANOPY_MODE", "local");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("CANOPY_ALLOW_ORIGIN", SITE);
  vi.stubEnv("CANOPY_PAIR_TOKEN", TOKEN);
  vi.stubEnv("CANOPY_ESG_DIR", dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function request(path: string, init: RequestInit & { origin?: string; token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.origin) headers.set("Origin", init.origin);
  if (init.token) headers.set("x-canopy-pair", init.token);
  return new Request(`http://127.0.0.1:3000${path}`, { ...init, headers });
}

describe("pairing a deployed page with this machine", () => {
  it("answers the paired origin's preflight with CORS it can use", async () => {
    const response = await chatPreflight(request("/api/chat", { method: "OPTIONS", origin: SITE }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(response.headers.get("access-control-allow-headers")).toContain("x-canopy-pair");
    // Chrome before 2026 gated loopback on this header instead of a permission prompt.
    expect(response.headers.get("access-control-allow-private-network")).toBe("true");
    expect(response.headers.get("vary")).toBe("Origin");
  });
  it("refuses a preflight from any other origin", async () => {
    expect((await chatPreflight(request("/api/chat", { method: "OPTIONS", origin: "https://evil.example" }))).status).toBe(403);
  });
  it("refuses a preflight when the user never paired", async () => {
    vi.stubEnv("CANOPY_PAIR_TOKEN", "");
    expect((await chatPreflight(request("/api/chat", { method: "OPTIONS", origin: SITE }))).status).toBe(403);
    expect((await bridgePreflight(request("/api/bridge", { method: "OPTIONS", origin: SITE }))).status).toBe(403);
  });
  it("confirms the connection for the paired page", async () => {
    const response = await bridgeCheck(request("/api/bridge", { origin: SITE, token: TOKEN }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ paired: true, app: "canopy" });
    expect(response.headers.get("access-control-allow-origin")).toBe(SITE);
  });
  it("refuses the paired origin without the token, and with a wrong one", async () => {
    expect((await bridgeCheck(request("/api/bridge", { origin: SITE }))).status).toBe(403);
    expect((await bridgeCheck(request("/api/bridge", { origin: SITE, token: "wrong-token-0123456789abcd" }))).status).toBe(403);
    expect((await bridgeCheck(request("/api/bridge", { origin: SITE, token: TOKEN.slice(0, -1) }))).status).toBe(403);
  });
  it("never pairs when the app is the deployed one", async () => {
    vi.stubEnv("CANOPY_MODE", "hosted");
    expect((await chatPreflight(request("/api/chat", { method: "OPTIONS", origin: SITE }))).status).toBe(403);
    expect((await bridgeCheck(request("/api/bridge", { origin: SITE, token: TOKEN }))).status).toBe(403);
  });
  it("answers a paired chat with the user's own Claude Code and no API key", async () => {
    vi.stubEnv("CANOPY_CLAUDE_BIN", FAKE_CLAUDE);
    const log = join(dir, "claude.log");
    writeFileSync(log, "");
    vi.stubEnv("FAKE_CLAUDE_LOG", log);
    const response = await chat(request("/api/chat", {
      method: "POST", origin: SITE, token: TOKEN,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "Explain leaves." }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(SITE);
    const reply = await response.json() as ChatReply;
    expect(reply.result.routing.classifierModel).toContain("claude");
    expect(reply.result.impact.routed.energyWh).toBeGreaterThan(0);
  });
  it("refuses a paired chat that does not carry the token", async () => {
    const response = await chat(request("/api/chat", {
      method: "POST", origin: SITE, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "Hi" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("NOT_PAIRED");
  });
});

describe("the pairing launcher", () => {
  it("reads its flags and builds the code the user pastes", () => {
    expect(parseArgs(["--origin", SITE, "--port", "4000", "--dev"])).toEqual({ origin: SITE, port: "4000", dev: true });
    expect(connectCode("4000", TOKEN)).toBe(`http://127.0.0.1:4000#${TOKEN}`);
  });
  it("pairs only with an https site or a local one, and never with a path", () => {
    expect(checkOrigin(SITE)).toBeNull();
    expect(checkOrigin("http://127.0.0.1:3000")).toBeNull();
    expect(checkOrigin("http://evil.example")).toMatch(/https/);
    expect(checkOrigin(`${SITE}/somewhere`)).toMatch(/no path/);
    expect(checkOrigin("not a url")).toMatch(/not a URL/);
  });
});
