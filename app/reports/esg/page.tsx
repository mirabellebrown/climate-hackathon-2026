"use client";

import "./esg.css";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, ArrowLeft, CheckCircle2, Download, Info, Leaf, MessageSquare, XCircle } from "lucide-react";
import { ChartCard, DataTable, fmt, HBars, Legend, LineChart, LowConfidenceKey, Scatter, SmallArea, StackedColumns, Waterfall, type LineSeries } from "@/components/esg/charts";
import { PROVIDER_LABEL, providerColor } from "@/lib/esg/palette";
import registry from "@/lib/esg/registry.json";
import type { breakdown, frontier, mapping, metrics, summary, trend } from "@/lib/esg/report";

type Summary = ReturnType<typeof summary> & { options: { months: string[]; fiscal_years: string[]; teams: string[] } };
type Metrics = ReturnType<typeof metrics>;
type Breakdown = ReturnType<typeof breakdown>;
type Trend = ReturnType<typeof trend>;
type Frontier = ReturnType<typeof frontier>;
type Mapping = ReturnType<typeof mapping>;
interface Data { summary: Summary; metrics: Metrics; trend: Trend; frontier: Frontier; mapping: Mapping }

const API = "/api/v1/esg";
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status}).`);
  return body as T;
}

/** An ISO or acronym term with its manager translation always one focus/hover away. */
function Term({ children, title, text }: { children: ReactNode; title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return <span className="esg-term">{children}
    <button type="button" aria-label={`What is ${title}?`} aria-expanded={open} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen((v) => !v)}><Info size={13} /></button>
    {open && <span className="esg-pop" role="tooltip"><strong>{title}</strong>{text}</span>}
  </span>;
}

function Status({ kind, children }: { kind: "good" | "warning" | "serious" | "critical"; children: ReactNode }) {
  const Icon = kind === "good" ? CheckCircle2 : kind === "warning" ? AlertTriangle : kind === "serious" ? AlertOctagon : XCircle;
  return <span className={`esg-status esg-status-${kind}`}><Icon size={14} aria-hidden="true" />{children}</span>;
}

function Delta({ d, unit, periodLabel }: { d: { abs: number | null; pct: number | null } | undefined; unit: string; periodLabel: string }) {
  if (!d || d.abs === null) return <span className="esg-kpi-delta">No baseline data</span>;
  const arrow = d.abs > 0 ? "▲" : d.abs < 0 ? "▼" : "■";
  return <span className="esg-kpi-delta">{arrow} {d.abs > 0 ? "+" : ""}{fmt(d.abs)} {unit}{d.pct !== null ? ` (${d.pct > 0 ? "+" : ""}${d.pct.toFixed(1)}%)` : ""} vs {periodLabel.toLowerCase()}</span>;
}

function Kpi({ label, value, unit, delta, target, tier, info }: { label: string; value: string; unit: string; delta: ReactNode; target: string; tier: string; info: { title: string; text: string } }) {
  return <div className="esg-kpi">
    <div className="esg-kpi-label"><Term title={info.title} text={info.text}>{label}</Term></div>
    <div className="esg-kpi-value">{value}</div>
    <div className="esg-kpi-unit">{unit}</div>
    {delta}
    <div className="esg-kpi-target">{target}</div>
    <span className="esg-chip" title="GHG Protocol data tier">{tier}</span>
  </div>;
}

export default function EsgReportPage() {
  const [query, setQuery] = useState({ period: "", scope: "org", baseline: "previous" });
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dimension, setDimension] = useState<"provider" | "model" | "team" | "region">("provider");
  const [measure, setMeasure] = useState<"tco2e" | "ci_tok" | "cost_usd">("tco2e");
  const [rows, setRows] = useState<Breakdown | null>(null);
  const [standard, setStandard] = useState("All");
  const [exporting, setExporting] = useState<string | null>(null);
  const [revenueInput, setRevenueInput] = useState("");
  const [revenueMessage, setRevenueMessage] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const qs = useMemo(() => new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString(), [query]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const [s, m, t, f, mp] = await Promise.all([getJson<Summary>(`/summary?${qs}`), getJson<Metrics>(`/metrics?${qs}`), getJson<Trend>(`/trend?${qs}`), getJson<Frontier>(`/efficiency-frontier?${qs}`), getJson<Mapping>(`/disclosure/mapping?${qs}`)]);
        if (!active) return;
        setData({ summary: s, metrics: m, trend: t, frontier: f, mapping: mp });
        setError(null);
        if (!query.period) setQuery((q) => ({ ...q, period: s.period.id }));
      } catch (e) { if (active) setError((e as Error).message); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [qs, query.period, reload]);

  useEffect(() => {
    let active = true;
    getJson<Breakdown>(`/breakdown?${qs}&dimension=${dimension}`).then((b) => { if (active) setRows(b); }).catch(() => {});
    return () => { active = false; };
  }, [qs, dimension, reload]);

  async function exportPack(format: "csv" | "xlsx" | "pdf") {
    setExporting(format);
    try {
      const response = await fetch(`${API}/disclosure/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format, ...query }) });
      if (!response.ok) throw new Error((await response.json())?.error?.message ?? "Export failed.");
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? `ai-environmental-report.${format}`;
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError((e as Error).message); }
    finally { setExporting(null); }
  }

  async function saveRevenue() {
    const value = Number(revenueInput.replace(/[,\s$]/g, ""));
    if (!Number.isFinite(value) || value <= 0) { setRevenueMessage("Enter net revenue as a positive number of US dollars."); return; }
    const response = await fetch(`${API}/settings/revenue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period: query.period, net_revenue: value, currency: "USD" }) });
    const body = await response.json();
    setRevenueMessage(response.ok ? `Saved USD ${fmt(value, 6)} for ${data?.summary.period.label}. The change is audit-logged.` : body?.error?.message ?? "Could not save.");
    if (response.ok) { setRevenueInput(""); setReload((n) => n + 1); }
  }

  const s = data?.summary;
  const metricBy = (key: string) => data?.metrics.metrics.find((m) => m.key === key);
  const copy = (key: keyof typeof registry.copy) => registry.copy[key];

  const trendMonths = data?.trend.series.map((m) => m.month) ?? [];
  const lineSeries: LineSeries[] = data ? [
    ...data.trend.providers.map((p) => ({ id: p, label: PROVIDER_LABEL[p] ?? p, color: providerColor(p), values: data.trend.series.map((m) => (m.ci_tok_by_provider as Record<string, number | null>)[p] ?? null) })),
    { id: "org", label: "Weighted average", color: "var(--esg-ink)", weight: 3, values: data.trend.series.map((m) => m.ci_tok as number | null) },
  ] : [];
  const annotations = data ? data.trend.series.map((m, i) => ({ m, i })).filter(({ m }) => m.factor_version_changed).map(({ i }) => ({ index: i, label: "Factor update" })) : [];

  const frontierPoints = (data?.frontier.points ?? []).filter((p) => p.usd_per_1m_tokens !== null && p.gco2e_per_1m_tokens !== null).map((p) => ({
    id: p.model, label: p.model, x: p.usd_per_1m_tokens!, y: p.gco2e_per_1m_tokens!, size: p.tokens_out, color: providerColor(p.provider), lowConfidence: p.confidence === "low",
    detail: [`$${fmt(p.usd_per_1m_tokens)} per 1M output tokens`, `${fmt(p.gco2e_per_1m_tokens)} gCO2e per 1M output tokens`, `${fmt(p.tokens_out)} output tokens`, `${PROVIDER_LABEL[p.provider] ?? p.provider} · ${p.audit_tier}`],
  }));
  const isoLines = data?.frontier.org_cpd ? [0.25, 0.5, 1, 2, 4].map((k) => data.frontier.org_cpd! * k) : [];
  const providersInFrontier = [...new Set((data?.frontier.points ?? []).map((p) => p.provider))];

  const measureMeta = { tco2e: { unit: "tCO2e", label: "Emissions" }, ci_tok: { unit: "gCO2e/1k tok", label: "Carbon intensity" }, cost_usd: { unit: "USD", label: "Cost" } }[measure];
  const barRows = (rows?.rows ?? []).map((r) => ({ key: r.key, label: dimension === "provider" ? PROVIDER_LABEL[r.key] ?? r.key : r.key, value: (r[measure] ?? 0) as number,
    color: dimension === "provider" || dimension === "model" ? providerColor(r.provider) : "var(--esg-split-1)",
    detail: [`${fmt(r.tco2e)} tCO2e`, `${fmt(r.ci_tok)} gCO2e/1k tok`, `$${fmt(r.cost_usd)}`, `${fmt(r.tpd)} tokens/$`, r.confidence === "low" ? "Low confidence" : `${r.confidence} confidence`] }))
    .sort((a, b) => b.value - a.value);

  const splitMonths = data?.trend.series.filter((m) => m.tco2e_total !== null) ?? [];
  const materialMonths = splitMonths.filter((m) => m.embodied_material).length;
  const d = s?.decomposition;
  const filteredRows = (data?.mapping.rows ?? []).filter((r) => standard === "All" || [r.esrs, r.gri, r.ifrs_s2, r.sasb].join(" ").includes(standard));

  return <div className="esg-root">
    <header className="esg-header">
      <Link className="esg-brand" href="/" aria-label="GreenRoute home"><Leaf size={22} strokeWidth={1.7} />GreenRoute</Link>
      <div className="esg-header-actions">
        <span className="esg-header-pill"><span />Carbon-aware AI</span>
        <Link className="esg-pill-link" href="/"><MessageSquare size={15} />Team chat</Link>
      </div>
    </header>
    <main className="esg-shell">
      <div className="esg-top">
        <Link className="esg-back" href="/"><ArrowLeft size={15} />Back to team chat</Link>
        <p className="esg-kicker">ESG reporting · Manager view</p>
      </div>
      <div className="esg-title">
        <p className="esg-eyebrow">ISO/IEC TR 20226 · ESRS · GRI · IFRS S2 · SASB</p>
        <h1>AI Environmental Reporting</h1>
        <p>ISO/IEC TR 20226 metrics mapped to your ESG disclosures.</p>
      </div>

      <div className="esg-context" role="group" aria-label="Report filters">
        <label>Period<select value={query.period} onChange={(e) => setQuery((q) => ({ ...q, period: e.target.value }))}>
          {s?.options.months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          {s?.options.fiscal_years.map((y) => <option key={y} value={y}>{y} (fiscal year)</option>)}
        </select></label>
        <label>Scope<select value={query.scope} onChange={(e) => setQuery((q) => ({ ...q, scope: e.target.value }))}>
          <option value="org">Whole organization</option>
          {s?.options.teams.map((t) => <option key={t} value={t}>Team: {t}</option>)}
        </select></label>
        <label>Compare with<select value={query.baseline} onChange={(e) => setQuery((q) => ({ ...q, baseline: e.target.value }))}>
          <option value="previous">Previous period</option>
          <option value="fytd">Fiscal year to date (monthly average)</option>
        </select></label>
        {s && <span className="esg-version" title={`Factor set(s): ${s.factor_versions.join(" + ")}`}>EcoLogits {s.ecologits_versions.join(", ")} · {s.factor_versions.length === 1 ? "1 factor set" : `${s.factor_versions.length} factor sets`}</span>}
      </div>

      {error && <p className="esg-error" role="alert">{error}</p>}
      {!s ? <p>{loading ? "Loading report…" : "No data."}</p> : <div className={`esg-stack${loading ? " esg-loading" : ""}`}>

        <section className="esg-section" aria-labelledby="kpi-title">
          <div className="esg-section-head"><p className="esg-eyebrow">{s.period.label} · {s.scope === "org" ? "Whole organization" : `Team ${s.scope}`}</p><h2 id="kpi-title">Your AI footprint</h2><p>Scope 3 emissions, energy and water from your AI API use, with the change against {s.baseline.label.toLowerCase()}.</p></div>
          <div className="esg-kpis">
            <Kpi label="Total AI emissions" value={fmt(s.tco2e_total)} unit="tCO2e" delta={<Delta d={s.deltas.tco2e_total} unit="t" periodLabel={s.baseline.label} />}
              target="Scope 3 Category 1, ESRS E1-6, location-based" tier={s.audit_tier}
              info={{ title: "Operational + embodied carbon (ISO 11.5.4 and 11.5.5)", text: `Greenhouse-gas emissions from running the AI requests and from manufacturing the hardware they use, in tonnes of CO2 equivalent. ${copy("scope3_cat1")}` }} />
            <Kpi label="Carbon intensity" value={fmt(s.ci_tok)} unit="gCO2e / 1k tokens" delta={<Delta d={s.deltas.ci_tok} unit="g" periodLabel={s.baseline.label} />}
              target="ISO 11.5.2, the AI-native KPI" tier={s.audit_tier}
              info={{ title: "Carbon intensity of the model (ISO 11.5.2)", text: "The grams of CO2e each 1,000 words of output costs the planet. Calculated as total emissions divided by output tokens, never as an average of per-request ratios." }} />
            <Kpi label="Emissions per dollar" value={fmt(s.cpd)} unit="gCO2e / USD" delta={<Delta d={s.deltas.cpd} unit="g/$" periodLabel={s.baseline.label} />}
              target="Cost and carbon bridge, see identity" tier={s.audit_tier}
              info={{ title: "Emissions per dollar", text: "Grams of CO2e per US dollar spent on AI. It equals carbon per 1,000 tokens × tokens per dollar ÷ 1,000: buying more tokens per dollar only lowers this if carbon per token does not rise to meet it." }} />
            <Kpi label="Energy" value={fmt(s.mwh)} unit="MWh" delta={<Delta d={s.deltas.mwh} unit="MWh" periodLabel={s.baseline.label} />}
              target="GRI 302-2, purchased AI services" tier={s.audit_tier}
              info={{ title: "Energy consumption per request (ISO 11.2.2)", text: `Electricity used in the data center, including cooling and building overhead (PUE). ${copy("energy_placement")}` }} />
            <Kpi label="Water" value={fmt(s.m3_water)} unit="m3 consumed" delta={<Delta d={s.deltas.m3_water} unit="m3" periodLabel={s.baseline.label} />}
              target="ESRS E3-3, embodied water excluded" tier={s.audit_tier}
              info={{ title: "Water Consumption Footprint (WCF)", text: `Water consumed on site for cooling (${fmt(s.m3_water_onsite)} m3) and off site to generate electricity (${fmt(s.m3_water_offsite)} m3). ${copy("water_placement")}` }} />
          </div>
          <div className="esg-exclusions-strip" aria-label="What these figures do not include">
            <strong>Not included in these figures:</strong> {s.exclusions.map((ex) => ex.title).join(" · ")}. <a href="#boundaries">Details</a>
            <br /><strong>Data tier:</strong> {s.audit_tier} (GHG Protocol) · <strong>Classification:</strong> {s.scope3_category}, location-based · <strong>Estimate confidence:</strong> {Math.round(s.low_confidence_share * 100)}% of requests are low confidence.
          </div>
          {s.long_context.map((row) => <div key={row.team} className="esg-warning-box" role="note"><AlertTriangle size={16} /><span><strong>Team {row.team}: prompts average {row.ratio.toFixed(1)}× longer than outputs.</strong> {copy("long_context")}</span></div>)}
        </section>

        <section className="esg-section" aria-labelledby="eff-title">
          <div className="esg-section-head"><p className="esg-eyebrow">Efficiency</p><h2 id="eff-title">Cost and carbon efficiency</h2><p>Your tokens-per-dollar figure, read alongside carbon. This period: {fmt(s.ci_tok)} gCO2e per 1k output tokens × {fmt(s.tpd)} output tokens per dollar ÷ 1,000 = <strong>{fmt(s.cpd)} gCO2e per dollar</strong>. Buying more tokens per dollar only lowers emissions per dollar if carbon per token doesn’t rise to meet it.</p></div>
          <div className="esg-grid-2">
            <ChartCard id="trend-title" title={<Term title="Carbon intensity of the model (ISO 11.5.2)" text="The grams of CO2e each 1,000 words of output costs the planet.">Carbon intensity by provider</Term>}
              subtitle="gCO2e per 1,000 output tokens, monthly. Heavier line: organization weighted average."
              legend={<Legend items={lineSeries.map((l) => ({ label: l.label, color: l.color, weight: l.weight }))} />}
              table={{ columns: ["Month", ...lineSeries.map((l) => l.label), "Factor version"], numeric: [false, ...lineSeries.map(() => true), false], rows: trendMonths.map((m, i) => [monthName(m), ...lineSeries.map((l) => l.values[i] ?? "—"), data!.trend.series[i].factor_versions]) }}
              footnote={annotations.length ? "The vertical rule marks a factor-version change. A step there is a methodology artifact, not a performance result." : undefined}>
              <LineChart months={trendMonths} series={lineSeries} unit="g/1k tok" annotations={annotations} label="Carbon intensity by provider over time" />
            </ChartCard>
            <ChartCard id="frontier-title" title="Which models are cheap and clean" subtitle="Each bubble is a model. Size is output-token volume. Lower-left is better on both. Faint diagonals are constant emissions per dollar."
              legend={<div className="esg-legend">{providersInFrontier.map((p) => <span key={p}><i className="esg-key-box" style={{ background: providerColor(p) }} />{PROVIDER_LABEL[p] ?? p}</span>)}<LowConfidenceKey /></div>}
              table={{ columns: ["Model", "Provider", "USD per 1M output tokens", "gCO2e per 1M output tokens", "Output tokens", "Confidence"], numeric: [false, false, true, true, true, false], rows: (data?.frontier.points ?? []).map((p) => [p.model, PROVIDER_LABEL[p.provider] ?? p.provider, p.usd_per_1m_tokens ?? "—", p.gco2e_per_1m_tokens ?? "—", p.tokens_out, p.confidence]) }}
              footnote="The cheapest model is not automatically the cleanest. Low-confidence points use inferred architectures and can be off by 2x to 5x.">
              <Scatter points={frontierPoints} iso={isoLines} xUnit="USD per 1M output tokens" yUnit="gCO2e per 1M output tokens" label="Cost versus carbon per model" />
            </ChartCard>
          </div>
        </section>

        <section className="esg-section" aria-labelledby="why-title">
          <div className="esg-section-head"><p className="esg-eyebrow">Change drivers</p><h2 id="why-title">Why did our number move?</h2><p>Change in total emissions against the baseline ({s.baseline.label.toLowerCase()}), split into three drivers that add up exactly to the change.</p></div>
          {d ? <ChartCard id="waterfall-title" title="Change in emissions, by driver" subtitle="tCO2e. Blue lowers emissions, red raises them; gray bars are the two totals."
            legend={<Legend items={[{ label: "Baseline and current totals", color: "var(--esg-total)", shape: "box" }, { label: "Lowers emissions", color: "var(--esg-down)", shape: "box" }, { label: "Raises emissions", color: "var(--esg-up)", shape: "box" }]} />}
            table={{ columns: ["Step", "tCO2e", "What it means"], numeric: [false, true, false], rows: [["Baseline", d.baseline_tco2e, s.baseline.label], ["Volume", d.volume, "More or fewer output tokens at the baseline intensity"], ["Mix", d.mix, "Shifting between models, providers or regions"], ["Intensity", d.intensity, "Per-token change within the current mix"], ["Current", d.current_tco2e, s.period.label]] }}>
            <Waterfall unit="tCO2e" label="Emissions change by volume, mix and intensity" steps={[
              { label: "Baseline", value: d.baseline_tco2e, kind: "total", note: s.baseline.label },
              { label: "Volume", value: d.volume, kind: "delta", note: "More or fewer output tokens at the baseline intensity." },
              { label: "Mix", value: d.mix, kind: "delta", note: "Shifting between models, providers or regions." },
              { label: "Intensity", value: d.intensity, kind: "delta", note: "Per-token change within the current mix." },
              { label: "Current", value: d.current_tco2e, kind: "total", note: s.period.label },
            ]} />
          </ChartCard> : <p className="esg-footnote">No baseline data for this period.</p>}
        </section>

        <section className="esg-section" aria-labelledby="where-title">
          <div className="esg-section-head"><p className="esg-eyebrow">Breakdown</p><h2 id="where-title">Where it comes from</h2></div>
          <div className="esg-grid-2">
            <ChartCard id="breakdown-title" title={`${measureMeta.label} by ${dimension}`} subtitle={`Sorted by value. ${measureMeta.unit}.`}
              actions={<>
                {(["provider", "model", "team", "region"] as const).map((dim) => <button key={dim} className="esg-button" aria-pressed={dimension === dim} onClick={() => setDimension(dim)}>{dim}</button>)}
              </>}
              legend={<div className="esg-filter" role="group" aria-label="Measure">{(["tco2e", "ci_tok", "cost_usd"] as const).map((key) => <button key={key} className="esg-button" aria-pressed={measure === key} onClick={() => setMeasure(key)}>{{ tco2e: "Absolute tCO2e", ci_tok: "Intensity", cost_usd: "Cost" }[key]}</button>)}</div>}
              table={{ columns: [dimension, "tCO2e", "gCO2e/1k tok", "Cost USD", "Tokens per $", "Confidence", "Data tier"], numeric: [false, true, true, true, true, false, false], rows: (rows?.rows ?? []).map((r) => [r.key, r.tco2e, r.ci_tok ?? "—", r.cost_usd, r.tpd ?? "—", r.confidence, r.audit_tier]) }}>
              <HBars rows={barRows} unit={measureMeta.unit} label={`${measureMeta.label} by ${dimension}`} />
            </ChartCard>
            <ChartCard id="split-title" title={<Term title="Operational vs embodied carbon (ISO 11.5.4, 11.5.5)" text="Operational: emissions from the electricity used. Embodied: the share of emissions from manufacturing servers and GPUs, spread over a 3-year hardware lifetime using a reference-hardware model.">Operational vs embodied emissions</Term>}
              subtitle="tCO2e per month."
              legend={<><Legend items={[{ label: "Embodied (hardware manufacturing)", color: "var(--esg-split-2)", shape: "box" }, { label: "Operational (electricity)", color: "var(--esg-split-1)", shape: "box" }]} />
                <div className="esg-legend">{materialMonths ? <Status kind="warning">Material: embodied exceeds 1% of Scope 3 in {materialMonths} of {splitMonths.length} months</Status> : <Status kind="good">Embodied below the 1% materiality threshold</Status>}</div></>}
              table={{ columns: ["Month", "Operational tCO2e", "Embodied tCO2e", "Embodied share", "Material (>1%)"], numeric: [false, true, true, true, false], rows: splitMonths.map((m) => [monthName(m.month), m.tco2e_usage ?? 0, m.tco2e_embodied ?? 0, `${(((m.tco2e_embodied ?? 0) / (m.tco2e_total || 1)) * 100).toFixed(1)}%`, m.embodied_material ? "Yes" : "No"]) }}
              footnote="Embodied carbon assumes a 3-year hardware lifetime and a reference server and GPU; it is reported when it exceeds 1% of Scope 3 for the period.">
              <StackedColumns months={splitMonths.map((m) => m.month)} unit="tCO2e" label="Operational versus embodied emissions per month"
                lower={{ label: "Operational", color: "var(--esg-split-1)", values: splitMonths.map((m) => m.tco2e_usage ?? 0) }}
                upper={{ label: "Embodied", color: "var(--esg-split-2)", values: splitMonths.map((m) => m.tco2e_embodied ?? 0) }}
                notes={splitMonths.map((m) => m.embodied_material ? "Embodied exceeds 1% of Scope 3: include it. 3-year lifetime, reference hardware." : "Embodied below the 1% materiality threshold.")} />
            </ChartCard>
          </div>
        </section>

        <section className="esg-section" aria-labelledby="water-title">
          <div className="esg-section-head"><p className="esg-eyebrow">ESRS E3 · GRI 302</p><h2 id="water-title">Water and energy</h2><p>{copy("water_placement")} {copy("energy_placement")}</p></div>
          <ChartCard id="multiples-title" title="Water and energy, monthly" subtitle="Three separate measures on a shared time axis."
            table={{ columns: ["Month", "On-site water m3", "Off-site water m3", "Energy MWh"], numeric: [false, true, true, true], rows: splitMonths.map((m) => [monthName(m.month), m.m3_water_onsite ?? 0, m.m3_water_offsite ?? 0, m.mwh ?? 0]) }}
            footnote="Embodied water used to manufacture the hardware is not included. On-site water comes from provider disclosures; off-site water from electricity-generation intensity, with different confidence.">
            <div className="esg-multiples">
              <div><h4>On-site water</h4><p>m3, cooling at the data center</p><SmallArea months={splitMonths.map((m) => m.month)} values={splitMonths.map((m) => m.m3_water_onsite)} color="var(--esg-split-1)" unit="m3" label="On-site water per month" /></div>
              <div><h4>Off-site water</h4><p>m3, generating the electricity</p><SmallArea months={splitMonths.map((m) => m.month)} values={splitMonths.map((m) => m.m3_water_offsite)} color="var(--esg-split-1)" unit="m3" label="Off-site water per month" /></div>
              <div><h4>Energy</h4><p>MWh, GRI 302-2</p><SmallArea months={splitMonths.map((m) => m.month)} values={splitMonths.map((m) => m.mwh)} color="var(--esg-split-1)" unit="MWh" label="Energy per month" /></div>
            </div>
          </ChartCard>
        </section>

        <section className="esg-section" id="crosswalk" aria-labelledby="crosswalk-title">
          <div className="esg-section-head"><p className="esg-eyebrow">ISO to ESG</p><h2 id="crosswalk-title">Disclosure crosswalk</h2><p>Each ISO metric, its value for this period, and the ESG paragraphs it can populate. Every row carries its boundary check.</p></div>
          <div>
            <div className="esg-filter" role="group" aria-label="Filter by standard">{["All", "ESRS", "GRI", "IFRS", "SASB"].map((std) => <button key={std} className="esg-button" aria-pressed={standard === std} onClick={() => setStandard(std)}>{std}</button>)}</div>
            <div className="esg-table-wrap"><table className="esg-table">
              <caption className="sr-only">ISO/IEC TR 20226 metrics mapped to ESG standards</caption>
              <thead><tr><th scope="col">ISO metric</th><th scope="col" className="num">Value</th><th scope="col">ESRS</th><th scope="col">GRI</th><th scope="col">IFRS S2</th><th scope="col">SASB</th><th scope="col">GHG Protocol</th><th scope="col">Tier / posture</th></tr></thead>
              <tbody>{filteredRows.map((r) => { const m = metricBy(r.key); return [<tr key={r.key} className="esg-metric-row">
                <th scope="row"><Term title={`${r.metric} (ISO ${r.iso_clause})`} text={`${r.plain[0].toUpperCase()}${r.plain.slice(1)}.`}>{r.metric}</Term><br /><small>ISO {r.iso_clause}</small></th>
                <td className="num">{m?.value !== null && m?.value !== undefined ? `${fmt(m.value)} ${m.unit}` : m?.detail && Array.isArray(m.detail) ? (m.detail as { provider: string; pue?: number[]; wue_onsite_l_per_kwh?: number[] }[]).map((x) => `${PROVIDER_LABEL[x.provider] ?? x.provider} ${(x.pue ?? x.wue_onsite_l_per_kwh ?? []).join("/")}`).join(", ") : "—"}</td>
                <td>{r.esrs}</td><td>{r.gri}</td><td>{r.ifrs_s2}</td><td>{r.sasb}</td><td>{r.ghg_scope3}</td><td>{r.audit_tier}<br /><small>{r.posture}</small></td>
              </tr>,
              <tr key={`${r.key}-check`} className="esg-check-row"><td colSpan={8}><strong>Boundary check:</strong> {r.boundary_check}</td></tr>]; })}</tbody>
            </table></div>
            <p className="esg-footnote">Acronyms: {data?.metrics.glossary.filter((g) => ["ADPe", "PE", "WUE", "PUE", "WCF", "SCI"].includes(g.term)).map((g, i) => <span key={g.term}>{i ? " · " : ""}<Term title={`${g.term}: ${g.name}`} text={`${g.definition} ${g.esg_status}`}>{g.term}</Term></span>)}</p>
          </div>
          <div className="esg-card">
            <div className="esg-card-head"><div><h3>Disclosure readiness</h3><p>Can each requirement be filed from these figures?</p></div></div>
            <div className="esg-table-wrap"><table className="esg-table">
              <thead><tr><th scope="col">Requirement</th><th scope="col">Data available</th><th scope="col">Audit tier</th><th scope="col">Boundary caveats</th><th scope="col">Ready to file</th></tr></thead>
              <tbody>{data?.mapping.readiness.map((r) => <tr key={r.id}>
                <th scope="row">{r.id}<br /><small>{r.requirement}</small></th>
                <td>{r.data_available ? <Status kind="good">Available</Status> : <Status kind="critical">Missing</Status>}</td>
                <td>{r.audit_tier}</td>
                <td>{r.caveats.length ? <Status kind="warning">{r.caveats.length} caveat{r.caveats.length > 1 ? "s" : ""}</Status> : <Status kind="good">None</Status>}<br /><small>{r.caveats.join(", ")}</small></td>
                <td>{r.status === "ready" ? <Status kind="good">Ready</Status> : r.status === "caveats" ? <Status kind="warning">Ready with caveats</Status> : <Status kind="serious">Blocked</Status>}<br /><small>{r.note}</small></td>
              </tr>)}</tbody>
            </table></div>
          </div>
        </section>

        <section className="esg-section" id="boundaries" aria-labelledby="bound-title">
          <div className="esg-section-head"><p className="esg-eyebrow">Always included</p><h2 id="bound-title">Boundaries and data gaps</h2><p>These seven things are outside every figure on this page and in every export.</p></div>
          <ul className="esg-exclusions">{s.exclusions.map((ex) => <li key={ex.id}><h3>{ex.title}</h3><p>{ex.statement}</p><small>Affects {ex.affects.join(", ")}. Next step: {ex.remediation}</small></li>)}</ul>
          <h3 className="esg-subhead">ISO metrics we cannot calculate</h3>
          <DataTable data={{ columns: ["ISO clause", "Metric", "Why it is absent"], rows: (data?.metrics.not_calculable ?? []).map((n) => [n.iso_clause, n.iso_name, n.why]) }} caption="ISO metrics outside the EcoLogits boundary" />
        </section>

        <section className="esg-section" id="export" aria-labelledby="export-title">
          <div className="esg-section-head"><p className="esg-eyebrow">Disclosure pack</p><h2 id="export-title">Export</h2></div>
          <div>
            <div className="esg-export">
              {(["xlsx", "pdf", "csv"] as const).map((f) => <button key={f} className="esg-button esg-button-primary" onClick={() => exportPack(f)} disabled={!!exporting}><Download size={14} /> {exporting === f ? "Preparing…" : `Disclosure pack (${f.toUpperCase()})`}</button>)}
            </div>
            <p className="esg-footnote">Every export embeds the methodology and boundary statement (ESRS E1-6 AR 40(g)-(i)) and lists the seven exclusions on the same page as the headline totals, with the factor and tool versions.</p>
            <div className="esg-form">
              <label>Net revenue for {s.period.label} (USD)<input inputMode="decimal" value={revenueInput} onChange={(e) => setRevenueInput(e.target.value)} placeholder={s.revenue ? fmt(s.revenue.net_revenue, 8) : "e.g. 4,500,000"} /></label>
              <button className="esg-button" onClick={saveRevenue} disabled={!revenueInput}>Save revenue</button>
              <span>{s.revenue ? <>Revenue intensity: <strong>{fmt(s.revenue.tco2e_per_musd)} tCO2e per USD 1M</strong> (ESRS E1-6 Para 47, GRI 305-4)</> : "Entered by the ESG owner; never inferred. Needed for intensity per net revenue."}</span>
            </div>
            {revenueMessage && <p className="esg-footnote" role="status">{revenueMessage}</p>}
          </div>
        </section>
      </div>}
    </main>
  </div>;
}
