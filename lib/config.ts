import type { Tier } from "./types";

export const MODELS = {
  light: { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
  medium: { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
  heavy: { id: "claude-opus-5", name: "Claude Opus 5" },
} as const satisfies Record<Tier, { id: string; name: string }>;

export const CLASSIFIER_MODEL = "gemini-2.5-flash-lite";
export const CLASSIFIER_FALLBACK_MODEL = "gemini-3.1-flash-lite-preview";
export const BASELINE_MODEL = MODELS.heavy;
export const MAX_PROMPT_LENGTH = 20_000;
