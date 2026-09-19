import { OVERRIDABLE, PROVIDERS, type EsgRecord, type OverridableField, type SupplierOverride } from "./types";

export class EsgInputError extends Error {}

const fail = (path: string, message: string): never => { throw new EsgInputError(`${path}: ${message}`); };
const obj = (value: unknown, path: string) => (typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : fail(path, "must be an object"));
const str = (value: unknown, path: string, max = 200) => (typeof value === "string" && value.trim() && value.length <= max ? value : fail(path, "must be a non-empty string"));
const num = (value: unknown, path: string) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fail(path, "must be a finite, nonnegative number"));
const int = (value: unknown, path: string) => (Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : fail(path, "must be a nonnegative integer"));
const iso = (value: unknown, path: string) => { const text = str(value, path, 40); return Number.isNaN(Date.parse(text)) ? fail(path, "must be an ISO-8601 timestamp") : new Date(text).toISOString(); };
const oneOf = <T extends string>(value: unknown, options: readonly T[], path: string) => (options.includes(value as T) ? value as T : fail(path, `must be one of ${options.join(", ")}`));

/** Validates one canonical record (spec §3). Unknown data is rejected, never coerced or guessed. */
export function parseRecord(input: unknown, path = "record"): Omit<EsgRecord, "classification"> {
  const record = obj(input, path);
  const org = obj(record.org, `${path}.org`);
  const call = obj(record.call, `${path}.call`);
  const cost = obj(record.cost, `${path}.cost`);
  const eco = obj(record.ecologits, `${path}.ecologits`);
  const override = record.supplier_override === undefined ? { applied: false, source: "", fields: [] } : obj(record.supplier_override, `${path}.supplier_override`);
  if (cost.currency !== "USD") fail(`${path}.cost.currency`, "only USD is supported; no exchange rates are applied");
  const region = str(call.region, `${path}.call.region`, 2);
  if (!/^[A-Z]{2}$/.test(region)) fail(`${path}.call.region`, "must be an ISO-3166-1 alpha-2 code");
  const proprietary = call.model_is_proprietary;
  if (typeof proprietary !== "boolean") fail(`${path}.call.model_is_proprietary`, "must be true or false");
  const fields = Array.isArray(override.fields) ? override.fields.map((field, index) => oneOf(field, OVERRIDABLE, `${path}.supplier_override.fields[${index}]`)) : fail(`${path}.supplier_override.fields`, "must be an array");
  return {
    request_id: str(record.request_id, `${path}.request_id`),
    ts_utc: iso(record.ts_utc, `${path}.ts_utc`),
    org: { user_id: str(org.user_id, `${path}.org.user_id`), team_id: str(org.team_id, `${path}.org.team_id`), cost_center: str(org.cost_center, `${path}.org.cost_center`), manager_id: str(org.manager_id, `${path}.org.manager_id`) },
    call: {
      provider: oneOf(call.provider, PROVIDERS, `${path}.call.provider`), model: str(call.model, `${path}.call.model`),
      model_is_proprietary: proprietary as boolean, region, latency_s: num(call.latency_s, `${path}.call.latency_s`),
      tokens_in: int(call.tokens_in, `${path}.call.tokens_in`), tokens_out: int(call.tokens_out, `${path}.call.tokens_out`),
    },
    cost: { currency: "USD", amount: num(cost.amount, `${path}.cost.amount`), source: oneOf(cost.source, ["provider_price_list", "invoice", "internal_rate"] as const, `${path}.cost.source`) },
    ecologits: {
      version: str(eco.version, `${path}.ecologits.version`), factor_version: str(eco.factor_version, `${path}.ecologits.factor_version`),
      ml_energy_benchmark_date: str(eco.ml_energy_benchmark_date, `${path}.ecologits.ml_energy_benchmark_date`),
      grid_mix_vintage: str(eco.grid_mix_vintage, `${path}.ecologits.grid_mix_vintage`),
      hardware_lifetime_years: num(eco.hardware_lifetime_years, `${path}.ecologits.hardware_lifetime_years`),
      energy_wh: num(eco.energy_wh, `${path}.ecologits.energy_wh`), gwp_usage_g: num(eco.gwp_usage_g, `${path}.ecologits.gwp_usage_g`),
      gwp_embodied_g: num(eco.gwp_embodied_g, `${path}.ecologits.gwp_embodied_g`), adpe_kgsbeq: num(eco.adpe_kgsbeq, `${path}.ecologits.adpe_kgsbeq`),
      pe_mj: num(eco.pe_mj, `${path}.ecologits.pe_mj`), water_ml_onsite: num(eco.water_ml_onsite, `${path}.ecologits.water_ml_onsite`),
      water_ml_offsite: num(eco.water_ml_offsite, `${path}.ecologits.water_ml_offsite`), pue: num(eco.pue, `${path}.ecologits.pue`),
      wue_onsite_l_per_kwh: num(eco.wue_onsite_l_per_kwh, `${path}.ecologits.wue_onsite_l_per_kwh`),
      grid_intensity_source: str(eco.grid_intensity_source, `${path}.ecologits.grid_intensity_source`),
      // Proprietary architectures are inferred, so they default to low confidence (possibly off by 2x to 5x).
      estimate_confidence: eco.estimate_confidence === undefined ? (proprietary ? "low" : "moderate") : oneOf(eco.estimate_confidence, ["high", "moderate", "low"] as const, `${path}.ecologits.estimate_confidence`),
    },
    supplier_override: { applied: override.applied === true, source: typeof override.source === "string" ? override.source : "", fields },
  };
}

