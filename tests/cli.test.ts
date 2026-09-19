import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClaudeArgs, childEnv, parseArgs, parseClaudeResult, resolveServer } from "../cli/lib.mjs";

const CLI = fileURLToPath(new URL("../cli/canopy.mjs", import.meta.url));
const FAKE_CLAUDE = fileURLToPath(new URL("./fixtures/fake-claude.mjs", import.meta.url));
const REAL_SHAPE = {
  type: "result", subtype: "success", is_error: false, result: "ok", session_id: "abc", duration_ms: 2331,
  modelUsage: { "claude-haiku-4-5": { inputTokens: 9, outputTokens: 45, cacheReadInputTokens: 0, cacheCreationInputTokens: 27932, costUSD: 0.05 } },
  permission_denials: [],
};

describe("launcher helpers", () => {
  it("parses prompts and options", () => {
    expect(parseArgs(["Explain", "leaves"])).toMatchObject({ prompt: "Explain leaves", continue: false, dryRun: false });
    expect(parseArgs(["--resume", "abc-123", "more"])).toMatchObject({ prompt: "more", resume: "abc-123" });
    expect(parseArgs(["--", "--not-an-option"]).prompt).toBe("--not-an-option");
    expect(parseArgs(["--bogus"]).error).toContain("Unknown option");
    expect(parseArgs(["--resume"]).error).toContain("needs a value");
    expect(parseArgs(["--resume", "a;rm -rf"]).error).toBeDefined();
    expect(parseArgs(["--resume", "a", "--continue"]).error).toContain("either");
  });
  it("builds claude arguments without the prompt or any permission bypass", () => {
    const args = buildClaudeArgs({ model: "claude-sonnet-5", allowedTools: "Read Grep", resume: "s1", continue: false });
    expect(args).toEqual(["-p", "--model", "claude-sonnet-5", "--output-format", "json", "--permission-prompts", "none", "--resume", "s1", "--allowed-tools", "Read Grep"]);
    expect(args.join(" ")).not.toContain("dangerously");
  });
  it("only talks to a local Canopy server", () => {
    expect(resolveServer("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
    expect(resolveServer("http://localhost:4000")).toBe("http://localhost:4000");
    expect(() => resolveServer("https://example.com")).toThrow(/this computer/);
    expect(() => resolveServer("not a url")).toThrow();
  });
  it("keeps Canopy secrets out of Claude Code's environment", () => {
    expect(childEnv({ PATH: "/bin", GEMINI_API_KEY: "x", CANOPY_URL: "y", HOME: "/h" })).toEqual({ PATH: "/bin", HOME: "/h" });
  });
  it("reads the real Claude Code JSON shape, including cache tokens", () => {
    const parsed = parseClaudeResult(JSON.stringify(REAL_SHAPE));
    expect(parsed).toMatchObject({ ok: true, answer: "ok", sessionId: "abc", durationMs: 2331 });
    expect(parsed.models).toEqual([{ model: "claude-haiku-4-5", inputTokens: 9, outputTokens: 45, cacheReadInputTokens: 0, cacheCreationInputTokens: 27932 }]);
  });
  it("never fills in missing or invalid usage", () => {
    expect(parseClaudeResult(JSON.stringify({ ...REAL_SHAPE, modelUsage: undefined })).kind).toBe("missing_usage");
    expect(parseClaudeResult(JSON.stringify({ ...REAL_SHAPE, modelUsage: {} })).kind).toBe("missing_usage");
    const noCache = { "claude-haiku-4-5": { inputTokens: 9, outputTokens: 45 } };
    expect(parseClaudeResult(JSON.stringify({ ...REAL_SHAPE, modelUsage: noCache })).kind).toBe("missing_usage");
    expect(parseClaudeResult("oops").kind).toBe("malformed");
    expect(parseClaudeResult("[]").kind).toBe("malformed");
  });
  it("recognizes CLI errors and login problems", () => {
    const parsed = parseClaudeResult(JSON.stringify({ ...REAL_SHAPE, is_error: true, result: "Not logged in · Please run /login" }));
    expect(parsed).toMatchObject({ ok: false, kind: "cli_error", loginProblem: true });
    expect(parseClaudeResult(JSON.stringify({ ...REAL_SHAPE, subtype: "error_max_turns", result: "" })).message).toContain("error_max_turns");
  });
});

// End to end: the real launcher against a fake Canopy server and a fake `claude`.
describe("canopy launcher", () => {
  let server: Server;
  let origin = "";
  let dir = "";
  const received: { path: string; body: Record<string, unknown> }[] = [];
  let routeStatus = 200;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "canopy-cli-"));
    server = createServer((req, res) => {
      let text = "";
      req.on("data", (chunk) => { text += chunk; });
      req.on("end", () => {
        const body = JSON.parse(text || "{}");
        received.push({ path: req.url ?? "", body });
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/api/route") {
          if (routeStatus !== 200) { res.statusCode = routeStatus; res.end(JSON.stringify({ error: { code: "MISSING_API_KEYS", message: "Add GEMINI_API_KEY to .env.local on the server, then restart the app.", stage: "configuration" } })); return; }
          res.end(JSON.stringify({ id: "9b1c3f2e-0000-4000-8000-000000000001", routing: { tier: "light", reason: "Short explanation.", model: "claude-haiku-4-5", modelName: "Claude Haiku 4.5" } }));
        } else if (req.url === "/api/usage") {
          if (body.status === "failed") { res.end(JSON.stringify({ status: "failed" })); return; }
          const selected = (body.models as { model: string }[]).some((model) => model.model !== "claude-haiku-4-5");
          res.end(JSON.stringify({ modelMismatch: selected, usage: { generation: { inputTokens: 1512, outputTokens: 300 } }, impact: { routed: { energyWh: 0.53, co2eGrams: 0.15 }, savings: { percent: 74.2, energyWh: 1 } } }));
        } else { res.statusCode = 404; res.end("{}"); }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });
  afterAll(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });
  beforeEach(() => { received.length = 0; routeStatus = 200; });

  function canopy(args: string[], options: { mode?: string; stdin?: string; bin?: string } = {}) {
    const log = join(dir, `claude-${Math.random()}.log`);
    writeFileSync(log, "");
    return new Promise<{ code: number | null; stdout: string; stderr: string; calls: { argv: string[]; stdin: string; geminiKey: string | null; canopyUrl: string | null }[] }>((resolve) => {
      const child = spawn(process.execPath, [CLI, "--server", origin, ...args], {
        env: { NODE_ENV: "test", PATH: process.env.PATH, HOME: process.env.HOME, CANOPY_CLAUDE_BIN: options.bin ?? FAKE_CLAUDE, FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_MODE: options.mode ?? "", GEMINI_API_KEY: "leak-me-not", CANOPY_URL: origin },
      });
      let stdout = ""; let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.stdin.end(options.stdin ?? "");
      child.on("close", (code) => resolve({ code, stdout, stderr, calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) }));
    });
  }

  it("routes, runs Claude Code with the chosen model, prints the answer and reports usage", async () => {
    const prompt = "Explain why leaves change color; $(touch /tmp/pwned) `whoami`";
    const result = await canopy([prompt]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("Leaves change color because chlorophyll breaks down.\n");
    expect(result.stderr).toContain("Claude Haiku 4.5");
    expect(result.stderr).toContain("74.2% less");
    expect(result.stderr).toContain("canopy --resume 11111111-2222-3333-4444-555555555555");
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].argv).toEqual(["-p", "--model", "claude-haiku-4-5", "--output-format", "json", "--permission-prompts", "none"]);
    expect(result.calls[0].stdin).toBe(prompt);
    expect(result.calls[0].geminiKey).toBeNull();
    expect(result.calls[0].canopyUrl).toBeNull();
    expect(received.map((entry) => entry.path)).toEqual(["/api/route", "/api/usage"]);
    expect(received[0].body).toEqual({ prompt });
    expect(received[1].body).toEqual({
      id: "9b1c3f2e-0000-4000-8000-000000000001", status: "completed", durationMs: 4321,
      models: [{ model: "claude-haiku-4-5", inputTokens: 12, outputTokens: 300, cacheReadInputTokens: 1000, cacheCreationInputTokens: 500 }],
    });
    expect(JSON.stringify(received[1].body)).not.toContain("chlorophyll");
  });
  it("reads the prompt from stdin", async () => {
    const result = await canopy([], { stdin: "From a pipe" });
    expect(result.code).toBe(0);
    expect(result.calls[0].stdin).toBe("From a pipe");
  });
  it("mentions additional models Claude Code reported", async () => {
    const result = await canopy(["Hi"], { mode: "extra-model" });
    expect(result.stderr).toContain("also used");
  });
  it("reports a login failure without claiming usage", async () => {
    const result = await canopy(["Hi"], { mode: "login" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("/login");
    expect(result.stdout).toBe("");
    expect(received[1].body).toMatchObject({ status: "failed", reason: "cli_error" });
    expect(received[1].body).not.toHaveProperty("models");
  });
  it("still prints the answer when usage is missing, but records no estimate", async () => {
    const result = await canopy(["Hi"], { mode: "no-usage" });
    expect(result.stdout).toContain("An answer without usage.");
    expect(received[1].body).toMatchObject({ status: "failed", reason: "missing_usage" });
  });
  it("fails clearly on malformed CLI output", async () => {
    const result = await canopy(["Hi"], { mode: "garbage" });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("did not return JSON");
    expect(received[1].body).toMatchObject({ status: "failed" });
  });
  it("explains a missing claude executable", async () => {
    const result = await canopy(["Hi"], { bin: join(dir, "no-such-claude") });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("isn't installed");
    expect(received[1].body).toMatchObject({ status: "failed", reason: "launch_failed" });
  });
  it("surfaces server errors and never starts Claude Code without a decision", async () => {
    routeStatus = 503;
    const result = await canopy(["Hi"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("GEMINI_API_KEY");
    expect(result.calls).toHaveLength(0);
  });
  it("supports a dry run that spends no Claude usage", async () => {
    const result = await canopy(["--dry-run", "Hi"]);
    expect(result.code).toBe(0);
    expect(result.calls).toHaveLength(0);
    expect(received[1].body).toMatchObject({ status: "failed", reason: "dry_run" });
  });
  it("forwards Ctrl-C to Claude Code and records a cancelled run", async () => {
    const log = join(dir, "hang.log");
    const child = spawn(process.execPath, [CLI, "--server", origin, "Hi"], { env: { NODE_ENV: "test", PATH: process.env.PATH, CANOPY_CLAUDE_BIN: FAKE_CLAUDE, FAKE_CLAUDE_MODE: "hang", FAKE_CLAUDE_LOG: log } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    await new Promise<void>((resolve) => { const timer = setInterval(() => { try { if (readFileSync(log, "utf8")) { clearInterval(timer); resolve(); } } catch { /* not yet */ } }, 50); });
    child.kill("SIGINT");
    const code = await new Promise((resolve) => child.on("close", resolve));
    expect(code).toBe(130);
    expect(stderr).toContain("Cancelled");
    expect(received.at(-1)?.body).toMatchObject({ status: "failed", reason: "cancelled" });
  });
  it("refuses non-local servers before sending the prompt", async () => {
    const child = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      const proc = spawn(process.execPath, [CLI, "--server", "https://example.com", "secret prompt"], { env: { NODE_ENV: "test", PATH: process.env.PATH } });
      let stderr = ""; proc.stderr.on("data", (chunk) => { stderr += chunk; });
      proc.on("close", (code) => resolve({ code, stderr }));
    });
    expect(child.code).toBe(2);
    expect(child.stderr).toContain("this computer");
  });
});
