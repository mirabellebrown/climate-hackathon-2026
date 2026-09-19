import registry from "./registry.json";
import exclusionsFile from "./exclusions.json";
import {
  auditTier, baselineWindow, decompose, fiscalYearOf, gwp, longContextTeams, materiality, monthOf, monthsIn,
  parsePeriod, present, PROVIDER_ORDER, ratios, rollup, scaled, segmentOf, sum, versions, within, worstConfidence,
  type BaselineKind, type Period,
} from "./aggregate";
import type { EsgRecord, EsgSettings, Measures, Provider } from "./types";

export const REGISTRY = registry;
export const EXCLUSIONS = exclusionsFile.exclusions;
export type Dimension = "provider" | "model" | "team" | "region";
export const DIMENSIONS: Dimension[] = ["provider", "model", "team", "region"];

export class QueryError extends Error {}

export interface Query { period?: string | null; scope?: string | null; baseline?: string | null }

/** Resolves filters shared by every endpoint and the context bar. */
export function resolve(records: EsgRecord[], settings: EsgSettings, query: Query, sample: boolean) {
  const fy = settings.fiscal_year_start_month;
  const months = [...new Set(records.map((r) => monthOf(r.ts_utc)))].sort();
  const years = [...new Set(records.map((r) => fiscalYearOf(r.ts_utc, fy)))].sort();
  const teams = [...new Set(records.map((r) => r.org.team_id))].sort();
  let period: Period;
  try { period = parsePeriod(query.period || months.at(-1) || "2026-01", fy); } catch (error) { throw new QueryError((error as Error).message); }
  const scope = query.scope && query.scope !== "org" ? query.scope : "org";
  if (scope !== "org" && !teams.includes(scope)) throw new QueryError(`Unknown team "${scope}".`);
  const baselineKind: BaselineKind = query.baseline === "fytd" ? "fytd" : "previous";
  const inScope = scope === "org" ? records : records.filter((r) => r.org.team_id === scope);
  const current = within(inScope, period.start, period.end);
  const window = baselineWindow(period, baselineKind, fy);
  const baseline = within(inScope, window.start, window.end);
  return { period, scope, baselineKind, window, inScope, current, baseline, options: { months, fiscal_years: years, teams }, settings, sample };
}
export type Context = ReturnType<typeof resolve>;

function envelope(ctx: Context, totals: Measures) {
  const v = versions(ctx.current);
  return {
    generated_at: new Date().toISOString(),
    registry_version: REGISTRY.registry_version,
    factor_version: v.factor_versions.at(-1) ?? null,
    factor_versions: v.factor_versions,
    ecologits_version: v.ecologits_versions.at(-1) ?? null,
    ecologits_versions: v.ecologits_versions,
    sample: ctx.sample,
    period: { id: ctx.period.id, label: ctx.period.label, start: ctx.period.start, end: ctx.period.end },
    scope: ctx.scope,
    baseline: { kind: ctx.baselineKind, label: ctx.window.label },
    audit_tier: auditTier(totals),
    exclusions: EXCLUSIONS,
  };
}

const delta = (current: number | null, base: number | null) => ({
  current, baseline: base,
  abs: current !== null && base !== null ? current - base : null,
  pct: current !== null && base !== null && base !== 0 ? (current - base) / Math.abs(base) * 100 : null,
});

function revenueFor(ctx: Context) {
  return ctx.settings.revenue.find((entry) => entry.period === ctx.period.id) ?? null;
}

export function summary(ctx: Context) {
  const totals = sum(ctx.current);
  const base = scaled(sum(ctx.baseline), ctx.window.scale);
  const now = present(totals), then = present(base);
  const revenue = revenueFor(ctx);
  const keys = ["tco2e_total", "ci_tok", "cpd", "tpd", "mwh", "m3_water", "cost_usd", "tokens_out"] as const;
  return {
    ...envelope(ctx, totals),
    ...now,
    scope3_category: "Scope 3 Category 1 (Purchased Goods and Services)",
    method: "Location-based",
    has_baseline: base.request_count > 0,
    deltas: Object.fromEntries(keys.map((key) => [key, delta(now[key], base.request_count ? then[key] : null)])),
    decomposition: base.request_count ? decompose(rollup(ctx.current, segmentOf), scaleMap(rollup(ctx.baseline, segmentOf), ctx.window.scale)) : null,
    materiality: materiality(totals),
    long_context: longContextTeams(ctx.current),
    revenue: revenue ? { ...revenue, tco2e_per_musd: now.tco2e_total / (revenue.net_revenue / 1e6) } : null,
    confidence: worstConfidence(ctx.current),
    low_confidence_share: ctx.current.length ? ctx.current.filter((r) => r.ecologits.estimate_confidence === "low").length / ctx.current.length : 0,
  };
}

