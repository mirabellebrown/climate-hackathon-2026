import type { EsgRecord, Measures, Provider } from "./types";

// Pure aggregation (spec §6-7). Storage keeps raw grams, Wh, MJ and mL; conversions to
// disclosure units happen only in `present`. Ratios are always sum(numerator) / sum(denominator).

export const EMPTY: Measures = Object.freeze({ gwp_usage_g: 0, gwp_embodied_g: 0, energy_wh: 0, pe_mj: 0, adpe_kgsbeq: 0, water_ml_onsite: 0, water_ml_offsite: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, request_count: 0, supplier_specific_count: 0 });

export function add(m: Measures, r: EsgRecord): Measures {
  return {
    gwp_usage_g: m.gwp_usage_g + r.ecologits.gwp_usage_g,
    gwp_embodied_g: m.gwp_embodied_g + r.ecologits.gwp_embodied_g,
    energy_wh: m.energy_wh + r.ecologits.energy_wh,
    pe_mj: m.pe_mj + r.ecologits.pe_mj,
    adpe_kgsbeq: m.adpe_kgsbeq + r.ecologits.adpe_kgsbeq,
    water_ml_onsite: m.water_ml_onsite + r.ecologits.water_ml_onsite,
    water_ml_offsite: m.water_ml_offsite + r.ecologits.water_ml_offsite,
    tokens_in: m.tokens_in + r.call.tokens_in,
    tokens_out: m.tokens_out + r.call.tokens_out,
    cost_usd: m.cost_usd + r.cost.amount,
    request_count: m.request_count + 1,
    supplier_specific_count: m.supplier_specific_count + (r.classification.data_tier === "Supplier-specific" ? 1 : 0),
  };
}

export function merge(a: Measures, b: Measures): Measures {
  const out = { ...a };
  for (const key of Object.keys(out) as (keyof Measures)[]) out[key] = a[key] + b[key];
  return out;
}

export function sum(records: EsgRecord[]): Measures { return records.reduce(add, EMPTY); }

export function rollup<K extends string>(records: EsgRecord[], key: (r: EsgRecord) => K): Map<K, Measures> {
  const out = new Map<K, Measures>();
  for (const record of records) { const k = key(record); out.set(k, add(out.get(k) ?? EMPTY, record)); }
  return out;
}

export const gwp = (m: Measures) => m.gwp_usage_g + m.gwp_embodied_g;
const ratio = (numerator: number, denominator: number) => (denominator > 0 ? numerator / denominator : null);

/** Spec §6.1. G, E, W over output tokens T and cost C. Null when a denominator is zero. */
export function ratios(m: Measures) {
  const G = gwp(m), T = m.tokens_out, C = m.cost_usd, E = m.energy_wh, W = m.water_ml_onsite + m.water_ml_offsite;
  return {
    tpd: ratio(T, C),
    ci_tok: ratio(1000 * G, T),
    ei_tok: ratio(1000 * E, T),
    wi_tok: ratio(1000 * W, T),
    cpd: ratio(G, C),
    tpg: G > 0 ? T / (G / 1000) : null,
    gco2e_per_request: ratio(G, m.request_count),
    input_output_ratio: ratio(m.tokens_in, T),
  };
}

// Conversions happen here, at the presentation/export boundary only.
export const toTonnes = (grams: number) => grams / 1e6;
export const whToMwh = (wh: number) => wh / 1e6;
export const mjToMwh = (mj: number) => mj / 3600;
export const mlToM3 = (ml: number) => ml / 1e6;

