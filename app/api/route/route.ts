import { classify } from "@/lib/classify";
import { BASELINE_MODEL, MODELS } from "@/lib/config";
import { RouteFailure } from "@/lib/errors";
import { generate } from "@/lib/generate";
import { calculateImpact } from "@/lib/impact";
import { readPrompt, requireKeys } from "@/lib/request";
import type { RouteError, RouteResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  try {
    const prompt = await readPrompt(request);
    requireKeys(["GEMINI_API_KEY", "ANTHROPIC_API_KEY"]);
    const classification = await classify(prompt);
    const generation = await generate(prompt, classification.tier);
    const result: RouteResult = {
      answer: generation.answer,
      routing: {
        tier: classification.tier, reason: classification.reason,
        model: MODELS[classification.tier].id, modelName: MODELS[classification.tier].name,
        classifierModel: classification.model, classifierFallback: classification.usedFallback,
        baselineModel: BASELINE_MODEL.id,
      },
      usage: {
        classifier: classification.usage, generation: generation.usage,
        total: {
          inputTokens: classification.usage.inputTokens + generation.usage.inputTokens,
          outputTokens: classification.usage.outputTokens + generation.usage.outputTokens,
        },
      },
      impact: calculateImpact(classification.tier, generation.usage, classification.usage),
      truncated: generation.truncated,
    };
    return Response.json(result, { headers });
  } catch (error) {
    // Never return raw provider errors, which may contain prompts or credentials.
    const failure = error instanceof RouteFailure ? error : new RouteFailure("INTERNAL_ERROR", "The request could not be completed. Please try again.", 500, "request");
    const result: RouteError = { error: { code: failure.code, message: failure.message, stage: failure.stage } };
    return Response.json(result, { status: failure.status, headers });
  }
}
