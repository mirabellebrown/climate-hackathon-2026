import { DEFAULT_TEAM_ID, ECOLOGITS_VERSION, ESG_FACTOR_VERSION, PREFILL_RATIO_WARN } from "./constants";
import { ESG_EXCLUSIONS, PREFILL_WARNING_MESSAGE } from "./exclusions";
import { meanPrefillRatio, metricsFromTotals, sumRecords } from "./metrics";
import type {
  AuditTier,
  EfficiencyFrontierPoint,
  EsgBreakdownRow,
  EsgMeta,
  EsgRequestRecord,
  EsgTotals,
} from "./types";
import { gToTco2e, mlToM3, whToMwh } from "./conversions";

export function buildMeta(records: readonly EsgRequestRecord[], teamId = DEFAULT_TEAM_ID): EsgMeta {
  let start: string | null = null;
  let end: string | null = null;
  let factor_version: string = ESG_FACTOR_VERSION;
  let ecologits_version: string = ECOLOGITS_VERSION;
  let audit_tier: AuditTier = "average-data";
  if (records.length) {
    const sorted = [...records].sort((a, b) => a.created_at.localeCompare(b.created_at));
    start = sorted[0]!.created_at;
    end = sorted.at(-1)!.created_at;
    factor_version = sorted.at(-1)!.factor_version;
    ecologits_version = sorted.at(-1)!.ecologits_version;
    const tiers = new Set(records.map((r) => r.audit_tier));
    if (tiers.size > 1) audit_tier = "hybrid";
    else audit_tier = records[0]!.audit_tier;
  }
  const ratio = meanPrefillRatio(records);
  const prefill_warning = ratio !== null && ratio > PREFILL_RATIO_WARN;
  return {
    factor_version,
    ecologits_version,
    audit_tier,
    exclusions: [...ESG_EXCLUSIONS],
    team_id: teamId,
    period: { start, end },
    prefill_warning,
    prefill_warning_message: prefill_warning ? PREFILL_WARNING_MESSAGE : null,
  };
}

export function filterRecords(
  records: readonly EsgRequestRecord[],
  opts: { teamId?: string; provider?: string; model?: string; since?: string; until?: string } = {},
): EsgRequestRecord[] {
  return records.filter((r) => {
    if (opts.teamId && r.team_id !== opts.teamId) return false;
    if (opts.provider && r.provider !== opts.provider) return false;
    if (opts.model && r.model !== opts.model) return false;
    if (opts.since && r.created_at < opts.since) return false;
    if (opts.until && r.created_at > opts.until) return false;
    return true;
  });
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function breakdownByGrain(records: readonly EsgRequestRecord[]): EsgBreakdownRow[] {
  const groups = new Map<string, EsgRequestRecord[]>();
  for (const r of records) {
    const key = `${r.team_id}|${r.provider}|${r.model}|${r.region}|${monthKey(r.created_at)}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const rows: EsgBreakdownRow[] = [];
  for (const [, group] of groups) {
    const sample = group[0]!;
    const totals = sumRecords(group);
    const tiers = new Set(group.map((r) => r.audit_tier));
    rows.push({
      provider: sample.provider,
      model: sample.model,
      region: sample.region,
      month: monthKey(sample.created_at),
      team_id: sample.team_id,
      totals,
      metrics: metricsFromTotals(totals),
      audit_tier: tiers.size > 1 ? "hybrid" : sample.audit_tier,
    });
  }
  return rows.sort((a, b) => b.totals.gwp_total_g - a.totals.gwp_total_g);
}

/** Low-confidence when proprietary architecture / flash-lite catalog alias path. */
function lowConfidence(model: string): boolean {
  return /flash-lite|flash_lite|lite/i.test(model);
}

export function efficiencyFrontier(records: readonly EsgRequestRecord[]): EfficiencyFrontierPoint[] {
  const groups = new Map<string, EsgRequestRecord[]>();
  for (const r of records) {
    const key = `${r.provider}|${r.model}|${r.region}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const points: EfficiencyFrontierPoint[] = [];
  for (const [, group] of groups) {
    const sample = group[0]!;
    const totals = sumRecords(group);
    const metrics = metricsFromTotals(totals);
    const T = totals.tokens_out;
    points.push({
      provider: sample.provider,
      model: sample.model,
      region: sample.region,
      usd_per_1m_output: T > 0 ? (totals.cost_usd / T) * 1_000_000 : null,
      gwp_per_1m_output: T > 0 ? (totals.gwp_total_g / T) * 1_000_000 : null,
      tokens_out: T,
      cost_usd: totals.cost_usd,
      gwp_total_g: totals.gwp_total_g,
      cpd: metrics.cpd,
      low_confidence: lowConfidence(sample.model),
    });
  }
  return points;
}

export function summaryKpis(totals: EsgTotals) {
  const metrics = metricsFromTotals(totals);
  return {
    tco2e_scope3_cat1: gToTco2e(totals.gwp_total_g),
    gwp_usage_g: totals.gwp_usage_g,
    gwp_embodied_g: totals.gwp_embodied_g,
    gwp_total_g: totals.gwp_total_g,
    ci_tok: metrics.ci_tok,
    cpd: metrics.cpd,
    tpd_output: metrics.tpd_output,
    tpd_total: metrics.tpd_total,
    mwh: whToMwh(totals.energy_wh),
    energy_wh: totals.energy_wh,
    water_m3: mlToM3(totals.water_ml_total),
    water_ml_onsite: totals.water_ml_onsite,
    water_ml_offsite: totals.water_ml_offsite,
    water_ml_total: totals.water_ml_total,
    tokens_out: totals.tokens_out,
    tokens_in: totals.tokens_in,
    cost_usd: totals.cost_usd,
    requests: totals.requests,
    embodied_materiality_pct:
      totals.gwp_total_g > 0 ? (100 * totals.gwp_embodied_g) / totals.gwp_total_g : 0,
  };
}

export function trendByMonth(records: readonly EsgRequestRecord[]) {
  const groups = new Map<string, EsgRequestRecord[]>();
  for (const r of records) {
    const key = `${monthKey(r.created_at)}|${r.provider}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const [month, provider] = key.split("|");
      const totals = sumRecords(group);
      const metrics = metricsFromTotals(totals);
      return {
        month: month!,
        provider: provider!,
        ci_tok: metrics.ci_tok,
        factor_version: group.at(-1)!.factor_version,
        tokens_out: totals.tokens_out,
        gwp_total_g: totals.gwp_total_g,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month) || a.provider.localeCompare(b.provider));
}
