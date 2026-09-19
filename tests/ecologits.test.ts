import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateImpact, footprintFromEcologits } from "@/lib/ecologits";
import { MODELS } from "@/lib/config";

afterEach(() => {
  vi.unstubAllGlobals();
});

function ecoBody(energyKwh: number, gwpKg: number, waterL: number) {
  return {
    impacts: {
      energy: { value: { min: energyKwh, max: energyKwh }, unit: "kWh" },
      gwp: { value: { min: gwpKg, max: gwpKg }, unit: "kgCO2eq" },
      wcf: { value: { min: waterL, max: waterL }, unit: "L" },
    },
  };
}

describe("EcoLogits conversions", () => {
  it("converts kWh, kgCO2eq, and liters into the UI units plus EPA equivalencies", () => {
    const footprint = footprintFromEcologits(ecoBody(0.001, 0.0004, 0.002).impacts);
    expect(footprint.energyWh).toBeCloseTo(1, 10);
    expect(footprint.co2eGrams).toBeCloseTo(0.4, 10);
    expect(footprint.waterLiters).toBeCloseTo(0.002, 10);
    expect(footprint.gasolineGallons).toBeCloseTo(0.4 / 8887, 10);
    expect(footprint.treeYears).toBeCloseTo(0.4 / 60_000, 10);
  });
  it("uses EcoLogits midpoints for the chosen model vs Pro and still prices locally", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model_name?: string; output_token_count?: number };
      const scale = body.model_name?.includes("pro") ? 10 : body.model_name?.includes("flash-lite") ? 0.05 : 1;
      const energyKwh = ((body.output_token_count ?? 0) / 1000) * scale * 0.001;
      return new Response(JSON.stringify(ecoBody(energyKwh, energyKwh * 0.4, energyKwh * 4)), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const impact = await estimateImpact({
      tier: "light",
      generationModel: MODELS.light.id,
      classifierModel: MODELS.light.id,
      generationUsage: { inputTokens: 1000, outputTokens: 1000 },
      classifierUsage: { inputTokens: 200, outputTokens: 40 },
    });
    expect(impact.environmentalSource).toBe("ecologits");
    expect(impact.generation.energyWh).toBeCloseTo(0.05, 10);
    expect(impact.classifier.energyWh).toBeCloseTo(0.002, 10);
    expect(impact.baseline.energyWh).toBeCloseTo(10, 10);
    expect(impact.cost.routed).toBeCloseTo(0.00296, 10);
    expect(impact.cost.baseline).toBeCloseTo(0.014, 10);
    expect(impact.cost.percent).toBeCloseTo(78.85714286, 6);
  });
  it("falls back to homemade energy if EcoLogits fails, without dropping USD", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const impact = await estimateImpact({
      tier: "medium",
      generationModel: MODELS.medium.id,
      classifierModel: MODELS.light.id,
      generationUsage: { inputTokens: 1000, outputTokens: 1000 },
      classifierUsage: { inputTokens: 200, outputTokens: 40 },
    });
    expect(impact.environmentalSource).toBe("fallback");
    expect(impact.baseline.energyWh).toBeCloseTo(6.03, 10);
    expect(impact.cost.baseline).toBeCloseTo(0.014, 10);
  });
});
