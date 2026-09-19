import { describe, expect, it } from "vitest";
import { addImpact, parseSession } from "@/lib/session";
import { calculateImpact } from "@/lib/impact";
import { FACTORS } from "@/lib/factors";

describe("browser session totals", () => {
  it("weights cumulative savings by impact, not by averaging request percentages", () => {
    const first = calculateImpact("light", { inputTokens: 100, outputTokens: 100 }, { inputTokens: 100, outputTokens: 50 });
    const second = calculateImpact("heavy", { inputTokens: 1000, outputTokens: 1000 }, { inputTokens: 100, outputTokens: 50 });
    const totals = addImpact(addImpact(parseSession(null), first), second);
    expect(totals.requests).toBe(2);
    expect(totals.baselineWh - totals.routedWh).toBeCloseTo(first.savings.energyWh + second.savings.energyWh, 10);
    const actualPercent = (totals.baselineWh - totals.routedWh) / totals.baselineWh * 100;
    expect(actualPercent).not.toBeCloseTo((first.savings.percent! + second.savings.percent!) / 2, 1);
  });
  it("restores only valid totals with the same factor version", () => {
    expect(parseSession(JSON.stringify({ version: FACTORS.version, requests: 2, routedWh: 4, baselineWh: 9 }))).toEqual({ requests: 2, routedWh: 4, baselineWh: 9 });
    expect(parseSession(JSON.stringify({ version: "old", requests: 2, routedWh: 4, baselineWh: 9 })).requests).toBe(0);
  });
  it.each(["bad json", "null", "[]", '{"requests": -1}', '{"routedWh": "100"}'])("recovers from corrupt storage: %s", (raw) => {
    expect(parseSession(raw)).toEqual({ requests: 0, routedWh: 0, baselineWh: 0 });
  });
});
