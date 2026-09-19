"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, TriangleAlert } from "lucide-react";
import { EfficiencyFrontierChart } from "@/components/efficiency-frontier-chart";
import { SiteFooter } from "@/components/site-footer";
import { syncClientEsgToServer } from "@/lib/esg/client-store";
import { DEFAULT_TEAM_ID } from "@/lib/esg/constants";
import type {
  EfficiencyFrontierPoint,
  EsgBreakdownRow,
  EsgExclusion,
  EsgMeta,
  EsgMetrics,
  IsoEsgMappingRow,
} from "@/lib/esg/types";
import { number, money } from "@/lib/format";

interface Kpis {
  tco2e_scope3_cat1: number;
  ci_tok: number | null;
  cpd: number | null;
  tpd_output: number | null;
  tpd_total: number | null;
  mwh: number;
  water_m3: number;
  gwp_usage_g: number;
  gwp_embodied_g: number;
  requests: number;
  tokens_out: number;
  cost_usd: number;
  embodied_materiality_pct: number;
}

export interface EsgReportInitial {
  meta: EsgMeta;
  kpis: Kpis;
  metrics: EsgMetrics;
  labels: Record<string, string>;
  frontier: EfficiencyFrontierPoint[];
  breakdown: EsgBreakdownRow[];
  mapping: IsoEsgMappingRow[];
}

function fmtScientific(value: number | null, digits = 3): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  if (Math.abs(value) < 0.001 || Math.abs(value) >= 1_000_000) return value.toExponential(digits);
  return number(value);
}

