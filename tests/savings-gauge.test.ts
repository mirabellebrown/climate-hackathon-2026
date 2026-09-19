import { describe, expect, it } from "vitest";
import { savingsGaugePercent } from "@/lib/savings-gauge";

describe("savings gauge fill", () => {
  it("maps Always-Pro cost savings percent into a 0–100 ring fill", () => {
    expect(savingsGaugePercent(null, 0)).toBe(0);
    expect(savingsGaugePercent(55.2, 2)).toBe(55.2);
    expect(savingsGaugePercent(140, 1)).toBe(100);
    expect(savingsGaugePercent(-10, 1)).toBe(0);
  });
});
