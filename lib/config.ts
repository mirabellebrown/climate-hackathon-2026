import type { Tier } from "./types";

export type Vendor = "anthropic" | "gemini";

/**
 * Each vendor routes within its own family: a small model classifies, and the tier models
 * answer. Whichever key the visitor brings does both jobs, so one key is enough.
 * Gemini ids and tiering match feat/claude-api-router, so both branches name the same models.
 */
export const VENDORS = {
  anthropic: {
    label: "Claude",
    classifier: { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
    models: {
      light: { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
      medium: { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
      heavy: { id: "claude-opus-5", name: "Claude Opus 5" },
    },
  },
  gemini: {
    label: "Gemini",
    classifier: { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
    models: {
      light: { id: "gemini-3.5-flash-lite", name: "Gemini Flash Lite" },
      medium: { id: "gemini-3.6-flash", name: "Gemini Flash" },
      heavy: { id: "gemini-3.1-pro-preview", name: "Gemini Pro" },
    },
  },
} as const satisfies Record<Vendor, { label: string; classifier: { id: string; name: string }; models: Record<Tier, { id: string; name: string }> }>;

export const MODELS = VENDORS.anthropic.models;
export const CLASSIFIER_MODEL = VENDORS.gemini.classifier.id;
// Only used when the primary returns 404. 2.5 is closed to new Gemini API users but older keys may still have it.
export const CLASSIFIER_FALLBACK_MODEL = "gemini-2.5-flash-lite";
export const BASELINE_MODEL = MODELS.heavy;
export const MAX_PROMPT_LENGTH = 20_000;

export const modelsFor = (vendor: Vendor) => VENDORS[vendor].models;
export const baselineFor = (vendor: Vendor) => VENDORS[vendor].models.heavy;
