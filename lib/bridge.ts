import "server-only";
import { timingSafeEqual } from "node:crypto";
import { RouteFailure } from "./errors";

// Pairing, so a visitor on the deployed site can use the Claude Code on their OWN machine.
//
// The deployed page never talks to anyone else's computer: the browser calls the copy of this
// app running on the same machine as the person typing. That call is cross-origin, so it is
// refused unless the person started their app with both an allowed origin and a pairing token
// and pasted that token into the page. `npm run pair` prints the code that carries them.
//
// The token is a bearer secret for one local app; it grants nothing beyond this app's chat,
// which runs Claude Code with tools off. It is never stored server-side or written to the log.

export const PAIR_HEADER = "x-canopy-pair";
const ALLOWED_HEADERS = ["content-type", PAIR_HEADER, "x-gemini-key", "x-anthropic-key"].join(", ");

/** Origins this local app was told to accept, e.g. the deployed site the user opened. */
export function pairedOrigins(): string[] {
  return (process.env.CANOPY_ALLOW_ORIGIN ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

export const pairToken = () => process.env.CANOPY_PAIR_TOKEN?.trim() || undefined;

/** Pairing is off unless the user started the app with both an origin and a token. */
export const pairingEnabled = () => pairedOrigins().length > 0 && !!pairToken();

export const isPairedOrigin = (origin: string) => pairingEnabled() && pairedOrigins().includes(origin);

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The paired page proves itself with the token; anything else is refused. */
export function requirePairToken(request: Request) {
  const token = pairToken();
  const sent = request.headers.get(PAIR_HEADER)?.trim();
  if (!token || !sent || !sameSecret(sent, token)) {
    throw new RouteFailure("NOT_PAIRED", "This app is not paired with that page. Run `npm run pair` and paste the code it prints.", 403, "request");
  }
}

/**
 * CORS for a paired origin. `Access-Control-Allow-Private-Network` is what Chrome asked for
 * before 2026; current Chrome gates loopback behind the Local Network Access permission
 * instead, and ignores the header. Sending it keeps older browsers working.
 */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/** CORS headers to put on a reply, when this request came from a paired origin. */
export function corsFor(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin && isPairedOrigin(origin) ? corsHeaders(origin) : {};
}
