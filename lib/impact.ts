import { FACTORS } from "./factors";
import type { Footprint, Impact, ModelUsage, Tier, TokenUsage } from "./types";

export function validTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function energyForTokens(usage: TokenUsage, scale: number): number {
  if (!validTokenCount(usage.inputTokens) || !validTokenCount(usage.outputTokens)) {
    throw new Error("Token counts must be nonnegative safe integers.");
  }
  if (!Number.isFinite(scale) || scale < 0) throw new Error("Invalid model scale.");
  return (usage.inputTokens * FACTORS.sonnetInputWhPerToken
    + usage.outputTokens * FACTORS.sonnetOutputWhPerToken) * scale;
}

// Signed energy is intentional: negative savings mean extra impact.
export function footprintFromEnergy(energyWh: number): Footprint {
  if (!Number.isFinite(energyWh)) throw new Error("Energy must be finite.");
  const co2eGrams = energyWh * FACTORS.carbonGramsPerWh;
  const treeYears = co2eGrams / FACTORS.treeGramsPerYear;
  return {
    energyWh,
    co2eGrams,
    waterLiters: (energyWh / 1000) * FACTORS.waterLitersPerKwh,
    gasolineGallons: co2eGrams / FACTORS.gasolineGramsPerGallon,
    treeYears,
    treeMinutes: treeYears * FACTORS.minutesPerYear,
  };
}

export function calculateImpact(tier: Tier, generationUsage: TokenUsage, classifierUsage: TokenUsage): Impact {
  const generation = footprintFromEnergy(energyForTokens(generationUsage, FACTORS.scale[tier]));
  const classifier = footprintFromEnergy(energyForTokens(classifierUsage, FACTORS.scale.classifier));
  const routed = footprintFromEnergy(generation.energyWh + classifier.energyWh);
  // A counterfactual only. This function never calls a model.
  const baseline = footprintFromEnergy(energyForTokens(generationUsage, FACTORS.scale.heavy));
  const savedWh = baseline.energyWh - routed.energyWh;
  return {
    generation, classifier, routed, baseline,
    savings: {
      ...footprintFromEnergy(savedWh),
      percent: baseline.energyWh === 0 ? null : (savedWh / baseline.energyWh) * 100,
    },
    methodologyVersion: FACTORS.version,
  };
}

/**
 * Model family to energy tier. The Gemini rows apply the same light/medium/heavy scales as
 * the Claude rows: an assumption, not a measurement, and the same one feat/claude-api-router
 * uses so both branches report comparable figures. See METHODOLOGY.md.
 */
export function tierForModel(model: string): Tier | null {
  if (/^claude-haiku-/.test(model)) return "light";
  if (/^claude-sonnet-/.test(model)) return "medium";
  if (/^claude-opus-/.test(model)) return "heavy";
  if (/^gemini-[\d.]+-flash-lite/.test(model)) return "light";
  if (/^gemini-[\d.]+-flash/.test(model)) return "medium";
  if (/^gemini-[\d.]+-pro/.test(model)) return "heavy";
  return null;
}

/**
 * Classifier scale. Flash Lite keeps the 0.25 assumption; a Claude Haiku classifier is a
 * light-tier model, so it is priced at the light scale rather than the cheaper Flash Lite one.
 */
export function classifierScale(model?: string): number {
  if (!model) return FACTORS.scale.classifier;
  if (/flash-lite/.test(model)) return FACTORS.scale.classifier;
  const tier = tierForModel(model);
  return tier ? FACTORS.scale[tier] : FACTORS.scale.classifier;
}

export function totalModelTokens(models: ModelUsage[]): TokenUsage {
  return models.reduce((sum, model) => ({
    inputTokens: sum.inputTokens + model.inputTokens + model.cacheReadInputTokens + model.cacheCreationInputTokens,
    outputTokens: sum.outputTokens + model.outputTokens,
  }), { inputTokens: 0, outputTokens: 0 });
}

export function calculateObservedImpact(models: ModelUsage[], classifierUsage: TokenUsage, classifierModel?: string): Impact {
  if (!models.length) throw new Error("Model usage is required.");
  const generationWh = models.reduce((sum, model) => {
    const tier = tierForModel(model.model);
    if (!tier) throw new Error(`No impact factor for ${model.model}.`);
    if (![model.inputTokens, model.outputTokens, model.cacheReadInputTokens, model.cacheCreationInputTokens].every(validTokenCount)) throw new Error("Invalid model usage.");
    return sum + energyForTokens(totalModelTokens([model]), FACTORS.scale[tier]);
  }, 0);
  const classifier = footprintFromEnergy(energyForTokens(classifierUsage, classifierScale(classifierModel)));
  const routed = footprintFromEnergy(generationWh + classifier.energyWh);
  const baseline = footprintFromEnergy(energyForTokens(totalModelTokens(models), FACTORS.scale.heavy));
  const savedWh = baseline.energyWh - routed.energyWh;
  return {
    generation: footprintFromEnergy(generationWh), classifier, routed, baseline,
    savings: { ...footprintFromEnergy(savedWh), percent: baseline.energyWh ? savedWh / baseline.energyWh * 100 : null },
    methodologyVersion: FACTORS.version,
  };
}
