import { describe, expect, it } from "vitest";
import { addResults, MAX_SEEN, parseSession, resetTotals } from "@/lib/session";
import { calculateImpact } from "@/lib/impact";
import { FACTORS } from "@/lib/factors";
import type { RouteResult, Tier } from "@/lib/types";

function run(id: string, tier: Tier, tokens: number): RouteResult {
  return { id, impact: calculateImpact(tier, { inputTokens: tokens, outputTokens: tokens }, { inputTokens: 100, outputTokens: 50 }) } as RouteResult;
}

describe("browser session totals", () => {
  it("weights cumulative savings by impact, not by averaging run percentages", () => {
    const first = run("a", "light", 100);
    const second = run("b", "heavy", 1000);
    const totals = addResults(parseSession(null), [first, second]);
    expect(totals.requests).toBe(2);
    expect(totals.baselineWh - totals.routedWh).toBeCloseTo(first.impact.savings.energyWh + second.impact.savings.energyWh, 10);
    const actualPercent = (totals.baselineWh - totals.routedWh) / totals.baselineWh * 100;
    expect(actualPercent).not.toBeCloseTo((first.impact.savings.percent! + second.impact.savings.percent!) / 2, 1);
  });
  it("counts each routing ID once across repeated polls", () => {
    const once = addResults(parseSession(null), [run("a", "light", 100)]);
    const twice = addResults(once, [run("a", "light", 100), run("a", "light", 100)]);
    expect(twice).toBe(once);
    expect(twice.requests).toBe(1);
  });
  it("keeps counted IDs after a reset so old runs are not added again", () => {
    const totals = addResults(parseSession(null), [run("a", "light", 100)]);
    const reset = resetTotals(totals);
    expect(reset.requests).toBe(0);
    expect(addResults(reset, [run("a", "light", 100)]).requests).toBe(0);
    expect(addResults(reset, [run("b", "light", 100)]).requests).toBe(1);
  });
  it("bounds the remembered IDs", () => {
    const many = Array.from({ length: MAX_SEEN + 10 }, (_, index) => run(String(index), "light", 1));
    expect(addResults(parseSession(null), many).seen).toHaveLength(MAX_SEEN);
  });
  it("restores only valid totals with the same factor version", () => {
    expect(parseSession(JSON.stringify({ version: FACTORS.version, requests: 2, routedWh: 4, baselineWh: 9, seen: ["x", 3] }))).toEqual({ requests: 2, routedWh: 4, baselineWh: 9, seen: ["x"] });
    expect(parseSession(JSON.stringify({ version: "old", requests: 2, routedWh: 4, baselineWh: 9 })).requests).toBe(0);
  });
  it.each(["bad json", "null", "[]", '{"requests": -1}', '{"routedWh": "100"}'])("recovers from corrupt storage: %s", (raw) => {
    expect(parseSession(raw)).toEqual({ requests: 0, routedWh: 0, baselineWh: 0, seen: [] });
  });
});
