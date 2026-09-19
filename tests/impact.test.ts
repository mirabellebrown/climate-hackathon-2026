import { describe, expect, it } from "vitest";
import { calculateImpact, compareUsage, energyForTokens, footprintFromEnergy } from "@/lib/impact";
import type { Tier } from "@/lib/types";

describe("impact math and units", () => {
  it("puts 1k input / 1k output Flash at 3.015 Wh, within 1% of the published 2.989 Wh", () => {
    const wh = energyForTokens({ inputTokens: 1000, outputTokens: 1000 }, 1);
    expect(wh).toBeCloseTo(3.015, 10);
    expect(Math.abs(wh - 2.989) / 2.989).toBeLessThan(0.01);
    expect(footprintFromEnergy(wh).co2eGrams).toBeCloseTo(0.865305, 10);
    expect(footprintFromEnergy(wh).waterLiters).toBeCloseTo(0.005427, 10);
  });
  it("compares Gemini Pro against the same measured answer tokens without a second call", () => {
    const usage = compareUsage({ inputTokens: 1000, outputTokens: 250 }, { inputTokens: 80, outputTokens: 20 });
    expect(usage.generation).toEqual({ inputTokens: 1000, outputTokens: 250 });
    expect(usage.baseline).toEqual({ inputTokens: 1000, outputTokens: 250 });
    expect(usage.total).toEqual({ inputTokens: 1080, outputTokens: 270 });
  });
  it("uses separate input/output factors and does not apply PUE twice", () => {
    expect(energyForTokens({ inputTokens: 1000, outputTokens: 0 }, 1)).toBeCloseTo(0.135, 10);
    expect(energyForTokens({ inputTokens: 0, outputTokens: 1000 }, 1)).toBeCloseTo(2.88, 10);
  });
  it("includes classifier overhead while giving the baseline only generation tokens", () => {
    const impact = calculateImpact("medium", { inputTokens: 1000, outputTokens: 1000 }, { inputTokens: 200, outputTokens: 40 });
    expect(impact.classifier.energyWh).toBeCloseTo(0.03555, 10);
    expect(impact.routed.energyWh).toBeCloseTo(3.05055, 10);
    expect(impact.baseline.energyWh).toBeCloseTo(6.03, 10);
    expect(impact.savings.energyWh).toBeCloseTo(2.97945, 10);
    expect(impact.savings.percent).toBeCloseTo(49.41044776, 6);
    expect(impact.cost.generation).toBeCloseTo(0.0045, 10);
    expect(impact.cost.classifier).toBeCloseTo(0.00016, 10);
    expect(impact.cost.routed).toBeCloseTo(0.00466, 10);
    expect(impact.cost.baseline).toBeCloseTo(0.014, 10);
    expect(impact.cost.percent).toBeCloseTo(66.71428571, 6);
    expect(impact.environmentalSource).toBe("fallback");
  });
  it.each<[Tier, number]>([["light", 1.5075], ["medium", 3.015], ["heavy", 6.03]])("scales the %s tier", (tier, wh) => {
    expect(calculateImpact(tier, { inputTokens: 1000, outputTokens: 1000 }, { inputTokens: 0, outputTokens: 0 }).generation.energyWh).toBeCloseTo(wh, 10);
  });
  it("preserves negative savings when Gemini Pro is chosen", () => {
    const impact = calculateImpact("heavy", { inputTokens: 1000, outputTokens: 1000 }, { inputTokens: 200, outputTokens: 40 });
    expect(impact.savings.energyWh).toBeCloseTo(-0.03555, 10);
    expect(impact.savings.co2eGrams).toBeLessThan(0);
    expect(impact.savings.percent).toBeLessThan(0);
    expect(impact.cost.savings).toBeLessThan(0);
    expect(impact.cost.percent).toBeLessThan(0);
  });
  it("can show extra impact even on Flash Lite when classification dominates a tiny answer", () => {
    expect(calculateImpact("light", { inputTokens: 1, outputTokens: 1 }, { inputTokens: 1000, outputTokens: 500 }).savings.percent).toBeLessThan(0);
  });
  it("converts Wh to kWh for water and applies EPA equivalences", () => {
    const impact = footprintFromEnergy(1000);
    expect(impact.waterLiters).toBe(1.8);
    expect(impact.co2eGrams).toBe(287);
    const gasoline = footprintFromEnergy(8887 / 0.287);
    expect(gasoline.gasolineGallons).toBeCloseTo(1, 10);
    const tree = footprintFromEnergy(60000 / 0.287);
    expect(tree.treeYears).toBeCloseTo(1, 10);
    expect(tree.treeMinutes).toBeCloseTo(525600, 6);
  });
  it("does not invent savings percentages at a zero baseline", () => {
    const impact = calculateImpact("light", { inputTokens: 0, outputTokens: 0 }, { inputTokens: 10, outputTokens: 10 });
    expect(impact.savings.percent).toBeNull();
    expect(impact.savings.energyWh).toBeLessThan(0);
    expect(JSON.stringify(impact)).not.toContain("NaN");
  });
  it("prices Flash Lite vs Pro on identical answer tokens, plus classifier overhead", () => {
    const impact = calculateImpact("light", { inputTokens: 1000, outputTokens: 1000 }, { inputTokens: 200, outputTokens: 40 });
    expect(impact.cost.generation).toBeCloseTo(0.0028, 10);
    expect(impact.cost.classifier).toBeCloseTo(0.00016, 10);
    expect(impact.cost.routed).toBeCloseTo(0.00296, 10);
    expect(impact.cost.baseline).toBeCloseTo(0.014, 10);
    expect(impact.cost.savings).toBeCloseTo(0.01104, 10);
    expect(impact.cost.percent).toBeCloseTo(78.85714286, 6);
  });
  it("uses the higher Pro rate only above 200k input tokens", () => {
    const short = calculateImpact("heavy", { inputTokens: 200_000, outputTokens: 0 }, { inputTokens: 0, outputTokens: 0 });
    const long = calculateImpact("heavy", { inputTokens: 200_001, outputTokens: 0 }, { inputTokens: 0, outputTokens: 0 });
    expect(short.cost.generation).toBeCloseTo(0.4, 10);
    expect(long.cost.generation).toBeCloseTo(0.800004, 10);
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid token counts (%s)", (invalid) => {
    expect(() => energyForTokens({ inputTokens: invalid, outputTokens: 1 }, 1)).toThrow();
    expect(() => energyForTokens({ inputTokens: 1, outputTokens: invalid }, 1)).toThrow();
  });
});
