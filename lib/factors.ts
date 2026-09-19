// Frozen v2 assumptions. EcoLogits supplies live energy/GWP/water; these values remain
// the offline fallback and EPA equivalencies. See METHODOLOGY.md.
export const FACTORS = {
  version: "2026-09-19-v2",
  sonnetInputWhPerToken: 1.35e-4,
  sonnetOutputWhPerToken: 2.88e-3,
  // light = Flash Lite, medium = Flash, heavy = Pro. Classifier is also Flash Lite but a short JSON call.
  scale: { light: 0.5, medium: 1, heavy: 2, classifier: 0.25 },
  carbonGramsPerWh: 0.287,
  waterLitersPerKwh: 1.8,
  gasolineGramsPerGallon: 8_887,
  treeGramsPerYear: 60_000,
  minutesPerYear: 365 * 24 * 60,
} as const;

/** Paid Gemini Developer API rates, USD per 1M tokens. Prompts ≤ 200k unless noted. */
export const PRICES = {
  longContextTokens: 200_000,
  perMillion: {
    "gemini-3.5-flash-lite": { input: 0.30, output: 2.50 },
    "gemini-3.6-flash": { input: 0.75, output: 3.75 },
    "gemini-3.1-pro-preview": { input: 2.00, output: 12.00 },
    "gemini-3.1-flash-lite": { input: 0.25, output: 1.50 },
  },
  longContext: {
    "gemini-3.1-pro-preview": { input: 4.00, output: 18.00 },
  },
} as const;

/** EcoLogits catalog names when our pinned Gemini id is not listed yet. */
export const ECOLOGITS_MODEL = {
  "gemini-3.5-flash-lite": "gemini-flash-lite-latest",
  "gemini-3.6-flash": "gemini-3.5-flash",
} as const;

export const SOURCES = {
  codecarbon: "https://codecarbon.io/",
  ecologits: "https://ecologits.ai/",
  ecologitsApi: "https://api.ecologits.ai/docs",
  pricing: "https://ai.google.dev/gemini-api/docs/pricing",
  paper: "https://arxiv.org/abs/2505.09598",
  factors: "https://github.com/gwittebolle/claude-carbon/blob/main/METHODOLOGY.md",
  epa: "https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references",
} as const;
