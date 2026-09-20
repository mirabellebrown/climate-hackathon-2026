import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { RouteFailure, providerFailure } from "./errors";
import { validTokenCount } from "./impact";
import type { ModelUsage } from "./types";

// Hosted answers: the Anthropic API, called with the visitor's own key for one request.
// Used where Claude Code cannot run (any deployment). The key is never stored or logged.

export const CHAT_SYSTEM_PROMPT = "You are Claude, a helpful, thoughtful general-purpose assistant. Answer any kind of question clearly and directly, in Markdown. You have no tools available.";
const MAX_TOKENS = 8_192;
export const MAX_HISTORY_MESSAGES = 40;

export interface ChatMessage { role: "user" | "assistant"; content: string }

export interface ApiRun { answer: string; models: ModelUsage[]; durationMs: number }

/** One Messages API call on the routed model, returning the answer and its real usage. */
export async function generateWithApi(apiKey: string, model: string, history: ChatMessage[], prompt: string): Promise<ApiRun> {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 120_000 });
  const started = Date.now();
  try {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: CHAT_SYSTEM_PROMPT,
      messages: [...history, { role: "user" as const, content: prompt }],
    });
    // Safety classifiers can decline a request with HTTP 200; never treat that as an answer.
    if (response.stop_reason === "refusal") {
      throw new RouteFailure("PROVIDER_REFUSAL", "Claude declined to answer this request. Try rephrasing it.", 502, "generation");
    }
    const answer = response.content.filter((block) => block.type === "text").map((block) => block.text).join("").trim();
    if (!answer) throw new RouteFailure("EMPTY_ANSWER", "Claude returned an empty answer. Please try again.", 502, "generation");
    const usage = response.usage;
    const counts = {
      model: response.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    };
    if (![counts.inputTokens, counts.outputTokens, counts.cacheReadInputTokens, counts.cacheCreationInputTokens].every(validTokenCount)) {
      throw new RouteFailure("MISSING_USAGE", "The API did not report valid token usage, so impact cannot be estimated honestly.", 502, "generation");
    }
    return { answer, models: [counts], durationMs: Date.now() - started };
  } catch (error) {
    if (error instanceof RouteFailure) throw error;
    // Never surface the raw provider error: it can echo the key or the prompt.
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new RouteFailure("PROVIDER_AUTH", "Anthropic rejected that API key. Check it in Settings, and that the key has API credit.", 502, "generation");
    }
    if (error instanceof Anthropic.NotFoundError) {
      throw new RouteFailure("MODEL_UNAVAILABLE", `Your Anthropic account cannot use ${model}. Check model access for your key.`, 502, "generation");
    }
    throw providerFailure(error, "Claude", model);
  }
}

/** Validates the browser-supplied conversation history before it reaches the API. */
export function parseHistory(value: unknown, maxChars: number): ChatMessage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HISTORY_MESSAGES) {
    throw new RouteFailure("INVALID_HISTORY", `Send at most ${MAX_HISTORY_MESSAGES} earlier messages.`, 400, "request");
  }
  let total = 0;
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null) throw new RouteFailure("INVALID_HISTORY", "Each earlier message must be an object.", 400, "request");
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") throw new RouteFailure("INVALID_HISTORY", "Each earlier message needs a role of user or assistant.", 400, "request");
    if (typeof content !== "string" || !content.trim()) throw new RouteFailure("INVALID_HISTORY", "Each earlier message needs text content.", 400, "request");
    total += content.length;
    if (total > maxChars) throw new RouteFailure("HISTORY_TOO_LONG", "This conversation is too long to send. Start a new conversation.", 413, "request");
    return { role, content };
  });
}
