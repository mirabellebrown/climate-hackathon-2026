import { describe, expect, it } from "vitest";
import { calculateImpact, energyForTokens, footprintFromEnergy } from "@/lib/impact";
import type { Tier } from "@/lib/types";

describe("impact math and units", () => {
  it("puts 1k input / 1k output Sonnet at 3.015 Wh, within 1% of the published 2.989 Wh", () => {
    const wh = energyForTokens({ inputTokens: 1000, outputTokens: 1000 }, 1);
    expect(wh).toBeCloseTo(3.015, 10);
    expect(Math.abs(wh - 2.989) / 2.989).toBeLessThan(0.01);
    expect(footprintFromEnergy(wh).co2eGrams).toBeCloseTo(0.865305, 10);
    expect(footprintFromEnergy(wh).waterLiters).toBeCloseTo(0.005427, 10);
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
  });
  it.each<[Tier, number]>([["light", 1.5075], ["medium", 3.015], ["heavy", 6.03]])("scales the %s tier", (tier, wh) => {
    expect(calculateImpact(tier, { inputTokens: 1000, outputTokens: 1000 }, { inputTokens: 0, outputTokens: 0 }).generation.energyWh).toBeCloseTo(wh, 10);
  });
  it("preserves negative savings when Opus is chosen", () => {
    const impact = calculateImpact("heavy", { inputTokens: 1000, outputTokens: 1000 }, { inputTokens: 200, outputTokens: 40 });
    expect(impact.savings.energyWh).toBeCloseTo(-0.03555, 10);
    expect(impact.savings.co2eGrams).toBeLessThan(0);
    expect(impact.savings.percent).toBeLessThan(0);
  });
  it("can show extra impact even on Haiku when classification dominates a tiny answer", () => {
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
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid token counts (%s)", (invalid) => {
    expect(() => energyForTokens({ inputTokens: invalid, outputTokens: 1 }, 1)).toThrow();
    expect(() => energyForTokens({ inputTokens: 1, outputTokens: invalid }, 1)).toThrow();
  });
});
