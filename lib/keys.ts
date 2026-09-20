import "server-only";
import { RouteFailure } from "./errors";

// Bring-your-own-key handling for the hosted deployment.
//
// Keys travel in request headers, are used for that one request, and are never written to
// disk, put in a cookie, stored in the activity log, or included in an error message. The
// server keeps no key of its own unless an operator sets one in the environment.

export type Mode = "local" | "hosted";

/** Hosted whenever this is not the user's own machine (Vercel sets VERCEL=1). */
export function mode(): Mode {
  if (process.env.CANOPY_MODE === "hosted" || process.env.CANOPY_MODE === "local") return process.env.CANOPY_MODE;
  return process.env.VERCEL ? "hosted" : "local";
}

const HEADERS = { gemini: "x-gemini-key", anthropic: "x-anthropic-key" } as const;

function readKey(request: Request, which: keyof typeof HEADERS): string | undefined {
  const value = request.headers.get(HEADERS[which])?.trim();
  if (!value) return undefined;
  // Accept only the printable ASCII a provider key uses; never echo the value back.
  if (value.length > 300 || !/^[A-Za-z0-9._\-]+$/.test(value)) {
    throw new RouteFailure("INVALID_KEY", `That ${which === "gemini" ? "Gemini" : "Anthropic"} API key is not in the expected format.`, 400, "configuration");
  }
  return value;
}

export interface Keys { gemini?: string; anthropic?: string; geminiFromEnv: boolean; anthropicFromEnv: boolean }

/** A request's keys: the caller's headers first, falling back to operator-set env vars. */
export function keysFor(request: Request): Keys {
  const gemini = readKey(request, "gemini");
  const anthropic = readKey(request, "anthropic");
  const envGemini = process.env.GEMINI_API_KEY?.trim() || undefined;
  const envAnthropic = process.env.ANTHROPIC_API_KEY?.trim() || undefined;
  return {
    gemini: gemini ?? envGemini,
    anthropic: anthropic ?? envAnthropic,
    geminiFromEnv: !gemini && !!envGemini,
    anthropicFromEnv: !anthropic && !!envAnthropic,
  };
}

export function requireGemini(keys: Keys): string {
  if (!keys.gemini) {
    throw new RouteFailure("MISSING_GEMINI_KEY", mode() === "hosted"
      ? "Add your own Gemini API key in Settings to route prompts. It stays in your browser and is used only for your requests."
      : "Add GEMINI_API_KEY to .env.local on the server, then restart the app.", 503, "configuration");
  }
  return keys.gemini;
}

export function requireAnthropic(keys: Keys): string {
  if (!keys.anthropic) {
    throw new RouteFailure("MISSING_ANTHROPIC_KEY", "Add your own Anthropic API key in Settings to get answers here. A Claude subscription is separate from API access, so this needs an API key with billing.", 503, "configuration");
  }
  return keys.anthropic;
}

export type Answerer = { kind: "claude-code" } | { kind: "api"; vendor: import("./config").Vendor; key: string };

/**
 * Who classifies and who answers, from the keys at hand.
 * One key is enough: that vendor's small model routes and its bigger models answer.
 * Locally, with no Anthropic key, answers still come from the user's own Claude Code.
 */
export function pickVendors(keys: Keys, runMode: Mode = mode()): { classifier: { vendor: import("./config").Vendor; key: string }; answerer: Answerer } {
  const classifier = keys.gemini
    ? { vendor: "gemini" as const, key: keys.gemini }
    : keys.anthropic
      ? { vendor: "anthropic" as const, key: keys.anthropic }
      : null;
  if (!classifier) {
    throw new RouteFailure("MISSING_KEYS", runMode === "hosted"
      ? "Add your own Gemini or Anthropic API key in Settings. Whichever you add routes prompts and answers them; the key stays in your browser."
      : "Add GEMINI_API_KEY or ANTHROPIC_API_KEY to .env.local on the server, then restart the app.", 503, "configuration");
  }
  const answerer: Answerer = keys.anthropic
    ? { kind: "api", vendor: "anthropic", key: keys.anthropic }
    : runMode === "local"
      ? { kind: "claude-code" }
      : { kind: "api", vendor: "gemini", key: keys.gemini! };
  return { classifier, answerer };
}