function scaleMap(map: Map<string, Measures>, factor: number) {
  return new Map([...map].map(([key, m]) => [key, scaled(m, factor)]));
}

function params(records: EsgRecord[]) {
  const byProvider = new Map<Provider, { pue: Set<number>; wue: Set<number>; lifetime: Set<number> }>();
  for (const r of records) {
    const entry = byProvider.get(r.call.provider) ?? { pue: new Set(), wue: new Set(), lifetime: new Set() };
    entry.pue.add(r.ecologits.pue); entry.wue.add(r.ecologits.wue_onsite_l_per_kwh); entry.lifetime.add(r.ecologits.hardware_lifetime_years);
    byProvider.set(r.call.provider, entry);
  }
  return PROVIDER_ORDER.filter((p) => byProvider.has(p)).map((provider) => {
    const e = byProvider.get(provider)!;
    return { provider, pue: [...e.pue].sort(), wue_onsite_l_per_kwh: [...e.wue].sort(), hardware_lifetime_years: [...e.lifetime].sort() };
  });
}

export function metrics(ctx: Context) {
  const totals = sum(ctx.current);
  const p = present(totals);
  const mat = materiality(totals);
  const parameters = params(ctx.current);
  const values: Record<string, { value: number | null; unit: string; note?: string; detail?: unknown }> = {
    energy_total: { value: p.mwh, unit: "MWh" },
    gpu_energy: { value: null, unit: "Wh", note: "EcoLogits records do not report the GPU share separately; kept for internal diagnostics." },
    pue: { value: null, unit: "ratio", note: "Reported as a parameter per provider.", detail: parameters.map(({ provider, pue }) => ({ provider, pue })) },
    wue: { value: null, unit: "L/kWh", note: "On-site WUE per provider; off-site uses WRI generation factors.", detail: parameters.map(({ provider, wue_onsite_l_per_kwh }) => ({ provider, wue_onsite_l_per_kwh })) },
    carbon_efficiency: { value: p.ci_tok, unit: "gCO2e/1k output tokens", detail: { gco2e_per_request: p.gco2e_per_request } },
    carbon_intensity_model: { value: p.ci_tok, unit: "gCO2e/1k output tokens" },
    sci: { value: p.gco2e_per_request, unit: "gCO2e/request" },
    gwp_operational: { value: p.tco2e_usage, unit: "tCO2e" },
    gwp_embodied: { value: p.tco2e_embodied, unit: "tCO2e", detail: mat },
    adpe: { value: p.adpe_kgsbeq, unit: "kgSbeq", note: "Internal only. Not ESG-reportable today." },
    pe_primary: { value: p.pe_mwh, unit: "MWh", note: "Do not add to emissions." },
    wcf: { value: p.m3_water, unit: "m3", detail: { onsite_m3: p.m3_water_onsite, offsite_m3: p.m3_water_offsite } },
    methodology: { value: null, unit: "text", note: "See /api/v1/esg/disclosure/methodology." },
  };
  return {
    ...envelope(ctx, totals),
    metrics: REGISTRY.metrics.map((entry) => ({ ...entry, ...values[entry.key], copy_text: entry.copy.map((key) => REGISTRY.copy[key as keyof typeof REGISTRY.copy]) })),
    not_calculable: REGISTRY.not_calculable,
    glossary: REGISTRY.glossary,
  };
}

function dimensionKey(dimension: Dimension) {
  return (r: EsgRecord) => dimension === "provider" ? r.call.provider : dimension === "model" ? r.call.model : dimension === "team" ? r.org.team_id : r.call.region;
}

export function breakdown(ctx: Context, dimension: Dimension) {
  const totals = sum(ctx.current);
  const groups = new Map<string, EsgRecord[]>();
  for (const r of ctx.current) { const k = dimensionKey(dimension)(r); groups.set(k, [...(groups.get(k) ?? []), r]); }
  const rows = [...groups].map(([key, records]) => {
    const m = sum(records);
    const p = present(m);
    return { key, provider: records[0].call.provider, providers: [...new Set(records.map((r) => r.call.provider))], tco2e: p.tco2e_total, tco2e_usage: p.tco2e_usage, tco2e_embodied: p.tco2e_embodied, ci_tok: p.ci_tok, cost_usd: p.cost_usd, tokens_out: p.tokens_out, tpd: p.tpd, cpd: p.cpd, requests: p.requests, confidence: worstConfidence(records), audit_tier: auditTier(m) };
  }).sort((a, b) => b.tco2e - a.tco2e || a.key.localeCompare(b.key));
  return { ...envelope(ctx, totals), dimension, rows };
}

