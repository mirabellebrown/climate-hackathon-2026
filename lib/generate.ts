import "server-only";
import { GoogleGenAI } from "@google/genai";
import { MAX_OUTPUT_TOKENS, MODELS } from "./config";
import { providerFailure, RouteFailure } from "./errors";
import { validTokenCount } from "./impact";
import type { Tier, TokenUsage } from "./types";

export interface Generation {
  answer: string;
  usage: TokenUsage;
  truncated: boolean;
}

export async function generate(prompt: string, tier: Tier): Promise<Generation> {
  const model = MODELS[tier].id;
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const response = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        httpOptions: { timeout: 90_000, retryOptions: { attempts: 1 } },
      },
    });
    const finish = response.candidates?.[0]?.finishReason;
    if (finish !== "STOP" && finish !== "MAX_TOKENS") {
      throw new RouteFailure("GENERATION_INCOMPLETE", "Gemini could not finish answering this prompt. Try rephrasing it.", 502, "generation");
    }
    const inputTokens = response.usageMetadata?.promptTokenCount;
    const candidates = response.usageMetadata?.candidatesTokenCount;
    const thoughts = response.usageMetadata?.thoughtsTokenCount ?? 0;
    if (!validTokenCount(inputTokens) || !validTokenCount(candidates) || !validTokenCount(thoughts)) {
      throw new RouteFailure("MISSING_USAGE", "Gemini did not provide valid token usage, so impact cannot be estimated honestly. Please try again.", 502, "generation");
    }
    return {
      answer: response.text ?? "",
      usage: { inputTokens, outputTokens: candidates + thoughts },
      truncated: finish === "MAX_TOKENS",
    };
  } catch (error) {
    throw providerFailure(error, "Gemini", model, "generation");
  }
}
