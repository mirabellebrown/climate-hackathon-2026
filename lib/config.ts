import type { Tier } from "./types";

export const MODELS = {
  light: { id: "gemini-3.5-flash-lite", name: "Gemini Flash Lite" },
  medium: { id: "gemini-3.6-flash", name: "Gemini Flash" },
  heavy: { id: "gemini-3.1-pro-preview", name: "Gemini Pro" },
} as const satisfies Record<Tier, { id: string; name: string }>;

export const CLASSIFIER_MODEL = MODELS.light.id;
export const CLASSIFIER_FALLBACK_MODEL = "gemini-3.1-flash-lite";
export const BASELINE_MODEL = MODELS.heavy;
export const MAX_PROMPT_LENGTH = 20_000;
export const MAX_OUTPUT_TOKENS = 4_096;

/**
 * Prototype team API budget for the Usage Dashboard (USD).
 * Assumption: a small team’s monthly Gemini Developer API allocation.
 * Not billed or enforced — UI only, for manager budget tracking demos.
 */
export const TEAM_BUDGET_USD = 25;
