import { failRun, finishRun } from "@/lib/activity";
import { errorResponse, NO_STORE, requireLocalRequest } from "@/lib/local-api";
import { readUsageReport } from "@/lib/usage";

export const runtime = "nodejs";

// The launcher reports numeric Claude Code usage here. Prompts and answers are never sent.
export async function POST(request: Request): Promise<Response> {
  try {
    requireLocalRequest(request);
    const report = await readUsageReport(request);
    if (report.status === "failed") return Response.json(failRun(report.id, report.reason), { headers: NO_STORE });
    return Response.json(finishRun(report.id, report.models, report.durationMs), { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