/** Applies registered supplier figures at ingestion. Supplier data wins; the EcoLogits value is kept for cross-check. */
export function classify(record: Omit<EsgRecord, "classification">, overrides: SupplierOverride[]): EsgRecord {
  const matching = overrides.filter((override) => override.provider === record.call.provider
    && (override.model === null || override.model === record.call.model)
    && record.ts_utc >= override.effective_from && record.ts_utc < override.effective_to);
  let next = record;
  if (matching.length && record.call.tokens_out > 0) {
    const ecologits = { ...record.ecologits };
    const estimate: Partial<Record<OverridableField, number>> = { ...record.supplier_override.ecologits_estimate };
    const fields = new Set(record.supplier_override.fields);
    for (const override of matching) {
      estimate[override.metric] ??= record.ecologits[override.metric];
      ecologits[override.metric] = override.value * record.call.tokens_out / 1000;
      fields.add(override.metric);
    }
    next = { ...record, ecologits, supplier_override: { applied: true, source: matching.map((override) => override.source_url).join(" ; "), fields: [...fields], ecologits_estimate: estimate } };
  }
  return { ...next, classification: { scope3_category: 1, data_tier: next.supplier_override.applied ? "Supplier-specific" : "Average-data" } };
}

export function parseOverride(input: unknown): Omit<SupplierOverride, "id" | "registered_at"> {
  const data = obj(input, "override");
  const from = iso(data.effective_from, "override.effective_from");
  const to = iso(data.effective_to, "override.effective_to");
  if (to <= from) fail("override.effective_to", "must be after effective_from");
  const url = str(data.source_url, "override.source_url", 500);
  if (!/^https:\/\//.test(url)) fail("override.source_url", "must be an https URL to the provider's publication");
  const metric = oneOf(data.metric, OVERRIDABLE, "override.metric");
  const unit = str(data.unit, "override.unit", 40);
  const expected = { energy_wh: "Wh/1k output tokens", gwp_usage_g: "gCO2e/1k output tokens", gwp_embodied_g: "gCO2e/1k output tokens", water_ml_onsite: "mL/1k output tokens", water_ml_offsite: "mL/1k output tokens" }[metric];
  if (unit !== expected) fail("override.unit", `must be "${expected}" for ${metric}`);
  return {
    provider: oneOf(data.provider, PROVIDERS, "override.provider"),
    model: data.model === undefined || data.model === null ? null : str(data.model, "override.model"),
    metric, value: num(data.value, "override.value"), unit, source_url: url, effective_from: from, effective_to: to,
  };
}
