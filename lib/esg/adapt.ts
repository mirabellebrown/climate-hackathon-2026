import { FACTORS } from "@/lib/factors";
import type { Impact, RouteResult } from "@/lib/types";
import {
  DEFAULT_TEAM_ID,
  ECOLOGITS_VERSION,
  ESG_FACTOR_VERSION,
  ESG_PROVIDER,
  ESG_REGION,
} from "./constants";
import { litersToMl } from "./conversions";
import type { AuditTier, EsgRequestRecord } from "./types";

function newId(): string {
  return `esg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Adapt a routed Impact into an ESG request record.
 * EcoLogits midpoints are undivided: GWP → gwp_usage_g, WCF → water_ml_onsite.
 * Embodied GWP, offsite water, PE, and ADPe stay null (labelled gaps — never invented).
 */
export function adaptImpactToRecord(input: {
  impact: Impact;
  tokensIn: number;
  tokensOut: number;
  provider?: string;
  model: string;
  region?: string;
  teamId?: string;
  latencySeconds?: number | null;
  createdAt?: string;
  id?: string;
}): EsgRequestRecord {
  const { impact } = input;
  const audit_notes: string[] = [];
  const source = impact.environmentalSource;

  // EcoLogits / fallback both yield a single co2eGrams — treat as operational usage GWP.
  const gwp_usage_g = impact.routed.co2eGrams;
  const gwp_embodied_g: number | null = null;
  audit_notes.push(
    source === "ecologits"
      ? "EcoLogits returned undivided GWP; stored in gwp_usage_g. Embodied GWP not separately reported (null)."
      : "Fallback energy model yields undivided GWP; stored in gwp_usage_g. Embodied GWP null.",
  );

  const water_ml_onsite = litersToMl(impact.routed.waterLiters);
  const water_ml_offsite: number | null = null;
  audit_notes.push(
    source === "ecologits"
      ? "EcoLogits WCF midpoint stored as water_ml_onsite; offsite water not reported (null). Embodied water excluded."
      : "Fallback water stored as water_ml_onsite; offsite water null. Embodied water excluded.",
  );

  const pe_mj: number | null = null;
  const adpe_kgsbeq: number | null = null;
  audit_notes.push("Primary energy (PE) and ADPe not provided by EcoLogits midpoints in this integration — left null.");

  const audit_tier: AuditTier = "average-data";

  return {
    id: input.id ?? newId(),
    created_at: input.createdAt ?? new Date().toISOString(),
    gwp_usage_g,
    gwp_embodied_g,
    energy_wh: impact.routed.energyWh,
    pe_mj,
    adpe_kgsbeq,
    water_ml_onsite,
    water_ml_offsite,
    tokens_in: input.tokensIn,
    tokens_out: input.tokensOut,
    cost_usd: impact.cost.routed,
    latency_s: input.latencySeconds ?? null,
    provider: input.provider ?? ESG_PROVIDER,
    model: input.model,
    region: input.region ?? ESG_REGION,
    team_id: input.teamId ?? DEFAULT_TEAM_ID,
    ecologits_version: source === "ecologits" ? ECOLOGITS_VERSION : `fallback:${FACTORS.version}`,
    factor_version: impact.methodologyVersion || ESG_FACTOR_VERSION,
    audit_tier,
    audit_notes,
    environmental_source: source,
  };
}

/** Generation + classifier tokens (routed request), matching cost.routed. */
export function adaptRouteResultToRecord(
  result: RouteResult,
  options?: { teamId?: string; latencySeconds?: number | null; createdAt?: string; id?: string },
): EsgRequestRecord {
  const tokensIn = result.usage.total.inputTokens;
  const tokensOut = result.usage.total.outputTokens;
  return adaptImpactToRecord({
    impact: result.impact,
    tokensIn,
    tokensOut,
    model: result.routing.model,
    teamId: options?.teamId,
    latencySeconds: options?.latencySeconds,
    createdAt: options?.createdAt,
    id: options?.id,
  });
}

export function isValidEsgRecord(value: unknown): value is EsgRequestRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  const num = (k: string) => typeof r[k] === "number" && Number.isFinite(r[k] as number);
  const optNum = (k: string) => r[k] === null || num(k);
  return typeof r.id === "string"
    && typeof r.created_at === "string"
    && num("gwp_usage_g")
    && optNum("gwp_embodied_g")
    && num("energy_wh")
    && optNum("pe_mj")
    && optNum("adpe_kgsbeq")
    && num("water_ml_onsite")
    && optNum("water_ml_offsite")
    && Number.isSafeInteger(r.tokens_in) && (r.tokens_in as number) >= 0
    && Number.isSafeInteger(r.tokens_out) && (r.tokens_out as number) >= 0
    && num("cost_usd")
    && (r.latency_s === null || num("latency_s"))
    && typeof r.provider === "string"
    && typeof r.model === "string"
    && typeof r.region === "string"
    && typeof r.team_id === "string"
    && typeof r.ecologits_version === "string"
    && typeof r.factor_version === "string"
    && (r.audit_tier === "average-data" || r.audit_tier === "supplier-specific" || r.audit_tier === "hybrid")
    && Array.isArray(r.audit_notes)
    && (r.environmental_source === "ecologits" || r.environmental_source === "fallback");
}
