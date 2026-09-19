import { calculateImpact } from "./impact";
import type { SessionTotals } from "./session";

export const TEAM_YEAR_DAYS = 365;
/** Enterprise-scale demo: 100k people × 50 work requests/day. */
export const DEFAULT_TEAM_SIZE = 100_000;
export const DEFAULT_REQUESTS_PER_PERSON_PER_DAY = 50;
export const MAX_TEAM_SIZE = 500_000;
export const MAX_REQUESTS_PER_PERSON_PER_DAY = 200;

/** Demo turn: Flash Lite 1k/1k answer + light classifier — used when the session is empty. */
const DEMO = calculateImpact(
  "light",
  { inputTokens: 1000, outputTokens: 1000 },
  { inputTokens: 200, outputTokens: 40 },
);

export const DEMO_PER_REQUEST = {
  routedUsd: DEMO.cost.routed,
  alwaysProUsd: DEMO.cost.baseline,
  co2eGramsSaved: DEMO.baseline.co2eGrams - DEMO.routed.co2eGrams,
  waterLitersSaved: DEMO.baseline.waterLiters - DEMO.routed.waterLiters,
} as const;

export interface PerRequestAverages {
  routedUsd: number;
  alwaysProUsd: number;
  co2eGramsSaved: number;
  waterLitersSaved: number;
  /** True when averages come from this browser’s session, not the demo turn. */
  fromSession: boolean;
  sampleRequests: number;
}

export function perRequestAverages(totals: SessionTotals): PerRequestAverages {
  if (totals.requests <= 0) {
    return { ...DEMO_PER_REQUEST, fromSession: false, sampleRequests: 0 };
  }
  const n = totals.requests;
  return {
    routedUsd: totals.routedUsd / n,
    alwaysProUsd: totals.baselineUsd / n,
    co2eGramsSaved: (totals.baselineCo2eGrams - totals.routedCo2eGrams) / n,
    waterLitersSaved: (totals.baselineWaterLiters - totals.routedWaterLiters) / n,
    fromSession: true,
    sampleRequests: n,
  };
}

export interface TeamYearInputs {
  teamSize: number;
  requestsPerPersonPerDay: number;
  days?: number;
}

export interface TeamYearProjection {
  annualRequests: number;
  teamSize: number;
  requestsPerPersonPerDay: number;
  days: number;
  routedUsd: number;
  alwaysProUsd: number;
  savedUsd: number;
  savedPercent: number | null;
  co2eGramsSaved: number;
  waterLitersSaved: number;
  averages: PerRequestAverages;
}

export function teamYearProjection(totals: SessionTotals, inputs: TeamYearInputs): TeamYearProjection {
  const teamSize = Math.max(1, Math.min(MAX_TEAM_SIZE, Math.round(inputs.teamSize)));
  const requestsPerPersonPerDay = Math.max(0, Math.min(MAX_REQUESTS_PER_PERSON_PER_DAY, inputs.requestsPerPersonPerDay));
  const days = inputs.days ?? TEAM_YEAR_DAYS;
  const annualRequests = teamSize * requestsPerPersonPerDay * days;
  const averages = perRequestAverages(totals);
  const routedUsd = averages.routedUsd * annualRequests;
  const alwaysProUsd = averages.alwaysProUsd * annualRequests;
  const savedUsd = alwaysProUsd - routedUsd;
  return {
    annualRequests,
    teamSize,
    requestsPerPersonPerDay,
    days,
    routedUsd,
    alwaysProUsd,
    savedUsd,
    savedPercent: alwaysProUsd > 0 ? (savedUsd / alwaysProUsd) * 100 : null,
    co2eGramsSaved: averages.co2eGramsSaved * annualRequests,
    waterLitersSaved: averages.waterLitersSaved * annualRequests,
    averages,
  };
}
