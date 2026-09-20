import { createDecision } from "@/lib/activity";
import { classify, classifyWithClaude } from "@/lib/classify";
import { BASELINE_MODEL, MODELS } from "@/lib/config";
import { RouteFailure } from "@/lib/errors";
import { FACTORS } from "@/lib/factors";
import { energyForTokens, footprintFromEnergy } from "@/lib/impact";
import { errorResponse, NO_STORE, requireLocalRequest } from "@/lib/local-api";
import { keysFor, pickVendors } from "@/lib/keys";
import { readPrompt } from "@/lib/request";
import type { RoutingDecision } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 70;

// Classification only. Generation happens in the user's own Claude Code, started by
// the `canopy` launcher; no Anthropic credential or generation call exists here.
// The prompt is sent to Gemini but never stored in the activity list.
export async function POST(request: Request): Promise<Response> {
  try {
    requireLocalRequest(request);
    const prompt = await readPrompt(request);
    const { classifier } = pickVendors(keysFor(request));
    // The launcher's classify-only API stays key-based: it never starts Claude Code itself.
    if (classifier.kind === "claude-code") {
      throw new RouteFailure("MISSING_KEYS", "Add GEMINI_API_KEY or ANTHROPIC_API_KEY to .env.local on the server, then restart the app.", 503, "configuration");
    }
    const classification = classifier.vendor === "gemini"
      ? await classify(prompt, classifier.key)
      : await classifyWithClaude(prompt, classifier.key);
    const decision: RoutingDecision = createDecision({
      routing: {
        tier: classification.tier, reason: classification.reason,
        model: MODELS[classification.tier].id, modelName: MODELS[classification.tier].name,
        classifierModel: classification.model, classifierFallback: classification.usedFallback,
        baselineModel: BASELINE_MODEL.id,
      },
      usage: { classifier: classification.usage },
      classifierImpact: footprintFromEnergy(energyForTokens(classification.usage, FACTORS.scale.classifier)),
      methodologyVersion: FACTORS.version,
    });
    return Response.json(decision, { headers: NO_STORE });
  } catch (error) {
    // Never return raw provider errors, which may contain prompts or credentials.
    return errorResponse(error);
  }
}
