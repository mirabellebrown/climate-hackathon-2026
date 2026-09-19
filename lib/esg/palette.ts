// Chart palettes for the ESG section, one source of truth for CSS and the validator test.
// Values come from the dataviz reference palette; each set is validated light AND dark
// (scripts/validate_palette.js via tests/esg-palette.test.ts).

// Providers: fixed categorical order by entity, never by rank. Only three slots validate
// all-pairs (needed for the scatter), so providers beyond the first three fold to "Other".
export const PROVIDER_SLOTS = ["anthropic", "openai", "google"] as const;
export const PALETTES = {
  provider: { light: ["#2a78d6", "#eb6834", "#1baf7a"], dark: ["#3987e5", "#d95926", "#199e70"], pairs: "all" },
  // Usage vs embodied, and single-measure series: hues no provider uses.
  split: { light: ["#4a3aa7", "#e87ba4"], dark: ["#9085e9", "#d55181"], pairs: "adjacent" },
  // Change vs baseline: decrease (cool) and increase (warm) around a neutral gray.
  diverging: { light: ["#2a78d6", "#e34948"], dark: ["#3987e5", "#e66767"], pairs: "adjacent" },
} as const;

export const SURFACES = { light: "#ffffff", dark: "#1a1a19" } as const;

export function providerSlot(provider: string): 1 | 2 | 3 | null {
  const index = (PROVIDER_SLOTS as readonly string[]).indexOf(provider);
  return index < 0 ? null : (index + 1) as 1 | 2 | 3;
}

/** CSS variable for a provider's mark color; unknown providers share the neutral "Other". */
export const providerColor = (provider: string) => {
  const slot = providerSlot(provider);
  return slot ? `var(--esg-provider-${slot})` : "var(--esg-other)";
};

export const PROVIDER_LABEL: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", google: "Google", mistral: "Mistral", cohere: "Cohere", other: "Other" };
