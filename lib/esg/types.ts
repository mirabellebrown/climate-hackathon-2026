// Canonical per-request record (spec §3) plus the classification stored at ingestion (spec §7).
export const PROVIDERS = ["anthropic", "openai", "google", "mistral", "cohere", "other"] as const;
export type Provider = typeof PROVIDERS[number];
export type Confidence = "high" | "moderate" | "low";
export type DataTier = "Average-data" | "Supplier-specific";

// Flows a supplier-published figure may replace, expressed per 1,000 output tokens.
export const OVERRIDABLE = ["energy_wh", "gwp_usage_g", "gwp_embodied_g", "water_ml_onsite", "water_ml_offsite"] as const;
export type OverridableField = typeof OVERRIDABLE[number];

export interface EcoLogitsBlock {
  version: string;
  // Factor-set lineage: EcoLogits version + ML.ENERGY date + grid vintage + PUE/WUE + lifetime.
  factor_version: string;
  ml_energy_benchmark_date: string;
  grid_mix_vintage: string;
  hardware_lifetime_years: number;
  energy_wh: number;
  gwp_usage_g: number;
  gwp_embodied_g: number;
  adpe_kgsbeq: number;
  pe_mj: number;
  water_ml_onsite: number;
  water_ml_offsite: number;
  pue: number;
  wue_onsite_l_per_kwh: number;
  grid_intensity_source: string;
  estimate_confidence: Confidence;
}

export interface EsgRecord {
  request_id: string;
  ts_utc: string;
  org: { user_id: string; team_id: string; cost_center: string; manager_id: string };
  call: {
    provider: Provider;
    model: string;
    model_is_proprietary: boolean;
    region: string;
    latency_s: number;
    tokens_in: number;
    tokens_out: number;
  };
  cost: { currency: "USD"; amount: number; source: "provider_price_list" | "invoice" | "internal_rate" };
  ecologits: EcoLogitsBlock;
  supplier_override: {
    applied: boolean;
    source: string;
    fields: OverridableField[];
    // The EcoLogits estimate that was replaced, kept as a cross-check.
    ecologits_estimate?: Partial<Record<OverridableField, number>>;
  };
  classification: {
    // API/SaaS consumption: Category 1 (Purchased Goods and Services). Owned GPUs are not supported in v1.
    scope3_category: 1;
    data_tier: DataTier;
  };
}

export interface Measures {
  gwp_usage_g: number;
  gwp_embodied_g: number;
  energy_wh: number;
  pe_mj: number;
  adpe_kgsbeq: number;
  water_ml_onsite: number;
  water_ml_offsite: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  request_count: number;
  supplier_specific_count: number;
}

export interface SupplierOverride {
  id: string;
  provider: Provider;
  model: string | null;
  metric: OverridableField;
  value: number;
  unit: string;
  source_url: string;
  effective_from: string;
  effective_to: string;
  registered_at: string;
}

export interface RevenueEntry { period: string; currency: "USD"; net_revenue: number; entered_at: string }

export interface EsgSettings {
  fiscal_year_start_month: number;
  revenue: RevenueEntry[];
  overrides: SupplierOverride[];
}
