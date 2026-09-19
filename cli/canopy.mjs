#!/usr/bin/env node
// canopy: route a prompt to the smallest suitable Claude model, run it in the
// user's own Claude Code, and report numeric usage to the local Canopy dashboard.
import { spawn } from "node:child_process";
import { buildClaudeArgs, childEnv, DEFAULT_SERVER, parseArgs, parseClaudeResult, resolveServer, summarize, USAGE } from "./lib.mjs";

const log = (message = "") => process.stderr.write(`${message}\n`);
const dim = (text) => (process.stderr.isTTY ? `\x1b[2m${text}\x1b[0m` : text);
const green = (text) => (process.stderr.isTTY ? `\x1b[32m${text}\x1b[0m` : text);

function fail(message, code = 1) {
  log(`canopy: ${message}`);
  process.exit(code);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function post(server, path, body, timeoutMs) {
  const response = await fetch(`${server}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => null);
  // A failed run's activity has its own `error` text; only an error object means the request failed.
  if (!response.ok || !data || typeof data.error === "object") {
    throw new Error(data?.error?.message ?? `The Canopy server responded with HTTP ${response.status}.`);
  }
  return data;
}

async function report(server, body) {
  try { return await post(server, "/api/usage", body, 10_000); }
  catch (error) { log(dim(`canopy: could not report usage to the dashboard (${error.message})`)); return null; }
}

function runClaude(args, prompt) {
  return new Promise((resolve) => {
    const child = spawn(process.env.CANOPY_CLAUDE_BIN || "claude", args, { stdio: ["pipe", "pipe", "inherit"], env: childEnv(process.env) });
    let stdout = "";
    let cancelled = false;
    const onSignal = () => { cancelled = true; child.kill("SIGINT"); };
    process.on("SIGINT", onSignal);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stdin.on("error", () => {}); // The child may exit before reading stdin.
    child.on("error", (error) => { process.off("SIGINT", onSignal); resolve({ launchError: error }); });
    child.on("close", (code, signal) => { process.off("SIGINT", onSignal); resolve({ code, signal, stdout, cancelled }); });
    child.stdin.end(prompt);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { process.stdout.write(`${USAGE}\n`); return; }
  if (options.error) fail(`${options.error}\n\n${USAGE}`, 2);

  let prompt = options.prompt;
  if (!prompt.trim() && !process.stdin.isTTY) prompt = await readStdin();
  if (!prompt.trim()) fail(`Enter a prompt.\n\n${USAGE}`, 2);

  let server;
  try { server = resolveServer(options.server ?? process.env.CANOPY_URL ?? DEFAULT_SERVER); }
  catch (error) { fail(error.message, 2); }

  let decision;
  try { decision = await post(server, "/api/route", { prompt }, 75_000); }
  catch (error) {
    const unreachable = error.cause?.code === "ECONNREFUSED" || /fetch failed/i.test(error.message);
    fail(unreachable ? `Can't reach Canopy at ${server}. Start it with \`npm run build && npm start\` in the Canopy folder.` : error.message);
  }
  const { routing } = decision;
  log(`${green("canopy →")} ${routing.tier} · ${routing.modelName} ${dim(`(${routing.model})`)}`);
  log(dim(`         ${routing.reason}`));

  if (options.dryRun) {
    await report(server, { id: decision.id, status: "failed", reason: "dry_run" });
    log(dim("         Dry run: Claude Code was not started."));
    return;
  }

  const started = Date.now();
  const run = await runClaude(buildClaudeArgs({ ...options, model: routing.model }), prompt);

  if (run.launchError) {
    await report(server, { id: decision.id, status: "failed", reason: "launch_failed" });
    fail(run.launchError.code === "ENOENT"
      ? "Claude Code isn't installed or isn't on your PATH. Install it from https://code.claude.com/docs, then run `claude` once to sign in."
      : `Could not start Claude Code: ${run.launchError.message}`);
  }
  if (run.cancelled || run.signal) {
    await report(server, { id: decision.id, status: "failed", reason: "cancelled" });
    fail("Cancelled. This run is not included in savings.", 130);
  }

  const parsed = parseClaudeResult(run.stdout);
  if (!parsed.ok && parsed.kind !== "missing_usage") {
    await report(server, { id: decision.id, status: "failed", reason: "cli_error" });
    const hint = parsed.loginProblem ? "\nRun `claude` and sign in with /login, then try again." : "";
    fail(`${parsed.message}${hint}`, run.code || 1);
  }

  // Print the actual answer on stdout so it can be piped; canopy's own notes stay on stderr.
  process.stdout.write(parsed.answer.endsWith("\n") ? parsed.answer : `${parsed.answer}\n`);
  log();

  if (!parsed.ok) {
    await report(server, { id: decision.id, status: "failed", reason: "missing_usage" });
    log(dim(`canopy: ${parsed.message} Impact was not estimated.`));
  } else {
    const result = await report(server, { id: decision.id, status: "completed", models: parsed.models, durationMs: parsed.durationMs ?? Date.now() - started });
    if (result?.impact) {
      log(`${green("canopy ✓")} ${summarize(result)}`);
      if (result.modelMismatch) log(dim(`         Claude Code also used: ${parsed.models.map((model) => model.model).join(", ")}`));
    }
    if (parsed.permissionDenials) log(dim(`         ${parsed.permissionDenials} tool request(s) were denied. Pre-approve tools with --allowed-tools.`));
  }
  if (parsed.sessionId) log(dim(`         Continue: canopy --resume ${parsed.sessionId} "…"`));
  log(dim(`         Dashboard: ${server}`));
}

main().catch((error) => fail(error?.message ?? String(error)));
