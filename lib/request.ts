import "server-only";
import { MAX_PROMPT_LENGTH } from "./config";
import { RouteFailure } from "./errors";

export async function readPrompt(request: Request): Promise<string> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new RouteFailure("INVALID_CONTENT_TYPE", "Send a JSON body containing a prompt.", 415, "request");
  }
  const bodyText = await request.text();
  if (bodyText.length > MAX_PROMPT_LENGTH * 6 + 100) throw new RouteFailure("PROMPT_TOO_LONG", "This request is too large.", 413, "request");
  let body: unknown;
  try { body = JSON.parse(bodyText); } catch { throw new RouteFailure("INVALID_JSON", "The request body is not valid JSON.", 400, "request"); }
  if (typeof body !== "object" || body === null || !("prompt" in body) || typeof body.prompt !== "string" || !body.prompt.trim()) {
    throw new RouteFailure("INVALID_PROMPT", "Enter a prompt before routing your request.", 400, "request");
  }
  if (body.prompt.length > MAX_PROMPT_LENGTH) throw new RouteFailure("PROMPT_TOO_LONG", `Keep your prompt under ${MAX_PROMPT_LENGTH.toLocaleString("en-US")} characters.`, 413, "request");
  return body.prompt;
}

export function requireKeys(keys: string[]) {
  const missing = keys.filter((key) => !process.env[key]?.trim());
  if (missing.length) throw new RouteFailure("MISSING_API_KEYS", `Add ${missing.join(" and ")} to .env.local on the server, then restart the app.`, 503, "configuration");
}
