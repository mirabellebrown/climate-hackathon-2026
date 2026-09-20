import { corsFor, pairingEnabled } from "@/lib/bridge";
import { errorResponse, NO_STORE, preflight, requireLocalRequest } from "@/lib/local-api";

export const runtime = "nodejs";

/** Preflight for the paired page's connection check. */
export async function OPTIONS(request: Request): Promise<Response> { return preflight(request); }

/**
 * A paired page calls this once to confirm it can reach this machine before sending a prompt,
 * which is also what makes the browser ask its owner for local network permission. It answers
 * only for the origin this app was paired with, and only with the right token.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    requireLocalRequest(request);
    return Response.json({ paired: pairingEnabled(), app: "canopy" }, { headers: { ...NO_STORE, ...corsFor(request) } });
  } catch (error) {
    return errorResponse(error, request);
  }
}
