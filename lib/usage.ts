import "server-only";
import { RouteFailure } from "./errors";
import { validTokenCount } from "./impact";
import type { ModelUsage } from "./types";

export type UsageReport =
  | { id: string; status: "completed"; models: ModelUsage[]; durationMs: number }
  | { id: string; status: "failed"; reason: string };

const invalid = (message: string) => new RouteFailure("INVALID_USAGE", message, 400, "request");
const FAILURE_REASONS: Record<string, string> = {
  cli_error: "Claude Code reported an error. See the terminal for details. No usage is included in savings.",
  missing_usage: "Claude Code finished without valid per-model usage, so impact was not estimated.",
  cancelled: "The run was cancelled in the terminal. No usage is included in savings.",
  launch_failed: "Claude Code could not be started. See the terminal for details.",
  dry_run: "Routing preview only. Claude Code was not run.",
};

export async function readUsageReport(request: Request): Promise<UsageReport> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new RouteFailure("INVALID_CONTENT_TYPE", "Send a JSON usage report.", 415, "request");
  }
  const text = await request.text();
  if (text.length > 20_000) throw new RouteFailure("REPORT_TOO_LARGE", "This usage report is too large.", 413, "request");
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new RouteFailure("INVALID_JSON", "The request body is not valid JSON.", 400, "request"); }
  if (typeof body !== "object" || body === null) throw invalid("The usage report must be an object.");
  const data = body as Record<string, unknown>;
  if (typeof data.id !== "string" || !/^[0-9a-f-]{36}$/.test(data.id)) throw invalid("The usage report needs a valid routing ID.");

  if (data.status === "failed") {
    const reason = typeof data.reason === "string" && data.reason in FAILURE_REASONS ? FAILURE_REASONS[data.reason] : FAILURE_REASONS.cli_error;
    return { id: data.id, status: "failed", reason };
  }
  if (data.status !== "completed") throw invalid("The usage report status must be completed or failed.");
  if (!validTokenCount(data.durationMs)) throw invalid("The run duration must be a nonnegative integer.");
  if (!Array.isArray(data.models) || data.models.length < 1 || data.models.length > 20) throw invalid("Report usage for 1 to 20 models.");
  const models = data.models.map((value): ModelUsage => {
    if (typeof value !== "object" || value === null) throw invalid("Each model usage entry must be an object.");
    const model = value as Record<string, unknown>;
    if (typeof model.model !== "string" || !/^[a-z0-9][a-z0-9.@:_-]{0,99}$/i.test(model.model)) throw invalid("Each model usage entry needs a model ID.");
    const counts = [model.inputTokens, model.outputTokens, model.cacheReadInputTokens, model.cacheCreationInputTokens];
    if (!counts.every(validTokenCount)) throw invalid("Token counts must be nonnegative integers.");
    return {
      model: model.model, inputTokens: model.inputTokens as number, outputTokens: model.outputTokens as number,
      cacheReadInputTokens: model.cacheReadInputTokens as number, cacheCreationInputTokens: model.cacheCreationInputTokens as number,
    };
  });
  return { id: data.id, status: "completed", models, durationMs: data.durationMs };
}
