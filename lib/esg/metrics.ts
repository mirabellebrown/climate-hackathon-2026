import type { EsgMetrics, EsgRequestRecord, EsgTotals } from "./types";

function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

/**
 * Sum-over-sum metrics. Never average per-request ratios.
 * T = output tokens, C = cost USD, G = total gCO2e (usage+embodied for display totals),
 * E = Wh, W = mL (onsite+offsite when both present).
 */
export function metricsFromTotals(totals: EsgTotals): EsgMetrics {
  const T = totals.tokens_out;
  const C = totals.cost_usd;
  const G = totals.gwp_total_g;
  const E = totals.energy_wh;
  const W = totals.water_ml_total;
  const tokensTotal = totals.tokens_in + totals.tokens_out;
  return {
    tpd_output: ratio(T, C),
    tpd_total: ratio(tokensTotal, C),
    ci_tok: ratio(1000 * G, T),
    ei_tok: ratio(1000 * E, T),
    wi_tok: ratio(1000 * W, T),
    cpd: ratio(G, C),
  };
}

export function sumRecords(records: readonly EsgRequestRecord[]): EsgTotals {
  let tokens_in = 0;
  let tokens_out = 0;
  let cost_usd = 0;
  let gwp_usage_g = 0;
  let gwp_embodied_g = 0;
  let energy_wh = 0;
  let pe_mj = 0;
  let water_ml_onsite = 0;
  let water_ml_offsite = 0;
  for (const r of records) {
    tokens_in += r.tokens_in;
    tokens_out += r.tokens_out;
    cost_usd += r.cost_usd;
    gwp_usage_g += r.gwp_usage_g;
    gwp_embodied_g += r.gwp_embodied_g ?? 0;
    energy_wh += r.energy_wh;
    pe_mj += r.pe_mj ?? 0;
    water_ml_onsite += r.water_ml_onsite;
    water_ml_offsite += r.water_ml_offsite ?? 0;
  }
  return {
    tokens_in,
    tokens_out,
    cost_usd,
    gwp_usage_g,
    gwp_embodied_g,
    gwp_total_g: gwp_usage_g + gwp_embodied_g,
    energy_wh,
    pe_mj,
    water_ml_onsite,
    water_ml_offsite,
    water_ml_total: water_ml_onsite + water_ml_offsite,
    requests: records.length,
  };
}

/** Bridging identity: CPD = (CI_tok / 1000) * TPD */
export function cpdFromIdentity(ciTok: number, tpd: number): number {
  return (ciTok / 1000) * tpd;
}

export function meanPrefillRatio(records: readonly EsgRequestRecord[]): number | null {
  if (!records.length) return null;
  let sumIn = 0;
  let sumOut = 0;
  for (const r of records) {
    sumIn += r.tokens_in;
    sumOut += r.tokens_out;
  }
  if (sumOut === 0) return null;
  return sumIn / sumOut;
}
