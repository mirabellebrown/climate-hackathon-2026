import { describe, expect, it } from "vitest";
import { addImpact, addRoute, cumulativeCostSeries, lifetimeSavings, parseSession } from "@/lib/session";
import { calculateImpact, compareUsage } from "@/lib/impact";
import { FACTORS } from "@/lib/factors";
import { MODELS } from "@/lib/config";
import type { RouteResult } from "@/lib/types";

const EMPTY = {
  requests: 0, routedWh: 0, baselineWh: 0, routedUsd: 0, baselineUsd: 0,
  routedCo2eGrams: 0, baselineCo2eGrams: 0, routedWaterLiters: 0, baselineWaterLiters: 0,
  chosenInputTokens: 0, chosenOutputTokens: 0, baselineInputTokens: 0, baselineOutputTokens: 0,
  entries: [],
};

function route(prompt: string, tier: "light" | "medium" | "heavy", generation = { inputTokens: 100, outputTokens: 80 }): RouteResult {
  const classifier = { inputTokens: 20, outputTokens: 10 };
  return {
    answer: "unused",
    routing: {
      tier, reason: "test", model: MODELS[tier].id, modelName: MODELS[tier].name,
      classifierModel: MODELS.light.id, classifierFallback: false, baselineModel: MODELS.heavy.id,
    },
    usage: compareUsage(generation, classifier),
    impact: calculateImpact(tier, generation, classifier),
    truncated: false,
  };
}

describe("browser session totals", () => {
  it("weights cumulative savings by impact, not by averaging request percentages", () => {
    const first = calculateImpact("light", { inputTokens: 100, outputTokens: 100 }, { inputTokens: 100, outputTokens: 50 });
    const second = calculateImpact("heavy", { inputTokens: 1000, outputTokens: 1000 }, { inputTokens: 100, outputTokens: 50 });
    const totals = addImpact(addImpact(parseSession(null), first), second);
    expect(totals.requests).toBe(2);
    expect(totals.baselineWh - totals.routedWh).toBeCloseTo(first.savings.energyWh + second.savings.energyWh, 10);
    const actualPercent = (totals.baselineWh - totals.routedWh) / totals.baselineWh * 100;
    expect(actualPercent).not.toBeCloseTo((first.savings.percent! + second.savings.percent!) / 2, 1);
    const life = lifetimeSavings(totals);
    expect(life.co2eGrams).toBeCloseTo(totals.baselineCo2eGrams - totals.routedCo2eGrams, 10);
    expect(life.waterLiters).toBeCloseTo(totals.baselineWaterLiters - totals.routedWaterLiters, 10);
  });
  it("records each prompt’s chosen-model tokens next to the Gemini Pro counterfactual", () => {
    const first = route("Why do leaves change color?", "light");
    const second = route("Design a global carbon ledger.", "heavy", { inputTokens: 400, outputTokens: 900 });
    const totals = addRoute(addRoute(parseSession(null), "Why do leaves change color?", first), "Design a global carbon ledger.", second);
    expect(totals.requests).toBe(2);
    expect(totals.entries).toHaveLength(2);
    expect(totals.entries[0].prompt).toBe("Design a global carbon ledger.");
    expect(totals.entries[0].chosen).toEqual({ inputTokens: 400, outputTokens: 900 });
    expect(totals.entries[0].baseline).toEqual({ inputTokens: 400, outputTokens: 900 });
    expect(totals.entries[1].prompt).toBe("Why do leaves change color?");
    expect(totals.chosenInputTokens).toBe(500);
    expect(totals.chosenOutputTokens).toBe(980);
    expect(totals.baselineInputTokens).toBe(500);
    expect(JSON.stringify(totals)).not.toContain("unused");
    const series = cumulativeCostSeries(totals.entries);
    expect(series).toHaveLength(2);
    expect(series[0].request).toBe(1);
    expect(series[0].actualUsd).toBeCloseTo(first.impact.cost.routed, 10);
    expect(series[0].alwaysProUsd).toBeCloseTo(first.impact.cost.baseline, 10);
    expect(series[1].actualUsd).toBeCloseTo(first.impact.cost.routed + second.impact.cost.routed, 10);
    expect(series[1].alwaysProUsd).toBeCloseTo(first.impact.cost.baseline + second.impact.cost.baseline, 10);
  });
  it("restores only valid totals with the same factor version", () => {
    expect(parseSession(JSON.stringify({ version: FACTORS.version, requests: 2, routedWh: 4, baselineWh: 9, routedUsd: 0.1, baselineUsd: 1 }))).toEqual({
      ...EMPTY, requests: 2, routedWh: 4, baselineWh: 9, routedUsd: 0.1, baselineUsd: 1,
      routedCo2eGrams: 4 * FACTORS.carbonGramsPerWh, baselineCo2eGrams: 9 * FACTORS.carbonGramsPerWh,
      routedWaterLiters: (4 / 1000) * FACTORS.waterLitersPerKwh, baselineWaterLiters: (9 / 1000) * FACTORS.waterLitersPerKwh,
    });
    expect(parseSession(JSON.stringify({ version: "old", requests: 2, routedWh: 4, baselineWh: 9 })).requests).toBe(0);
  });
  it.each(["bad json", "null", "[]", '{"requests": -1}', '{"routedWh": "100"}'])("recovers from corrupt storage: %s", (raw) => {
    expect(parseSession(raw)).toEqual(EMPTY);
  });
});
