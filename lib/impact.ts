import { BASELINE_MODEL, CLASSIFIER_MODEL, MODELS } from "./config";
import { FACTORS, PRICES } from "./factors";
import type { CostBreakdown, Footprint, Impact, ModelUsage, Tier, TokenUsage } from "./types";

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

export function priceFor(model: string, inputTokens: number): { input: number; output: number } {
  const catalog = PRICES.perMillion as Record<string, { input: number; output: number }>;
  const rates = catalog[model];
  if (!rates) throw new Error(`No paid-tier price for ${model}.`);
  const long = (PRICES.longContext as Record<string, { input: number; output: number }>)[model];
  if (long && inputTokens > PRICES.longContextTokens) return long;
  return rates;
}

export function costUsd(model: string, usage: TokenUsage): number {
  if (!validTokenCount(usage.inputTokens) || !validTokenCount(usage.outputTokens)) {
    throw new Error("Token counts must be nonnegative safe integers.");
  }
  const rates = priceFor(model, usage.inputTokens);
  return (usage.inputTokens * rates.input + usage.outputTokens * rates.output) / 1_000_000;
}

export function compareCost(
  generationModel: string,
  generation: TokenUsage,
  classifierModel: string,
  classifier: TokenUsage,
  baselineModel = BASELINE_MODEL.id,
): CostBreakdown {
  const generationUsd = costUsd(generationModel, generation);
  const classifierUsd = costUsd(classifierModel, classifier);
  const baselineUsd = costUsd(baselineModel, generation);
  const routed = generationUsd + classifierUsd;
  const savings = baselineUsd - routed;
  return {
    generation: generationUsd,
    classifier: classifierUsd,
    routed,
    baseline: baselineUsd,
    savings,
    percent: baselineUsd === 0 ? null : (savings / baselineUsd) * 100,
  };
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

export function footprintFromImpacts(energyWh: number, co2eGrams: number, waterLiters: number): Footprint {
  if (![energyWh, co2eGrams, waterLiters].every(Number.isFinite)) throw new Error("Impact values must be finite.");
  const treeYears = co2eGrams / FACTORS.treeGramsPerYear;
  return {
    energyWh,
    co2eGrams,
    waterLiters,
    gasolineGallons: co2eGrams / FACTORS.gasolineGramsPerGallon,
    treeYears,
    treeMinutes: treeYears * FACTORS.minutesPerYear,
  };
}

export function compareUsage(generation: TokenUsage, classifier: TokenUsage): {
  classifier: TokenUsage;
  generation: TokenUsage;
  baseline: TokenUsage;
  total: TokenUsage;
} {
  return {
    classifier,
    generation,
    baseline: { inputTokens: generation.inputTokens, outputTokens: generation.outputTokens },
    total: {
      inputTokens: classifier.inputTokens + generation.inputTokens,
      outputTokens: classifier.outputTokens + generation.outputTokens,
    },
  };
}

export function assembleImpact(
  generation: Footprint,
  classifier: Footprint,
  baseline: Footprint,
  cost: CostBreakdown,
  environmentalSource: Impact["environmentalSource"],
): Impact {
  const routed = footprintFromImpacts(
    generation.energyWh + classifier.energyWh,
    generation.co2eGrams + classifier.co2eGrams,
    generation.waterLiters + classifier.waterLiters,
  );
  const savedWh = baseline.energyWh - routed.energyWh;
  const savedCo2 = baseline.co2eGrams - routed.co2eGrams;
  const savedWater = baseline.waterLiters - routed.waterLiters;
  return {
    generation, classifier, routed, baseline,
    savings: {
      ...footprintFromImpacts(savedWh, savedCo2, savedWater),
      percent: baseline.energyWh === 0 ? null : (savedWh / baseline.energyWh) * 100,
    },
    cost,
    environmentalSource,
    methodologyVersion: FACTORS.version,
  };
}

export function calculateImpact(
  tier: Tier,
  generationUsage: TokenUsage,
  classifierUsage: TokenUsage,
  classifierModel: string = CLASSIFIER_MODEL,
): Impact {
  const generation = footprintFromEnergy(energyForTokens(generationUsage, FACTORS.scale[tier]));
  const classifier = footprintFromEnergy(energyForTokens(classifierUsage, FACTORS.scale.classifier));
  const baseline = footprintFromEnergy(energyForTokens(generationUsage, FACTORS.scale.heavy));
  return assembleImpact(
    generation,
    classifier,
    baseline,
    compareCost(MODELS[tier].id, generationUsage, classifierModel, classifierUsage),
    "fallback",
  );
}

export function tierForModel(model: string): Tier | null {
  if (/flash-lite/i.test(model)) return "light";
  if (/flash/i.test(model)) return "medium";
  if (/pro/i.test(model)) return "heavy";
  return null;
}

export function totalModelTokens(models: ModelUsage[]): TokenUsage {
  return models.reduce((sum, model) => ({
    inputTokens: sum.inputTokens + model.inputTokens + model.cacheReadInputTokens + model.cacheCreationInputTokens,
    outputTokens: sum.outputTokens + model.outputTokens,
  }), { inputTokens: 0, outputTokens: 0 });
}

export function calculateObservedImpact(models: ModelUsage[], classifierUsage: TokenUsage, classifierModel: string = CLASSIFIER_MODEL): Impact {
  if (!models.length) throw new Error("Model usage is required.");
  const generationWh = models.reduce((sum, model) => {
    const tier = tierForModel(model.model);
    if (!tier) throw new Error(`No impact factor for ${model.model}.`);
    if (![model.inputTokens, model.outputTokens, model.cacheReadInputTokens, model.cacheCreationInputTokens].every(validTokenCount)) throw new Error("Invalid model usage.");
    return sum + energyForTokens(totalModelTokens([model]), FACTORS.scale[tier]);
  }, 0);
  const generationUsage = totalModelTokens(models);
  const generationUsd = models.reduce((sum, model) => sum + costUsd(model.model, totalModelTokens([model])), 0);
  const classifierUsd = costUsd(classifierModel, classifierUsage);
  const baselineUsd = costUsd(BASELINE_MODEL.id, generationUsage);
  const routedUsd = generationUsd + classifierUsd;
  const cost: CostBreakdown = {
    generation: generationUsd,
    classifier: classifierUsd,
    routed: routedUsd,
    baseline: baselineUsd,
    savings: baselineUsd - routedUsd,
    percent: baselineUsd === 0 ? null : (baselineUsd - routedUsd) / baselineUsd * 100,
  };
  return assembleImpact(
    footprintFromEnergy(generationWh),
    footprintFromEnergy(energyForTokens(classifierUsage, FACTORS.scale.classifier)),
    footprintFromEnergy(energyForTokens(generationUsage, FACTORS.scale.heavy)),
    cost,
    "fallback",
  );
}