export function trend(ctx: Context) {
  const totals = sum(ctx.current);
  const end = ctx.period.end;
  const first = ctx.options.months[0] ? `${ctx.options.months[0]}-01T00:00:00.000Z` : ctx.period.start;
  const startCandidate = new Date(Date.UTC(new Date(end).getUTCFullYear(), new Date(end).getUTCMonth() - 12, 1)).toISOString();
  const start = startCandidate > first ? startCandidate : first;
  const monthly = rollup(within(ctx.inScope, start, end), (r) => monthOf(r.ts_utc));
  const providers = PROVIDER_ORDER.filter((p) => ctx.inScope.some((r) => r.call.provider === p));
  let previousVersions = "";
  const series = monthsIn(start, end).map((month) => {
    const records = ctx.inScope.filter((r) => monthOf(r.ts_utc) === month);
    const m = monthly.get(month);
    const byProvider = rollup(records, (r) => r.call.provider);
    const v = versions(records).factor_versions.join(" + ");
    const changed = previousVersions !== "" && v !== "" && v !== previousVersions;
    if (v) previousVersions = v;
    return {
      month, ...(m ? present(m) : { tco2e_total: null, tco2e_usage: null, tco2e_embodied: null, mwh: null, m3_water_onsite: null, m3_water_offsite: null, ci_tok: null, cost_usd: null, tokens_out: null }),
      ci_tok_by_provider: Object.fromEntries(providers.map((provider) => [provider, byProvider.get(provider) ? ratios(byProvider.get(provider)!).ci_tok : null])),
      factor_versions: v, factor_version_changed: changed,
      embodied_material: m ? materiality(m).material : false,
    };
  });
  return { ...envelope(ctx, totals), providers, series, baseline: summary(ctx).deltas.ci_tok.baseline };
}

export function frontier(ctx: Context) {
  const totals = sum(ctx.current);
  const groups = new Map<string, EsgRecord[]>();
  for (const r of ctx.current) groups.set(r.call.model, [...(groups.get(r.call.model) ?? []), r]);
  const points = [...groups].map(([model, records]) => {
    const m = sum(records);
    return { model, provider: records[0].call.provider, usd_per_1m_tokens: m.tokens_out ? m.cost_usd / m.tokens_out * 1e6 : null, gco2e_per_1m_tokens: m.tokens_out ? gwp(m) / m.tokens_out * 1e6 : null, tokens_out: m.tokens_out, confidence: worstConfidence(records), audit_tier: auditTier(m) };
  }).sort((a, b) => a.model.localeCompare(b.model));
  const org = present(totals);
  return { ...envelope(ctx, totals), points, org_cpd: org.cpd };
}

const POSTURE_NOTE: Record<string, string> = {
  "Internal": "Internal diagnostic only; not filed in any disclosure.",
  "Report as parameter": "Disclosed as a methodology parameter, not as a total.",
  "Report with caveat": "Optional KPI; disclose with the methodology and its inference-only boundary.",
};

const STANDARD = (targets: string[], prefix: string) => targets.filter((t) => t.startsWith(prefix)).join("; ") || "—";

export function mapping(ctx: Context) {
  const totals = sum(ctx.current);
  const s = summary(ctx);
  const values = metrics(ctx).metrics;
  const rows = REGISTRY.metrics.map((entry) => {
    const related = EXCLUSIONS.filter((ex) => ex.affects.some((a) => entry.esg_targets.some((t) => t.startsWith(a) || a.startsWith(t.split(" (")[0]))));
    return {
      key: entry.key, iso_clause: entry.iso_clause, metric: entry.iso_name, plain: entry.plain,
      esrs: STANDARD(entry.esg_targets, "ESRS"), gri: STANDARD(entry.esg_targets, "GRI"), ifrs_s2: STANDARD(entry.esg_targets, "IFRS"), sasb: STANDARD(entry.esg_targets, "SASB"),
      ghg_scope3: entry.ghg_protocol, audit_tier: entry.audit_tier, posture: entry.posture,
      boundary_check: [
        ...entry.copy.map((key) => REGISTRY.copy[key as keyof typeof REGISTRY.copy]),
        related.length ? `Excludes: ${related.map((ex) => ex.title.toLowerCase()).join(", ")}.` : "",
        !entry.copy.length && !related.length ? POSTURE_NOTE[entry.posture] ?? `${entry.posture}.` : "",
      ].filter(Boolean).join(" "),
    };
  });
  const readiness = REGISTRY.disclosures.map((d) => {
    const available = d.metrics.every((key) => { const v = values.find((m) => m.key === key)?.value; return v !== null && v !== undefined && v > 0; });
    const caveats = EXCLUSIONS.filter((ex) => ex.affects.some((a) => d.id.startsWith(a) || a.startsWith(d.id)));
    const blocked = !available || (d.needs_revenue && !s.revenue);
    return {
      id: d.id, requirement: d.requirement, data_available: available, audit_tier: auditTier(totals),
      caveats: caveats.map((ex) => ex.title),
      status: blocked ? "blocked" : caveats.length ? "caveats" : "ready",
      note: !available ? "No data in scope for this period." : d.needs_revenue && !s.revenue ? "Enter net revenue for this period to compute intensity per revenue." : caveats.length ? "Ready to file with the listed boundary caveats disclosed." : "Ready to file.",
    };
  });
  return { ...envelope(ctx, totals), rows, not_calculable: REGISTRY.not_calculable, readiness };
}

