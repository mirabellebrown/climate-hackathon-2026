import { createDecision, failRun, finishRun } from "@/lib/activity";
import { corsFor } from "@/lib/bridge";
import { classify, classifyWithClaude, classifyWithClaudeCode } from "@/lib/classify";
import { runChat, SESSION_ID } from "@/lib/claude-code";
import { baselineFor, MAX_PROMPT_LENGTH, modelsFor, VENDORS } from "@/lib/config";
import { RouteFailure } from "@/lib/errors";
import { FACTORS } from "@/lib/factors";
import { generateWithApi, parseHistory } from "@/lib/generate-api";
import { generateWithGemini } from "@/lib/generate-gemini";
import { classifierScale, energyForTokens, footprintFromEnergy } from "@/lib/impact";
import { keysFor, pickVendors } from "@/lib/keys";
import { errorResponse, NO_STORE, preflight, requireLocalRequest } from "@/lib/local-api";
import { readPromptBody } from "@/lib/request";
import type { ChatReply } from "@/lib/types";

export const runtime = "nodejs";
// Vercel Hobby caps functions at 60s; long answers may need a paid plan or the local app.
export const maxDuration = 60;

/** A paired page on another origin asks permission before it may post here. */
export async function OPTIONS(request: Request): Promise<Response> { return preflight(request); }

// Web chat. One API key is enough: that vendor's small model classifies the prompt and its
// tier models answer it. Locally, with no Anthropic key, the answer still comes from the
// user's own Claude Code (tools disabled). Keys are used per request, never stored or logged.
// Answers go to that browser only; the activity store keeps numbers, never text.
export async function POST(request: Request): Promise<Response> {
  let routingId: string | undefined;
  try {
    requireLocalRequest(request);
    const keys = keysFor(request);
    const { prompt, body } = await readPromptBody(request);
    const sessionId = body.sessionId;
    if (sessionId !== undefined && (typeof sessionId !== "string" || !SESSION_ID.test(sessionId))) {
      throw new RouteFailure("INVALID_SESSION", "This conversation ID is not valid. Start a new chat.", 400, "request");
    }
    const { classifier, answerer } = pickVendors(keys);
    const history = answerer.kind === "api" ? parseHistory(body.history, MAX_PROMPT_LENGTH * 4) : [];
    const vendor = answerer.kind === "api" ? answerer.vendor : "anthropic";

    const classification = classifier.kind === "claude-code"
      ? await classifyWithClaudeCode(prompt)
      : classifier.vendor === "gemini"
        ? await classify(prompt, classifier.key)
        : await classifyWithClaude(prompt, classifier.key);

    const chosen = modelsFor(vendor)[classification.tier];
    const decision = createDecision({
      routing: {
        tier: classification.tier, reason: classification.reason,
        model: chosen.id, modelName: chosen.name,
        classifierModel: classification.model, classifierFallback: classification.usedFallback,
        baselineModel: baselineFor(vendor).id,
      },
      usage: { classifier: classification.usage },
      classifierImpact: footprintFromEnergy(energyForTokens(classification.usage, classifierScale(classification.model))),
      methodologyVersion: FACTORS.version,
    });
    routingId = decision.id;

    const run = answerer.kind === "claude-code"
      ? await runChat(prompt, chosen.id, sessionId)
      : { ...(answerer.vendor === "anthropic"
        ? await generateWithApi(answerer.key, chosen.id, history, prompt)
        : await generateWithGemini(answerer.key, chosen.id, history, prompt)), sessionId: undefined };

    const reply: ChatReply = {
      answer: run.answer,
      sessionId: run.sessionId ?? null,
      vendor: VENDORS[vendor].label,
      result: finishRun(decision.id, run.models, run.durationMs),
    };
    return Response.json(reply, { headers: { ...NO_STORE, ...corsFor(request) } });
  } catch (error) {
    if (routingId) {
      try { failRun(routingId, error instanceof RouteFailure ? error.message : undefined); } catch { /* already evicted */ }
    }
    return errorResponse(error, request);
  }
}
