// Pure helpers for the canopy launcher. No I/O here so they can be unit-tested.

export const DEFAULT_SERVER = "http://127.0.0.1:3000";
export const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export const USAGE = `Usage: canopy [options] <prompt...>
       echo "prompt" | canopy [options]

Classifies your prompt with the local Canopy server, then runs it in your own
Claude Code with the smallest suitable model and reports token usage back.

Options:
  --server <url>          Canopy server (default ${DEFAULT_SERVER}, or $CANOPY_URL)
  --resume <session-id>   Continue a Claude Code session (printed after each run)
  --continue              Continue the most recent Claude Code session in this folder
  --allowed-tools <list>  Tools Claude Code may use without asking, e.g. "Read Grep"
  --dry-run               Only show the routing decision; do not run Claude Code
  -h, --help              Show this help

Tools that would need approval are denied automatically in this non-interactive
mode. Pre-approve them with --allowed-tools or your Claude Code settings.`;

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {{ prompt: string, server?: string, resume?: string, continue: boolean, allowedTools?: string, dryRun: boolean, help: boolean, error?: string }} */
  const options = { prompt: "", continue: false, dryRun: false, help: false };
  const words = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined || next.startsWith("--")) options.error = `${arg} needs a value.`;
      return next;
    };
    if (arg === "--") { words.push(...argv.slice(index + 1)); break; }
    else if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "--server") options.server = value();
    else if (arg === "--resume") options.resume = value();
    else if (arg === "--continue") options.continue = true;
    else if (arg === "--allowed-tools") options.allowedTools = value();
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--")) options.error = `Unknown option ${arg}. Use -- before a prompt that starts with --.`;
    else words.push(arg);
  }
  if (options.resume !== undefined && !/^[\w-]{1,100}$/.test(options.resume)) options.error = "--resume needs a Claude Code session ID.";
  if (options.resume && options.continue) options.error = "Use either --resume or --continue, not both.";
  options.prompt = words.join(" ");
  return options;
}

/** Only ever send prompts to a Canopy server on this computer. */
export function resolveServer(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Invalid Canopy server URL: ${value}`); }
  if (!["http:", "https:"].includes(url.protocol) || !LOCAL_HOSTS.includes(url.hostname)) {
    throw new Error("The Canopy server must run on this computer (localhost or 127.0.0.1).");
  }
  return url.origin;
}

/** Arguments for `claude`. The prompt is sent through stdin, never as an argument. */
export function buildClaudeArgs({ model, resume, continue: continueLast, allowedTools }) {
  const args = ["-p", "--model", model, "--output-format", "json", "--permission-prompts", "none"];
  if (resume) args.push("--resume", resume);
  if (continueLast) args.push("--continue");
  if (allowedTools) args.push("--allowed-tools", allowedTools);
  return args;
}

/** Claude Code keeps its own authentication. Canopy's own secrets never reach the child. */
export function childEnv(env) {
  const copy = { ...env };
  for (const key of Object.keys(copy)) if (key === "GEMINI_API_KEY" || key.startsWith("CANOPY_")) delete copy[key];
  return copy;
}

const count = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/**
 * Parse `claude -p --output-format json`. Returns the answer and per-model usage,
 * or the reason usage cannot be trusted. Never fills in missing counts.
 */
export function parseClaudeResult(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, kind: "malformed", message: "Claude Code did not return JSON output." }; }
  if (typeof data !== "object" || data === null || data.type !== "result") {
    return { ok: false, kind: "malformed", message: "Claude Code returned an unexpected result format." };
  }
  const answer = typeof data.result === "string" ? data.result : "";
  const sessionId = typeof data.session_id === "string" ? data.session_id : undefined;
  const durationMs = count(data.duration_ms) ? data.duration_ms : undefined;
  if (data.is_error || data.subtype !== "success") {
    const message = answer.trim() || `Claude Code stopped (${String(data.subtype ?? "error")}).`;
    return { ok: false, kind: "cli_error", message, sessionId, loginProblem: /log ?in|logged|auth|credential|api key/i.test(message) };
  }
  const usage = data.modelUsage;
  const models = typeof usage === "object" && usage !== null ? Object.entries(usage).map(([model, value]) => ({
    model,
    inputTokens: value?.inputTokens, outputTokens: value?.outputTokens,
    cacheReadInputTokens: value?.cacheReadInputTokens, cacheCreationInputTokens: value?.cacheCreationInputTokens,
  })) : [];
  const valid = models.length > 0 && models.every((model) => count(model.inputTokens) && count(model.outputTokens)
    && count(model.cacheReadInputTokens) && count(model.cacheCreationInputTokens));
  if (!valid) return { ok: false, kind: "missing_usage", answer, sessionId, message: "Claude Code did not report valid per-model token usage." };
  return { ok: true, answer, sessionId, durationMs, models, permissionDenials: Array.isArray(data.permission_denials) ? data.permission_denials.length : 0 };
}

const fmt = (value) => {
  if (value === 0) return "0";
  if (Math.abs(value) < 0.001) return value.toExponential(2);
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 }).format(value);
};

/** One-line terminal summary of a completed RouteResult. */
export function summarize(result) {
  const { impact, usage } = result;
  const tokens = usage.generation.inputTokens + usage.generation.outputTokens;
  const pct = impact.savings.percent;
  const verdict = pct === null ? "no baseline" : `${Math.abs(pct).toFixed(1)}% ${pct >= 0 ? "less" : "more"} than always using Opus`;
  return `≈ ${fmt(impact.routed.energyWh)} Wh · ${fmt(impact.routed.co2eGrams)} g CO₂e for ${tokens.toLocaleString("en-US")} tokens — ${verdict}`;
}
