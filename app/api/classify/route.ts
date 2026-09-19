import { classify } from "@/lib/classify";
import { BASELINE_MODEL, MODELS } from "@/lib/config";
import { RouteFailure } from "@/lib/errors";
import { FACTORS } from "@/lib/factors";
import { energyForTokens, footprintFromEnergy } from "@/lib/impact";
import { readPrompt, requireKeys } from "@/lib/request";

export const runtime = "nodejs";
export const maxDuration = 70;
const headers = { "Cache-Control": "no-store" };

// Companion integrations choose a model here, then generate inside the user's
// own Claude application. No Anthropic credential or generation call is needed.
export async function POST(request: Request): Promise<Response> {
  try {
    const prompt = await readPrompt(request);
    requireKeys(["GEMINI_API_KEY"]);
    const decision = await classify(prompt);
    return Response.json({
      routing: {
        tier: decision.tier, reason: decision.reason,
        model: MODELS[decision.tier].id, modelName: MODELS[decision.tier].name,
        classifierModel: decision.model, classifierFallback: decision.usedFallback,
        baselineModel: BASELINE_MODEL.id,
      },
      usage: { classifier: decision.usage },
      classifierImpact: footprintFromEnergy(energyForTokens(decision.usage, FACTORS.scale.classifier)),
      methodologyVersion: FACTORS.version,
    }, { headers });
  } catch (error) {
    const failure = error instanceof RouteFailure ? error : new RouteFailure("INTERNAL_ERROR", "The routing decision could not be completed. Please try again.", 500, "request");
    return Response.json({ error: { code: failure.code, message: failure.message, stage: failure.stage } }, { status: failure.status, headers });
  }
}
