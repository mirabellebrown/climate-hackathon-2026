// Frozen v1 assumptions, not measurements of the deployed model versions.
// See METHODOLOGY.md for derivation, scope, sources, and limitations.
export const FACTORS = {
  version: "2026-09-19-v1",
  sonnetInputWhPerToken: 1.35e-4,
  sonnetOutputWhPerToken: 2.88e-3,
  scale: { light: 0.5, medium: 1, heavy: 2, classifier: 0.25 },
  carbonGramsPerWh: 0.287,
  waterLitersPerKwh: 1.8,
  gasolineGramsPerGallon: 8_887,
  treeGramsPerYear: 60_000,
  minutesPerYear: 365 * 24 * 60,
} as const;

export const SOURCES = {
  paper: "https://arxiv.org/abs/2505.09598",
  factors: "https://github.com/gwittebolle/claude-carbon/blob/main/METHODOLOGY.md",
  epa: "https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references",
} as const;
