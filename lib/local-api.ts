import "server-only";
import { RouteFailure } from "./errors";

export const NO_STORE = { "Cache-Control": "no-store" };

export function requireLocalRequest(request: Request) {
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new RouteFailure("LOCAL_ONLY", "Canopy runs on your own computer. Use its localhost address.", 403, "request");
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) throw new RouteFailure("INVALID_ORIGIN", "Cross-origin requests are not allowed.", 403, "request");
}

export function errorResponse(error: unknown) {
  const failure = error instanceof RouteFailure ? error : new RouteFailure("INTERNAL_ERROR", "The local router could not complete this request.", 500, "request");
  return Response.json({ error: { code: failure.code, message: failure.message, stage: failure.stage } }, { status: failure.status, headers: NO_STORE });
}
