#!/usr/bin/env node
// Stand-in for the `claude` executable in launcher tests. Never calls a model.
import { appendFileSync } from "node:fs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const stdin = Buffer.concat(chunks).toString("utf8");
if (process.env.FAKE_CLAUDE_LOG) {
  appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ argv: process.argv.slice(2), stdin, geminiKey: process.env.GEMINI_API_KEY ?? null, canopyUrl: process.env.CANOPY_URL ?? null }) + "\n");
}
const model = process.argv[process.argv.indexOf("--model") + 1];
const usage = (name) => ({ inputTokens: 12, outputTokens: 300, cacheReadInputTokens: 1000, cacheCreationInputTokens: 500, webSearchRequests: 0, costUSD: 0.01, canonicalModel: name });
const base = { type: "result", subtype: "success", is_error: false, duration_ms: 4321, num_turns: 1, session_id: "11111111-2222-3333-4444-555555555555", permission_denials: [] };
// Routing runs with the system prompt replaced, and must answer with the classifier's JSON.
const system = process.argv[process.argv.indexOf("--system-prompt") + 1] ?? "";
if (system.includes("classify task complexity")) {
  console.log(JSON.stringify({ ...base, result: JSON.stringify({ tier: process.env.FAKE_CLAUDE_TIER ?? "light", reason: "A short everyday question." }), modelUsage: { [model]: usage(model) } }));
  process.exit(0);
}
switch (process.env.FAKE_CLAUDE_MODE) {
  case "login":
    console.log(JSON.stringify({ ...base, subtype: "success", is_error: true, result: "Not logged in · Please run /login" }));
    process.exit(1);
  case "no-usage":
    console.log(JSON.stringify({ ...base, result: "An answer without usage." }));
    break;
  case "garbage":
    console.log("this is not json");
    break;
  case "extra-model":
    console.log(JSON.stringify({ ...base, result: "Answer.", modelUsage: { [model]: usage(model), "claude-sonnet-5": usage("claude-sonnet-5") } }));
    break;
  case "hang":
    setTimeout(() => {}, 60_000);
    process.on("SIGINT", () => process.exit(130));
    break;
  default:
    console.log(JSON.stringify({ ...base, result: "Leaves change color because chlorophyll breaks down.", modelUsage: { [model]: usage(model) } }));
}
