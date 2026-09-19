import "server-only";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { childEnv, parseClaudeResult } from "@/cli/lib.mjs";
import { RouteFailure } from "./errors";
import type { ModelUsage } from "./types";

// Chat runs Claude Code with no tools, so a web page can never read files or run commands.
// It works in an empty folder so no project CLAUDE.md or settings leak into the conversation.
const CHAT_DIR = join(tmpdir(), "canopy-chat");
const CHAT_PROMPT = "You are answering in a web chat interface with no tools. Never emit tool calls; answer directly in Markdown.";
const TIMEOUT_MS = 5 * 60 * 1000;
export const SESSION_ID = /^[0-9a-f-]{36}$/;

export interface ChatRun { answer: string; sessionId?: string; models: ModelUsage[]; durationMs: number }

export function chatArgs(model: string, sessionId?: string): string[] {
  const args = ["-p", "--model", model, "--output-format", "json", "--permission-prompts", "none",
    "--tools", "", "--strict-mcp-config", "--append-system-prompt", CHAT_PROMPT];
  if (sessionId) args.push("--resume", sessionId);
  return args;
}

export function runChat(prompt: string, model: string, sessionId?: string): Promise<ChatRun> {
  mkdirSync(CHAT_DIR, { recursive: true });
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.CANOPY_CLAUDE_BIN || "claude", chatArgs(model, sessionId), {
      cwd: CHAT_DIR, env: childEnv(process.env), stdio: ["pipe", "pipe", "ignore"],
    });
    let stdout = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stdin.on("error", () => {});
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new RouteFailure("CLAUDE_CODE_MISSING", error.code === "ENOENT"
        ? "Claude Code isn't installed or isn't on the server's PATH. Install it, run `claude` once to sign in, then restart Canopy."
        : "Claude Code could not be started.", 503, "generation"));
    });
    child.on("close", (_code, signal) => {
      clearTimeout(timer);
      if (signal) { reject(new RouteFailure("CLAUDE_CODE_TIMEOUT", "Claude Code took too long and was stopped.", 504, "generation")); return; }
      const parsed = parseClaudeResult(stdout);
      if (!parsed.ok) {
        const login = "loginProblem" in parsed && parsed.loginProblem;
        reject(new RouteFailure(parsed.kind === "missing_usage" ? "MISSING_USAGE" : "CLAUDE_CODE_ERROR",
          login ? "Claude Code isn't signed in. Run `claude` in a terminal and use /login, then try again." : parsed.message, 502, "generation"));
        return;
      }
      resolve({ answer: parsed.answer, sessionId: parsed.sessionId, models: parsed.models as ModelUsage[], durationMs: parsed.durationMs ?? Date.now() - started });
    });
    child.stdin.end(prompt);
  });
}