export function EsgReportView({ initial }: { initial: EsgReportInitial }) {
  const [summary, setSummary] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshFromClient() {
    setRefreshing(true);
    setError(null);
    try {
      await syncClientEsgToServer();
      const q = `?team_id=${encodeURIComponent(DEFAULT_TEAM_ID)}`;
      const [s, f, b] = await Promise.all([
        fetch(`/api/v1/esg/summary${q}`).then((r) => r.json()),
        fetch(`/api/v1/esg/efficiency-frontier${q}`).then((r) => r.json()),
        fetch(`/api/v1/esg/breakdown${q}`).then((r) => r.json()),
      ]);
      if (!s.exclusions || !s.audit_tier) throw new Error("Summary missing exclusions or audit tier.");
      setSummary({
        meta: {
          factor_version: s.factor_version,
          ecologits_version: s.ecologits_version,
          audit_tier: s.audit_tier,
          exclusions: s.exclusions as EsgExclusion[],
          team_id: s.team_id,
          period: s.period,
          prefill_warning: s.prefill_warning,
          prefill_warning_message: s.prefill_warning_message,
        },
        kpis: s.kpis,
        metrics: s.metrics,
        labels: s.labels ?? initial.labels,
        frontier: f.points ?? [],
        breakdown: b.rows ?? [],
        mapping: initial.mapping,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh ESG report.");
    } finally {
      setRefreshing(false);
    }
  }

  async function exportPack(kind: "json" | "methodology") {
    setExporting(true);
    try {
      if (kind === "methodology") {
        const res = await fetch("/api/v1/esg/disclosure/methodology");
        downloadJson("greenroute-esg-methodology.json", await res.json());
      } else {
        const res = await fetch(`/api/v1/esg/disclosure/export?team_id=${encodeURIComponent(DEFAULT_TEAM_ID)}`, {
          method: "POST",
        });
        downloadJson("greenroute-esg-export.json", await res.json());
      }
    } finally {
      setExporting(false);
    }
  }

  const { meta, kpis, frontier, breakdown, mapping } = summary;

  return (
    <main className="dashboard-page esg-page">
      <div className="dashboard-shell">
        <div className="dashboard-top">
          <Link className="back-to-chat" href="/dashboard"><ArrowLeft size={16} />Back to impact dashboard</Link>
          <p className="dashboard-kicker">AI environmental reporting · ISO → ESG</p>
        </div>

        <section className="lifetime-hero" aria-labelledby="esg-title">
          <p className="eyebrow">Scope 3 Category 1 · inference only</p>
          <h1 id="esg-title">Environmental reporting</h1>
          <p className="lifetime-lead">
            Carbon intensity (ISO 11.5.2): grams of CO₂e per 1,000 output tokens — joined to tokens-per-dollar so managers see cost and climate on one page.
          </p>
        </section>

        <section className="dash-section esg-context" aria-label="Report context">
          <div className="esg-context-grid">
            <div>
              <p className="lifetime-label">Period</p>
              <p className="esg-context-value">
                {meta.period.start ? formatPeriod(meta.period.start, meta.period.end) : "Session + demo seed"}
              </p>
            </div>
            <div>
              <p className="lifetime-label">Team</p>
              <p className="esg-context-value">{meta.team_id}</p>
              <p className="esg-context-hint">Prototype: this browser session = one team</p>
            </div>
            <div>
              <p className="lifetime-label">Baseline</p>
              <p className="esg-context-value">Location-based · Average-data</p>
              <p className="esg-context-hint">Audit tier: {meta.audit_tier}</p>
            </div>
            <div>
              <p className="lifetime-label">Factor lineage</p>
              <p className="esg-context-value mono">{meta.factor_version}</p>
              <p className="esg-context-hint mono">{meta.ecologits_version}</p>
            </div>
          </div>
          <div className="esg-export-row" style={{ marginTop: "var(--space-lg)" }}>
            <button type="button" className="esg-export-btn secondary" disabled={refreshing} onClick={() => void refreshFromClient()}>
              {refreshing ? "Syncing…" : "Sync this browser’s requests"}
            </button>
          </div>
        </section>

        {meta.prefill_warning && (
          <div className="esg-warn" role="status">
            <TriangleAlert size={18} />
            <p>{meta.prefill_warning_message}</p>
          </div>
        )}

        {error && <p className="dash-empty" role="alert">{error}</p>}

        <section className="dash-section" aria-labelledby="esg-kpi-title">
          <div className="dash-section-head">
            <p className="eyebrow">Key figures</p>
            <h2 id="esg-kpi-title">Period totals</h2>
            <p>Every total below includes the seven exclusions and audit tier shown on this page. No spend-based emissions.</p>
          </div>
          <div className="esg-kpi-grid">
            <KpiTile
              label="Total carbon"
              value={fmtScientific(kpis.tco2e_scope3_cat1)}
              unit="tCO₂e"
              plain="Scope 3 Cat 1 purchased AI services"
              iso="ESRS E1-6 · location-based"
              chip={meta.audit_tier}
            />
            <KpiTile
              label="Carbon intensity"
              value={fmtScientific(kpis.ci_tok)}
              unit="g / 1k tokens"
              plain="Grams of CO₂e per 1,000 output tokens"
              iso="ISO 11.5.2"
              chip={meta.audit_tier}
            />
            <KpiTile
              label="Carbon per dollar"
              value={fmtScientific(kpis.cpd)}
              unit="g / $"
              plain="Grams of CO₂e per USD of API spend"
              iso="CPD = (CI_tok / 1000) × TPD"
              chip={meta.audit_tier}
            />
            <KpiTile
              label="Energy"
              value={fmtScientific(kpis.mwh)}
              unit="MWh"
              plain="Electricity for inference"
              iso="GRI 302-2"
              chip={meta.audit_tier}
            />
            <KpiTile
              label="Water"
              value={fmtScientific(kpis.water_m3)}
              unit="m³"
              plain="Operational water; embodied water excluded"
              iso="ESRS E3-3 / E3-5"
              chip={meta.audit_tier}
            />
          </div>
          <p className="esg-kpi-foot">
            Tokens per dollar (output): {fmtScientific(kpis.tpd_output)} · Tokens per dollar (input+output): {fmtScientific(kpis.tpd_total)} · {kpis.requests} requests · {money(kpis.cost_usd)} spend
          </p>
        </section>

        <section className="dash-section" aria-labelledby="frontier-title">
          <div className="dash-section-head">
            <p className="eyebrow">Efficiency join</p>
            <h2 id="frontier-title">Efficiency frontier</h2>
            <p>
              Each bubble is a provider × model: left is cheaper (USD per 1M output tokens), down is cleaner (gCO₂e per 1M output tokens). Faint curves are constant carbon-per-dollar.
            </p>
          </div>
          {frontier.length > 0 ? (
            <EfficiencyFrontierChart points={frontier} />
          ) : (
            <p className="dash-empty">No frontier points yet.</p>
          )}
        </section>

        {breakdown.length > 0 && (
          <section className="dash-section" aria-labelledby="breakdown-title">
            <div className="dash-section-head">
              <p className="eyebrow">Rollup</p>
              <h2 id="breakdown-title">Breakdown by model</h2>
              <p>Sum-over-sum intensities — never averages of per-request ratios. Usage and embodied GWP stay separate in storage.</p>
            </div>
            <div className="esg-table-wrap">
              <table className="esg-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Month</th>
                    <th>Output tokens</th>
                    <th>gCO₂e (usage)</th>
                    <th>gCO₂e (embodied)</th>
                    <th>CI_tok</th>
                    <th>TPD (out)</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={`${row.model}-${row.month}-${row.region}`}>
                      <td>{row.model}</td>
                      <td>{row.month}</td>
                      <td>{row.totals.tokens_out.toLocaleString()}</td>
                      <td>{fmtScientific(row.totals.gwp_usage_g)}</td>
                      <td>{row.totals.gwp_embodied_g > 0 ? fmtScientific(row.totals.gwp_embodied_g) : "—"}</td>
                      <td>{fmtScientific(row.metrics.ci_tok)}</td>
                      <td>{fmtScientific(row.metrics.tpd_output)}</td>
                      <td>{money(row.totals.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {kpis.embodied_materiality_pct > 1 && (
              <p className="esg-materiality">Embodied GWP is {kpis.embodied_materiality_pct.toFixed(1)}% of total — material under the &gt;1% Scope 3 caveat.</p>
            )}
          </section>
        )}

        <section className="dash-section" aria-labelledby="crosswalk-title">
          <div className="dash-section-head">
            <p className="eyebrow">Disclosure</p>
            <h2 id="crosswalk-title">ISO → ESG crosswalk</h2>
            <p>Same config the API and tooltips read. ADPe is internal only and omitted here.</p>
          </div>
          <div className="esg-table-wrap">
            <table className="esg-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Plain English</th>
                  <th>ISO</th>
                  <th>Populates</th>
                  <th>Posture</th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((row) => (
                  <tr key={row.id}>
                    <td>{row.internal_metric}</td>
                    <td>{row.plain_english}</td>
                    <td>{row.iso_clause}</td>
                    <td>{row.populates}</td>
                    <td>{row.posture}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dash-section esg-exclusions" aria-labelledby="exclusions-title">
          <div className="dash-section-head">
            <p className="eyebrow">Boundary</p>
            <h2 id="exclusions-title">Seven exclusions</h2>
            <p>Always visible — no total without this list. These are labelled data gaps, not zeros.</p>
          </div>
          <ul className="esg-exclusion-list">
            {meta.exclusions.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.statement}</span>
              </li>
            ))}
          </ul>
          <div className="esg-export-row">
            <button type="button" className="esg-export-btn" disabled={exporting} onClick={() => void exportPack("json")}>
              <Download size={16} />Export disclosure pack
            </button>
            <button type="button" className="esg-export-btn secondary" disabled={exporting} onClick={() => void exportPack("methodology")}>
              <FileText size={16} />Export methodology
            </button>
          </div>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}

function KpiTile(props: {
  label: string;
  value: string;
  unit: string;
  plain: string;
  iso: string;
  chip: string;
}) {
  return (
    <article className="esg-kpi">
      <p className="lifetime-label">{props.label}</p>
      <p className="esg-kpi-value">{props.value}<small>{props.unit}</small></p>
      <p className="esg-kpi-plain">{props.plain}</p>
      <p className="esg-kpi-iso">{props.iso}</p>
      <span className="esg-chip">{props.chip}</span>
    </article>
  );
}

function formatPeriod(start: string, end: string | null) {
  const a = new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (!end || end === start) return a;
  const b = new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${a} – ${b}`;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
