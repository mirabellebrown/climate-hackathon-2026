import { ECOLOGITS_VERSION, ESG_FACTOR_VERSION, ESG_REGION } from "./constants";
import { ESG_EXCLUSIONS } from "./exclusions";
import { ISO_ESG_MAPPING, NOT_CALCULABLE } from "./mapping";

/** Methodology pack for ESRS E1-6 AR 40(g)-(i) style boundary / methods disclosure. */
export function buildMethodologyPack() {
  return {
    title: "GreenRoute AI inference environmental methodology",
    factor_version: ESG_FACTOR_VERSION,
    ecologits_version: ECOLOGITS_VERSION,
    ml_energy_benchmark_date: "2025 (Chung et al., ML.ENERGY Leaderboard — reference only)",
    grid_mix_source: "Our World in Data / EcoLogits electricity_mix_zone WOR (world average)",
    ademe_factors: "ADEME Base Empreinte — referenced via EcoLogits methodology; not applied as spend-based factors",
    boaviztapi_reference: "BoaviztAPI reference instance — EcoLogits hardware embodied pathway when split is available",
    wri_water_factors: "WRI water factors via EcoLogits WCF when present",
    pue: null as number | null,
    wue: null as number | null,
    pue_wue_note: "PUE/WUE not supplier-disclosed for Gemini; reported as methodology parameters when available.",
    hardware_lifetime_years: 3,
    electricity_mix_zone: ESG_REGION,
    scope: "Scope 3 Category 1 (purchased AI inference services). Category 2 only if we owned GPUs (we do not).",
    aggregation_method:
      "Per-request logging; monthly sum-over-sum ratios (never average of ratios); Average-data / location-based under GHG Protocol hierarchy. Supplier-published data would outrank EcoLogits when present.",
    exclusions: [...ESG_EXCLUSIONS],
    iso_esg_mapping: ISO_ESG_MAPPING.filter((row) => !row.internal_only),
    not_calculable: [...NOT_CALCULABLE],
    audit_tier_default: "average-data" as const,
    primary_data_share: "0% supplier-specific metering; 100% Average-data EcoLogits or published fallback factors.",
    guardrails: [
      "No spend-based emissions estimation.",
      "Never invent excluded metrics.",
      "Usage and embodied GWP stored separately; onsite and offsite water stored separately.",
      "ADPe internal only.",
    ],
  };
}