export function present(m: Measures) {
  return {
    tco2e_total: toTonnes(gwp(m)),
    tco2e_usage: toTonnes(m.gwp_usage_g),
    tco2e_embodied: toTonnes(m.gwp_embodied_g),
    mwh: whToMwh(m.energy_wh),
    pe_mwh: mjToMwh(m.pe_mj),
    // Summed only here, for display; the split stays alongside.
    m3_water: mlToM3(m.water_ml_onsite + m.water_ml_offsite),
    m3_water_onsite: mlToM3(m.water_ml_onsite),
    m3_water_offsite: mlToM3(m.water_ml_offsite),
    adpe_kgsbeq: m.adpe_kgsbeq,
    cost_usd: m.cost_usd,
    tokens_in: m.tokens_in,
    tokens_out: m.tokens_out,
    requests: m.request_count,
    ...ratios(m),
  };
}

export function auditTier(m: Measures): string {
  if (!m.request_count || !m.supplier_specific_count) return "Average-data";
  if (m.supplier_specific_count === m.request_count) return "Supplier-specific";
  return `Mixed: ${Math.round(m.supplier_specific_count / m.request_count * 100)}% Supplier-specific, rest Average-data`;
}

export const MATERIALITY_THRESHOLD = 0.01;
/** Embodied is flagged for inclusion when it exceeds 1% of the period's (AI-attributed) Scope 3. */
export function materiality(m: Measures) {
  const total = gwp(m);
  const share = total > 0 ? m.gwp_embodied_g / total : 0;
  return { embodied_share: share, material: share > MATERIALITY_THRESHOLD, threshold: MATERIALITY_THRESHOLD };
}

export const LONG_CONTEXT_RATIO = 5;
/** Prefill warning per team: sum(tokens_in) / sum(tokens_out) above 5. */
export function longContextTeams(records: EsgRecord[]) {
  return [...rollup(records, (r) => r.org.team_id)]
    .map(([team, m]) => ({ team, ratio: ratio(m.tokens_in, m.tokens_out) ?? 0 }))
    .filter((row) => row.ratio > LONG_CONTEXT_RATIO)
    .sort((a, b) => a.team.localeCompare(b.team));
}

// ── Periods ────────────────────────────────────────────────────────────────
export interface Period { id: string; kind: "month" | "fy"; start: string; end: string; months: number; label: string }
const monthStart = (year: number, month: number) => new Date(Date.UTC(year, month - 1, 1)).toISOString();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08" or "FY2026". A fiscal year is named for the calendar year it ends in. */
export function parsePeriod(id: string, fyStartMonth = 1): Period {
  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(id);
  if (month) {
    const year = Number(month[1]), m = Number(month[2]);
    return { id, kind: "month", start: monthStart(year, m), end: monthStart(m === 12 ? year + 1 : year, m === 12 ? 1 : m + 1), months: 1, label: `${MONTHS[m - 1]} ${year}` };
  }
  const fy = /^FY(\d{4})$/.exec(id);
  if (fy) {
    const endYear = Number(fy[1]);
    const startYear = fyStartMonth === 1 ? endYear : endYear - 1;
    return { id, kind: "fy", start: monthStart(startYear, fyStartMonth), end: monthStart(startYear + 1, fyStartMonth), months: 12, label: `FY${endYear}` };
  }
  throw new Error(`Unknown period "${id}". Use YYYY-MM or FYYYYY.`);
}

export function fiscalYearOf(iso: string, fyStartMonth: number): string {
  const date = new Date(iso);
  const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;
  const endYear = fyStartMonth === 1 ? year : month >= fyStartMonth ? year + 1 : year;
  return `FY${endYear}`;
}

export const monthOf = (iso: string) => iso.slice(0, 7);
export const within = (records: EsgRecord[], start: string, end: string) => records.filter((r) => r.ts_utc >= start && r.ts_utc < end);

export type BaselineKind = "previous" | "fytd";
/** Baseline window plus a scale that turns its totals into a per-period equivalent. */
export function baselineWindow(period: Period, kind: BaselineKind, fyStartMonth: number) {
  if (kind === "fytd" && period.kind === "month") {
    const fy = parsePeriod(fiscalYearOf(period.start, fyStartMonth), fyStartMonth);
    const months = monthsBetween(fy.start, period.start);
    if (months > 0) return { start: fy.start, end: period.start, scale: 1 / months, label: `${fy.label} to date, monthly average` };
  }
  const start = period.kind === "month" ? shiftMonths(period.start, -1) : shiftMonths(period.start, -12);
  return { start, end: period.start, scale: 1, label: period.kind === "month" ? "Previous month" : "Previous fiscal year" };
}

