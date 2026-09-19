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

export function tierForModel(model: string): Tier | null {
  if (/^claude-haiku-/.test(model)) return "light";
  if (/^claude-sonnet-/.test(model)) return "medium";
  if (/^claude-opus-/.test(model)) return "heavy";
  return null;
}

export function totalModelTokens(models: ModelUsage[]): TokenUsage {
  return models.reduce((sum, model) => ({
    inputTokens: sum.inputTokens + model.inputTokens + model.cacheReadInputTokens + model.cacheCreationInputTokens,
    outputTokens: sum.outputTokens + model.outputTokens,
  }), { inputTokens: 0, outputTokens: 0 });
}

export function calculateObservedImpact(models: ModelUsage[], classifierUsage: TokenUsage): Impact {
  if (!models.length) throw new Error("Model usage is required.");
  const generationWh = models.reduce((sum, model) => {
    const tier = tierForModel(model.model);
    if (!tier) throw new Error(`No impact factor for ${model.model}.`);
    if (![model.inputTokens, model.outputTokens, model.cacheReadInputTokens, model.cacheCreationInputTokens].every(validTokenCount)) throw new Error("Invalid model usage.");
    return sum + energyForTokens(totalModelTokens([model]), FACTORS.scale[tier]);
  }, 0);
  const classifier = footprintFromEnergy(energyForTokens(classifierUsage, FACTORS.scale.classifier));
  const routed = footprintFromEnergy(generationWh + classifier.energyWh);
  const baseline = footprintFromEnergy(energyForTokens(totalModelTokens(models), FACTORS.scale.heavy));
  const savedWh = baseline.energyWh - routed.energyWh;
  return {
    generation: footprintFromEnergy(generationWh), classifier, routed, baseline,
    savings: { ...footprintFromEnergy(savedWh), percent: baseline.energyWh ? savedWh / baseline.energyWh * 100 : null },
    methodologyVersion: FACTORS.version,
  };
}
