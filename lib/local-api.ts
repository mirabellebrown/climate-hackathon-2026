import "server-only";
import { corsFor, isPairedOrigin, requirePairToken } from "./bridge";
import { RouteFailure } from "./errors";
import { mode } from "./keys";

export const NO_STORE = { "Cache-Control": "no-store" };

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

// Next normalizes request.url to "localhost", so check the real Host header instead.
// A local Host blocks DNS rebinding; a matching Origin blocks other sites posting here.
// The one exception is a page the user paired with this app themselves: that origin is
// allowed, and only when it also carries the pairing token this app was started with.
export function requireLocalRequest(request: Request) {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  let hostname: string;
  try { hostname = new URL(`http://${host}`).hostname; } catch { hostname = ""; }
  // Deployed, the app is reached over the public hostname; the same-origin check below still applies.
  if (mode() === "local" && !LOCAL_HOSTS.includes(hostname)) throw new RouteFailure("LOCAL_ONLY", "This app runs on your own computer. Use its localhost address.", 403, "request");
  const origin = request.headers.get("origin");
  if (!origin) return;
  let originHost: string;
  try { originHost = new URL(origin).host; } catch { originHost = ""; }
  if (originHost === host) return;
  if (mode() === "local" && isPairedOrigin(origin)) { requirePairToken(request); return; }
  throw new RouteFailure("INVALID_ORIGIN", "Cross-origin requests are not allowed.", 403, "request");
}

/** Preflight for a paired page; anything else gets nothing back. */
export function preflight(request: Request): Response {
  const origin = request.headers.get("origin") ?? "";
  if (mode() !== "local" || !isPairedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsFor(request) });
}

export function errorResponse(error: unknown, request?: Request) {
  const failure = error instanceof RouteFailure ? error : new RouteFailure("INTERNAL_ERROR", "The local router could not complete this request.", 500, "request");
  return Response.json({ error: { code: failure.code, message: failure.message, stage: failure.stage } },
    { status: failure.status, headers: { ...NO_STORE, ...(request ? corsFor(request) : {}) } });
}
