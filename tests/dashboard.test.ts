import { describe, expect, it } from "vitest";
import { TEAM_BUDGET_USD } from "@/lib/config";
import { budgetStatus, costOverview, environmentalTotals, tokenOverview, topUseCases } from "@/lib/dashboard";
import { addRoute, parseSession } from "@/lib/session";
import { calculateImpact, compareUsage } from "@/lib/impact";
import { MODELS } from "@/lib/config";
import type { RouteResult } from "@/lib/types";

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

describe("team usage dashboard helpers", () => {
  it("exposes team spend, Always Pro cost, and savings for the primary overview", () => {
    const first = route("Explain leaves", "light");
    const totals = addRoute(parseSession(null), "Explain leaves", first);
    const cost = costOverview(totals);
    expect(cost.teamSpendUsd).toBeCloseTo(totals.routedUsd, 10);
    expect(cost.alwaysProUsd).toBeCloseTo(totals.baselineUsd, 10);
    expect(cost.savedUsd).toBeCloseTo(totals.baselineUsd - totals.routedUsd, 10);
    expect(cost.savedUsd).toBeGreaterThan(0);
    expect(cost.savedPercent).toBeGreaterThan(0);
    const overview = tokenOverview(totals);
    expect(overview.answerTokens).toBe(180);
    expect(overview.classifierTokens).toBe(30);
    expect(overview.teamTokens).toBe(210);
  });

  it("tracks budget against TEAM_BUDGET_USD", () => {
    const totals = addRoute(parseSession(null), "Explain leaves", route("Explain leaves", "light"));
    const budget = budgetStatus(totals);
    expect(budget.allocatedUsd).toBe(TEAM_BUDGET_USD);
    expect(budget.spentUsd).toBeCloseTo(totals.routedUsd, 10);
    expect(budget.remainingUsd).toBeCloseTo(TEAM_BUDGET_USD - totals.routedUsd, 10);
  });

  it("ranks use cases from tiers and coding keywords", () => {
    let totals = parseSession(null);
    totals = addRoute(totals, "Explain why leaves change color", route("Explain why leaves change color", "light"));
    totals = addRoute(totals, "Write a TypeScript function to group by key", route("Write a TypeScript function to group by key", "medium"));
    totals = addRoute(totals, "Summarize the quarterly memo", route("Summarize the quarterly memo", "medium"));
    totals = addRoute(totals, "Design a global architecture", route("Design a global architecture", "heavy"));
    const cases = topUseCases(totals.entries, 5);
    expect(cases[0].requests).toBeGreaterThanOrEqual(1);
    expect(cases.some((item) => item.id === "quick")).toBe(true);
    expect(cases.some((item) => item.id === "coding")).toBe(true);
    expect(cases.some((item) => item.id === "systems")).toBe(true);
  });

  it("exposes absolute environmental footprint with savings", () => {
    const light = calculateImpact("light", { inputTokens: 100, outputTokens: 100 }, { inputTokens: 20, outputTokens: 10 });
    const totals = addRoute(parseSession(null), "hi", {
      answer: "x",
      routing: {
        tier: "light", reason: "t", model: MODELS.light.id, modelName: MODELS.light.name,
        classifierModel: MODELS.light.id, classifierFallback: false, baselineModel: MODELS.heavy.id,
      },
      usage: compareUsage({ inputTokens: 100, outputTokens: 100 }, { inputTokens: 20, outputTokens: 10 }),
      impact: light,
      truncated: false,
    });
    const env = environmentalTotals(totals);
    expect(env.routed.energyWh).toBeCloseTo(light.routed.energyWh, 10);
    expect(env.saved.co2eGrams).toBeCloseTo(light.baseline.co2eGrams - light.routed.co2eGrams, 10);
  });
});
