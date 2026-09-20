import "server-only";
import { GoogleGenAI } from "@google/genai";
import { RouteFailure, providerFailure } from "./errors";
import { CHAT_SYSTEM_PROMPT, type ApiRun, type ChatMessage } from "./generate-api";
import { validTokenCount } from "./impact";

// Hosted answers from Gemini, for visitors who bring only a Gemini key. One call per turn,
// with the visitor's key, never stored or logged.

const MAX_TOKENS = 8_192;

export async function generateWithGemini(apiKey: string, model: string, history: ChatMessage[], prompt: string): Promise<ApiRun> {
  const client = new GoogleGenAI({ apiKey });
  const started = Date.now();
  try {
    const response = await client.models.generateContent({
      model,
      contents: [...history, { role: "user" as const, content: prompt }].map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      config: { systemInstruction: CHAT_SYSTEM_PROMPT, maxOutputTokens: MAX_TOKENS, httpOptions: { timeout: 120_000, retryOptions: { attempts: 1 } } },
    });
    const finish = response.candidates?.[0]?.finishReason;
    if (finish !== "STOP" && finish !== "MAX_TOKENS") {
      throw new RouteFailure("PROVIDER_REFUSAL", "Gemini could not finish this answer. Try rephrasing the prompt.", 502, "generation");
    }
    const answer = (response.text ?? "").trim();
    if (!answer) throw new RouteFailure("EMPTY_ANSWER", "Gemini returned an empty answer. Please try again.", 502, "generation");
    const input = response.usageMetadata?.promptTokenCount;
    const output = response.usageMetadata?.candidatesTokenCount;
    const thoughts = response.usageMetadata?.thoughtsTokenCount ?? 0;
    const cached = response.usageMetadata?.cachedContentTokenCount ?? 0;
    if (!validTokenCount(input) || !validTokenCount(output) || !validTokenCount(thoughts) || !validTokenCount(cached)) {
      throw new RouteFailure("MISSING_USAGE", "Gemini did not report valid token usage, so impact cannot be estimated honestly.", 502, "generation");
    }
    return {
      answer,
      models: [{ model, inputTokens: Math.max(0, input - cached), outputTokens: output + thoughts, cacheReadInputTokens: cached, cacheCreationInputTokens: 0 }],
      durationMs: Date.now() - started,
    };
  } catch (error) {
    if (error instanceof RouteFailure) throw error;
    throw providerFailure(error, "Gemini", model);
  }
}