function shiftMonths(iso: string, delta: number) {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)).toISOString();
}
function monthsBetween(a: string, b: string) {
  const x = new Date(a), y = new Date(b);
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth();
}
export function monthsIn(start: string, end: string): string[] {
  const out: string[] = [];
  for (let at = start; at < end; at = shiftMonths(at, 1)) out.push(monthOf(at));
  return out;
}

export function scaled(m: Measures, factor: number): Measures {
  const out = { ...m };
  for (const key of Object.keys(out) as (keyof Measures)[]) out[key] = m[key] * factor;
  return out;
}

// ── Change decomposition (spec §6.4) ────────────────────────────────────────
// Sequential additive shift-share over mix segments (provider × model × region):
//   volume    = (T1 - T0) · I0                       at constant baseline intensity
//   mix       = T1 · (Σ s1ᵢ·I0ᵢ - I0)                share shift at baseline segment intensities
//   intensity = T1 · Σ s1ᵢ·(I1ᵢ - I0ᵢ)               per-token change within the current mix
// The three sum exactly to G1 - G0. A segment new in the current period has no baseline
// intensity; it takes I0ᵢ = I1ᵢ, so its arrival is attributed to mix, not intensity.
export const segmentOf = (r: EsgRecord) => `${r.call.provider}|${r.call.model}|${r.call.region}`;

export function decompose(current: Map<string, Measures>, baseline: Map<string, Measures>) {
  const T1 = [...current.values()].reduce((s, m) => s + m.tokens_out, 0);
  const G1 = [...current.values()].reduce((s, m) => s + gwp(m), 0);
  const T0 = [...baseline.values()].reduce((s, m) => s + m.tokens_out, 0);
  const G0 = [...baseline.values()].reduce((s, m) => s + gwp(m), 0);
  if (T0 === 0) return { volume: toTonnes(G1 - G0), mix: 0, intensity: 0, total: toTonnes(G1 - G0), baseline_tco2e: toTonnes(G0), current_tco2e: toTonnes(G1) };
  const I0 = G0 / T0;
  let mixTerm = 0, intensityTerm = 0;
  for (const [segment, m] of current) {
    if (!m.tokens_out) continue;
    const share = m.tokens_out / T1, I1 = gwp(m) / m.tokens_out;
    const base = baseline.get(segment);
    const I0i = base && base.tokens_out > 0 ? gwp(base) / base.tokens_out : I1;
    mixTerm += share * I0i;
    intensityTerm += share * (I1 - I0i);
  }
  const volume = (T1 - T0) * I0;
  const mix = T1 > 0 ? T1 * (mixTerm - I0) : 0;
  const intensity = T1 > 0 ? T1 * intensityTerm : 0;
  return { volume: toTonnes(volume), mix: toTonnes(mix), intensity: toTonnes(intensity), total: toTonnes(G1 - G0), baseline_tco2e: toTonnes(G0), current_tco2e: toTonnes(G1) };
}

export function versions(records: EsgRecord[]) {
  return {
    factor_versions: [...new Set(records.map((r) => r.ecologits.factor_version))].sort(),
    ecologits_versions: [...new Set(records.map((r) => r.ecologits.version))].sort(),
  };
}

export function worstConfidence(records: EsgRecord[]) {
  const order = { low: 0, moderate: 1, high: 2 } as const;
  return records.reduce<"high" | "moderate" | "low">((worst, r) => (order[r.ecologits.estimate_confidence] < order[worst] ? r.ecologits.estimate_confidence : worst), "high");
}

export const PROVIDER_ORDER: Provider[] = ["anthropic", "openai", "google", "mistral", "cohere", "other"];
