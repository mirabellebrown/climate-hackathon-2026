import "server-only";
import { BASELINE_MODEL } from "./config";
import { ECOLOGITS_MODEL } from "./factors";
import { assembleImpact, calculateImpact, compareCost, footprintFromImpacts, validTokenCount } from "./impact";
import type { Footprint, Impact, Tier, TokenUsage } from "./types";

export const ECOLOGITS_URL = "https://api.ecologits.ai/v1beta/estimations";
export const ECOLOGITS_PROVIDER = "google_genai";
const TIMEOUT_MS = 8_000;

interface Range {
  min: number;
  max: number;
}

interface EcologitsImpacts {
  energy?: { value?: Range; unit?: string };
  gwp?: { value?: Range; unit?: string };
  wcf?: { value?: Range; unit?: string };
}

function midpoint(range: Range | undefined, unit: string, expected: string): number {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) {
    throw new Error(`EcoLogits omitted a ${expected} range.`);
  }
  if (unit && unit !== expected) throw new Error(`EcoLogits returned ${unit}, expected ${expected}.`);
  return (range.min + range.max) / 2;
}

export function footprintFromEcologits(impacts: EcologitsImpacts): Footprint {
  const energyKwh = midpoint(impacts.energy?.value, impacts.energy?.unit ?? "kWh", "kWh");
  const gwpKg = midpoint(impacts.gwp?.value, impacts.gwp?.unit ?? "kgCO2eq", "kgCO2eq");
  const waterLiters = midpoint(impacts.wcf?.value, impacts.wcf?.unit ?? "L", "L");
  return footprintFromImpacts(energyKwh * 1000, gwpKg * 1000, waterLiters);
}

export function ecologitsModelName(modelName: string): string {
  return (ECOLOGITS_MODEL as Record<string, string>)[modelName] ?? modelName;
}

export async function estimateModelFootprint(
  modelName: string,
  outputTokenCount: number,
  requestLatency?: number,
): Promise<Footprint> {
  if (!validTokenCount(outputTokenCount)) throw new Error("Token counts must be nonnegative safe integers.");
  const response = await fetch(ECOLOGITS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      provider: ECOLOGITS_PROVIDER,
      model_name: ecologitsModelName(modelName),
      output_token_count: outputTokenCount,
      electricity_mix_zone: "WOR",
      ...(typeof requestLatency === "number" && Number.isFinite(requestLatency) && requestLatency > 0
        ? { request_latency: requestLatency }
        : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`EcoLogits HTTP ${response.status}`);
  const payload = await response.json() as { impacts?: EcologitsImpacts };
  if (!payload.impacts) throw new Error("EcoLogits response missing impacts.");
  return footprintFromEcologits(payload.impacts);
}

export async function estimateImpact(input: {
  tier: Tier;
  generationModel: string;
  classifierModel: string;
  generationUsage: TokenUsage;
  classifierUsage: TokenUsage;
  generationLatencySeconds?: number;
  classifierLatencySeconds?: number;
}): Promise<Impact> {
  const cost = compareCost(
    input.generationModel,
    input.generationUsage,
    input.classifierModel,
    input.classifierUsage,
  );
  try {
    const [generation, classifier, baseline] = await Promise.all([
      estimateModelFootprint(input.generationModel, input.generationUsage.outputTokens, input.generationLatencySeconds),
      estimateModelFootprint(input.classifierModel, input.classifierUsage.outputTokens, input.classifierLatencySeconds),
      estimateModelFootprint(BASELINE_MODEL.id, input.generationUsage.outputTokens),
    ]);
    return assembleImpact(generation, classifier, baseline, cost, "ecologits");
  } catch {
    return {
      ...calculateImpact(input.tier, input.generationUsage, input.classifierUsage, input.classifierModel),
      cost,
    };
  }
}
