import { listActivities } from "@/lib/activity";
import { keysFor, mode } from "@/lib/keys";
import { errorResponse, NO_STORE, requireLocalRequest } from "@/lib/local-api";
import type { DashboardState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    requireLocalRequest(request);
    const keys = keysFor(request);
    const state: DashboardState = {
      configured: !!keys.gemini,
      mode: mode(),
      // Which keys the server itself holds, so the browser knows what it must supply.
      serverKeys: { gemini: keys.geminiFromEnv, anthropic: keys.anthropicFromEnv },
      activities: listActivities(),
    };
    return Response.json(state, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
