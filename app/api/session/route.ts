import { listActivities } from "@/lib/activity";
import { errorResponse, NO_STORE, requireLocalRequest } from "@/lib/local-api";
import type { DashboardState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    requireLocalRequest(request);
    const state: DashboardState = { configured: !!process.env.GEMINI_API_KEY?.trim(), activities: listActivities() };
    return Response.json(state, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
