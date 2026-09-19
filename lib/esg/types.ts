/** Per-request ESG record. Units: g, Wh, mL. Never merge usage/embodied or onsite/offsite. */
export interface EsgRequestRecord {
  id: string;
  created_at: string;
  gwp_usage_g: number;
  /** Null when EcoLogits (or fallback) does not split embodied GWP — do not invent. */
  gwp_embodied_g: number | null;
  energy_wh: number;
  /** Null when primary energy is not reported by the source. */
  pe_mj: number | null;
  /** Internal only — not disclosed in ESG exports. */
  adpe_kgsbeq: number | null;
  water_ml_onsite: number;
  /** Null when offsite water is not reported. */
  water_ml_offsite: number | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_s: number | null;
  provider: string;
  model: string;
  region: string;
  team_id: string;
  ecologits_version: string;
  factor_version: string;
  audit_tier: AuditTier;
  /** Notes about undivided midpoints / missing splits. */
  audit_notes: string[];
  environmental_source: "ecologits" | "fallback";
}

export type AuditTier = "average-data" | "supplier-specific" | "hybrid";

export interface EsgExclusion {
  id: string;
  title: string;
  statement: string;
}

export interface IsoEsgMappingRow {
  id: string;
  internal_metric: string;
  iso_clause: string;
  plain_english: string;
  populates: string;
  tier: string;
  posture: string;
  /** When true, metric stays off public ESG UI/export tables. */
  internal_only?: boolean;
}

export interface EsgMetrics {
  /** Output tokens / USD. ISO-aligned efficiency join. */
  tpd_output: number | null;
  /** (Input + output tokens) / USD. Distinct from TPD because cost prices both. */
  tpd_total: number | null;
  /** gCO2e per 1k output tokens (ISO 11.5.2). */
  ci_tok: number | null;
  /** Wh per 1k output tokens. */
  ei_tok: number | null;
  /** mL per 1k output tokens (onsite + offsite when both present). */
  wi_tok: number | null;
  /** gCO2e per USD. */
  cpd: number | null;
}

export interface EsgTotals {
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  gwp_usage_g: number;
  gwp_embodied_g: number;
  /** Usage + embodied for display totals only; storage stays split. */
  gwp_total_g: number;
  energy_wh: number;
  pe_mj: number;
  water_ml_onsite: number;
  water_ml_offsite: number;
  /** Onsite + offsite for display totals only. */
  water_ml_total: number;
  requests: number;
}

export interface EsgMeta {
  factor_version: string;
  ecologits_version: string;
  audit_tier: AuditTier;
  exclusions: EsgExclusion[];
  team_id: string;
  period: { start: string | null; end: string | null };
  prefill_warning: boolean;
  prefill_warning_message: string | null;
}

export interface EsgBreakdownRow {
  provider: string;
  model: string;
  region: string;
  month: string;
  team_id: string;
  totals: EsgTotals;
  metrics: EsgMetrics;
  audit_tier: AuditTier;
}

export interface EfficiencyFrontierPoint {
  provider: string;
  model: string;
  region: string;
  /** USD per 1M output tokens. */
  usd_per_1m_output: number | null;
  /** gCO2e per 1M output tokens. */
  gwp_per_1m_output: number | null;
  tokens_out: number;
  cost_usd: number;
  gwp_total_g: number;
  cpd: number | null;
  low_confidence: boolean;
}
