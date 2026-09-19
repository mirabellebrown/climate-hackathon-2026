import { createDecision, failRun, finishRun } from "@/lib/activity";
import { classify } from "@/lib/classify";
import { runChat, SESSION_ID } from "@/lib/claude-code";
import { BASELINE_MODEL, MODELS } from "@/lib/config";
import { RouteFailure } from "@/lib/errors";
import { FACTORS } from "@/lib/factors";
import { energyForTokens, footprintFromEnergy } from "@/lib/impact";
import { errorResponse, NO_STORE, requireLocalRequest } from "@/lib/local-api";
import { readPromptBody, requireKeys } from "@/lib/request";
import type { ChatReply } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 330;

// Web chat: classify, then run the user's own Claude Code (tools disabled) in the background.
// Answers go back to this browser only; the activity store keeps numbers, never text.
export async function POST(request: Request): Promise<Response> {
  let routingId: string | undefined;
  try {
    requireLocalRequest(request);
    const { prompt, body } = await readPromptBody(request);
    const sessionId = body.sessionId;
    if (sessionId !== undefined && (typeof sessionId !== "string" || !SESSION_ID.test(sessionId))) {
      throw new RouteFailure("INVALID_SESSION", "This conversation ID is not valid. Start a new chat.", 400, "request");
    }
    requireKeys(["GEMINI_API_KEY"]);
    const classification = await classify(prompt);
    const decision = createDecision({
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
    routingId = decision.id;
    const run = await runChat(prompt, decision.routing.model, sessionId);
    const reply: ChatReply = { answer: run.answer, sessionId: run.sessionId ?? null, result: finishRun(decision.id, run.models, run.durationMs) };
    return Response.json(reply, { headers: NO_STORE });
  } catch (error) {
    if (routingId) {
      try { failRun(routingId, error instanceof RouteFailure ? error.message : undefined); } catch { /* already evicted */ }
    }
    return errorResponse(error);
  }
}
