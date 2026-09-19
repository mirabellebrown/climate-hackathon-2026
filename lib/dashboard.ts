import { TEAM_BUDGET_USD } from "./config";
import type { PromptUsageRecord, SessionTotals } from "./session";
import type { Tier } from "./types";

export function totalTokens(usage: { inputTokens: number; outputTokens: number }) {
  return usage.inputTokens + usage.outputTokens;
}

export function teamActualTokens(totals: SessionTotals): number {
  return totals.entries.reduce(
    (sum, entry) => sum + totalTokens(entry.chosen) + totalTokens(entry.classifier),
    0,
  );
}

/** Answer-token volume if every completed turn had been Gemini Pro (same measured answers). */
export function alwaysProTokens(totals: SessionTotals): number {
  return totals.baselineInputTokens + totals.baselineOutputTokens;
}

export interface TokenOverview {
  requests: number;
  teamTokens: number;
  alwaysProTokens: number;
  answerTokens: number;
  classifierTokens: number;
}

export function tokenOverview(totals: SessionTotals): TokenOverview {
  const answerTokens = totals.chosenInputTokens + totals.chosenOutputTokens;
  const teamTokens = teamActualTokens(totals);
  return {
    requests: totals.requests,
    teamTokens,
    alwaysProTokens: alwaysProTokens(totals),
    answerTokens,
    classifierTokens: Math.max(0, teamTokens - answerTokens),
  };
}

/** Team API spend vs Always-Pro counterfactual (same answers at Pro rates, no classifier). */
export interface CostOverview {
  requests: number;
  teamSpendUsd: number;
  alwaysProUsd: number;
  /** Positive = cheaper than Always Pro. */
  savedUsd: number;
  /** Share of Always Pro spend avoided; null when Always Pro is $0. */
  savedPercent: number | null;
}

export function costOverview(totals: SessionTotals): CostOverview {
  const teamSpendUsd = totals.routedUsd;
  const alwaysProUsd = totals.baselineUsd;
  const savedUsd = alwaysProUsd - teamSpendUsd;
  return {
    requests: totals.requests,
    teamSpendUsd,
    alwaysProUsd,
    savedUsd,
    savedPercent: alwaysProUsd > 0 ? (savedUsd / alwaysProUsd) * 100 : null,
  };
}

export interface BudgetStatus {
  allocatedUsd: number;
  spentUsd: number;
  remainingUsd: number;
  spentFraction: number;
  /** Team tokens as a fraction of Always-Pro answer tokens (0–1+). */
  tokenLoadVsPro: number;
}

export function budgetStatus(totals: SessionTotals, allocatedUsd = TEAM_BUDGET_USD): BudgetStatus {
  const spentUsd = totals.routedUsd;
  const remainingUsd = allocatedUsd - spentUsd;
  const proTokens = alwaysProTokens(totals);
  const teamTokens = teamActualTokens(totals);
  return {
    allocatedUsd,
    spentUsd,
    remainingUsd,
    spentFraction: allocatedUsd > 0 ? spentUsd / allocatedUsd : 0,
    tokenLoadVsPro: proTokens > 0 ? teamTokens / proTokens : 0,
  };
}

export interface UseCaseStat {
  id: string;
  label: string;
  requests: number;
  teamTokens: number;
  alwaysProTokens: number;
  /** Positive = cheaper than Always Pro. */
  usdSaved: number;
}

const USE_CASE_DEFS: { id: string; label: string; match: (entry: PromptUsageRecord) => boolean }[] = [
  {
    id: "quick",
    label: "Quick answers",
    match: (entry) => entry.tier === "light",
  },
  {
    id: "coding",
    label: "Coding & reasoning",
    match: (entry) => entry.tier === "medium" && /\b(code|coding|typescript|javascript|python|function|bug|api|refactor|algorithm)\b/i.test(entry.prompt),
  },
  {
    id: "analysis",
    label: "Analysis & writing",
    match: (entry) => entry.tier === "medium",
  },
  {
    id: "systems",
    label: "Complex systems",
    match: (entry) => entry.tier === "heavy",
  },
  {
    id: "other",
    label: "Other team prompts",
    match: () => true,
  },
];

function classifyUseCase(entry: PromptUsageRecord): { id: string; label: string } {
  for (const def of USE_CASE_DEFS) {
    if (def.match(entry)) return { id: def.id, label: def.label };
  }
  return { id: "other", label: "Other team prompts" };
}

/** Top use cases by request volume (prototype maps tiers + prompt keywords). */
export function topUseCases(entries: PromptUsageRecord[], limit = 5): UseCaseStat[] {
  const buckets = new Map<string, UseCaseStat>();
  // Entries are newest-first; order does not matter for aggregation.
  for (const entry of entries) {
    const { id, label } = classifyUseCase(entry);
    const current = buckets.get(id) ?? {
      id, label, requests: 0, teamTokens: 0, alwaysProTokens: 0, usdSaved: 0,
    };
    current.requests += 1;
    current.teamTokens += totalTokens(entry.chosen) + totalTokens(entry.classifier);
    current.alwaysProTokens += totalTokens(entry.baseline);
    current.usdSaved += entry.baselineUsd - entry.routedUsd;
    buckets.set(id, current);
  }
  return [...buckets.values()]
    .sort((a, b) => b.requests - a.requests || b.teamTokens - a.teamTokens)
    .slice(0, limit);
}

export interface EnvironmentalTotals {
  requests: number;
  routed: { energyWh: number; co2eGrams: number; waterLiters: number };
  baseline: { energyWh: number; co2eGrams: number; waterLiters: number };
  saved: { energyWh: number; co2eGrams: number; waterLiters: number };
}

export function environmentalTotals(totals: SessionTotals): EnvironmentalTotals {
  return {
    requests: totals.requests,
    routed: {
      energyWh: totals.routedWh,
      co2eGrams: totals.routedCo2eGrams,
      waterLiters: totals.routedWaterLiters,
    },
    baseline: {
      energyWh: totals.baselineWh,
      co2eGrams: totals.baselineCo2eGrams,
      waterLiters: totals.baselineWaterLiters,
    },
    saved: {
      energyWh: totals.baselineWh - totals.routedWh,
      co2eGrams: totals.baselineCo2eGrams - totals.routedCo2eGrams,
      waterLiters: totals.baselineWaterLiters - totals.routedWaterLiters,
    },
  };
}

export function tierLabel(tier: Tier): string {
  if (tier === "light") return "Quick answers";
  if (tier === "medium") return "Coding & reasoning";
  return "Complex systems";
}