export function methodology(ctx: Context) {
  const totals = sum(ctx.current);
  const v = versions(ctx.current);
  const provenance = {
    ml_energy: [...new Set(ctx.current.map((r) => r.ecologits.ml_energy_benchmark_date))].sort(),
    grid: [...new Set(ctx.current.map((r) => r.ecologits.grid_mix_vintage))].sort(),
  };
  const supplierShare = totals.request_count ? totals.supplier_specific_count / totals.request_count : 0;
  const lowShare = ctx.current.length ? ctx.current.filter((r) => r.ecologits.estimate_confidence === "low").length / ctx.current.length : 0;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const sections = [
    { id: "tool", title: "1. Tool and version", lines: [
      `Estimates produced with EcoLogits, version(s) ${v.ecologits_versions.join(", ") || "none in scope"}.`,
      `Factor set(s): ${v.factor_versions.join(", ") || "none in scope"}.`,
      "Integration point: canonical per-request records posted to POST /api/v1/esg/records by the EcoLogits integration.",
      ...(ctx.sample ? ["SAMPLE DATA: these records are illustrative and are not EcoLogits output or any organization's figures."] : []),
    ] },
    { id: "provenance", title: "2. Benchmark and factor provenance", lines: [
      `ML.ENERGY leaderboard date(s): ${provenance.ml_energy.join(", ") || "n/a"}.`,
      `Grid carbon intensity: Our World in Data, vintage(s) ${provenance.grid.join(", ") || "n/a"}.`,
      "ADPe and primary-energy factors: ADEME Base Empreinte.",
      "Embodied impacts: BoaviztAPI reference instance.",
      "Off-site water: World Resources Institute electricity-generation water intensity factors.",
    ] },
    { id: "parameters", title: "3. Parameters used", lines: [
      ...params(ctx.current).map((p) => `${p.provider}: PUE ${p.pue.join("/")}, on-site WUE ${p.wue_onsite_l_per_kwh.join("/")} L/kWh, hardware lifetime ${p.hardware_lifetime_years.join("/")} years.`),
      "Reference hardware: BoaviztAPI reference server and GPU instance, as modelled by EcoLogits.",
    ] },
    { id: "boundary", title: "4. Boundary statement", lines: [
      "Included: operational electricity for inference, with location-based grid carbon intensity; embodied server and GPU impacts allocated by request latency over a 3-year hardware lifetime.",
      "Excluded:",
      ...EXCLUSIONS.map((ex) => `- ${ex.title}: ${ex.statement}`),
    ] },
    { id: "tiers", title: "5. Estimation tier per parameter", lines: [
      ...REGISTRY.metrics.filter((m) => m.key !== "methodology").map((m) => `${m.iso_name} (${m.iso_clause}): ${m.audit_tier}; posture: ${m.posture}.`),
      `Share of primary (Supplier-specific) data: ${pct(supplierShare)} of requests.`,
      "Improvement path: request supplier-specific energy, embodied carbon and WUE data; update PUE when providers publish new figures; prefer provider regional carbon intensity where published.",
      REGISTRY.copy.estimate_tier,
    ] },
    { id: "precision", title: "6. Precision statement", lines: [
      "Figures are approximate, order-of-magnitude estimates; EcoLogits reports each impact as a min/max interval.",
      `Estimates for proprietary model architectures may be off by 2x to 5x. ${pct(lowShare)} of requests in scope are low confidence.`,
    ] },
    { id: "aggregation", title: "7. Aggregation method", lines: [
      "Per-request logging; summation by team, provider, model, region and month; conversion to tonnes CO2e (g / 1,000,000), MWh (Wh / 1,000,000; MJ / 3,600) and m3 (mL / 1,000,000) at export only.",
      "Classified as GHG Protocol Scope 3 Category 1 (Purchased Goods and Services) for API consumption.",
      "Method: Average-data, or Supplier-specific where a provider-published figure is registered, under the GHG Protocol data hierarchy. Location-based only.",
      "Ratios are computed as the sum of numerators over the sum of denominators at every level; per-request ratios are never averaged.",
    ] },
  ];
  return { ...envelope(ctx, totals), title: "Methodology and boundary disclosure (ESRS E1-6 AR 40(g)-(i))", sections };
}
