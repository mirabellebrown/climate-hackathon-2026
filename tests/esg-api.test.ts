import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import ExcelJS from "exceljs";
import { GET as summary } from "@/app/api/v1/esg/summary/route";
import { GET as metrics } from "@/app/api/v1/esg/metrics/route";
import { GET as breakdown } from "@/app/api/v1/esg/breakdown/route";
import { GET as trend } from "@/app/api/v1/esg/trend/route";
import { GET as frontier } from "@/app/api/v1/esg/efficiency-frontier/route";
import { GET as mapping } from "@/app/api/v1/esg/disclosure/mapping/route";
import { GET as methodology } from "@/app/api/v1/esg/disclosure/methodology/route";
import { POST as exportPack } from "@/app/api/v1/esg/disclosure/export/route";
import { POST as ingest } from "@/app/api/v1/esg/records/route";
import { POST as revenue } from "@/app/api/v1/esg/settings/revenue/route";
import { POST as override } from "@/app/api/v1/esg/settings/supplier-override/route";
import registry from "@/lib/esg/registry.json";
import exclusions from "@/lib/esg/exclusions.json";
import { resetSampleCache } from "@/lib/esg/store";

const BASE = "http://127.0.0.1:3000/api/v1/esg";
let dir = "";
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "canopy-esg-")); vi.stubEnv("CANOPY_ESG_DIR", dir); resetSampleCache(); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const get = (handler: (r: Request) => Promise<Response>, path: string) => handler(new Request(`${BASE}${path}`));
const post = (handler: (r: Request) => Promise<Response>, path: string, body: unknown) => handler(new Request(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

function canonical(id: string, over: Record<string, unknown> = {}) {
  return {
    request_id: id, ts_utc: "2026-08-15T10:00:00Z",
    org: { user_id: "u1", team_id: "finance", cost_center: "CC-1", manager_id: "m1" },
    call: { provider: "anthropic", model: "claude-haiku-4-5", model_is_proprietary: true, region: "US", latency_s: 2, tokens_in: 400, tokens_out: 1000 },
    cost: { currency: "USD", amount: 0.0054, source: "provider_price_list" },
    ecologits: { version: "0.9.0", factor_version: "f-2026", ml_energy_benchmark_date: "2025-10", grid_mix_vintage: "OWID 2025", hardware_lifetime_years: 3,
      energy_wh: 1.2, gwp_usage_g: 0.45, gwp_embodied_g: 0.05, adpe_kgsbeq: 1e-8, pe_mj: 0.01, water_ml_onsite: 0.2, water_ml_offsite: 3.7, pue: 1.14, wue_onsite_l_per_kwh: 0.18, grid_intensity_source: "OWID 2025 US" },
    ...over,
  };
}

describe("contract: every total carries exclusions, audit tier and versions", () => {
  const endpoints: [string, (r: Request) => Promise<Response>, string][] = [
    ["summary", summary, "/summary"], ["metrics", metrics, "/metrics"], ["breakdown", breakdown, "/breakdown?dimension=model"],
    ["trend", trend, "/trend"], ["frontier", frontier, "/efficiency-frontier"], ["mapping", mapping, "/disclosure/mapping"], ["methodology", methodology, "/disclosure/methodology"],
  ];
  it.each(endpoints)("%s", async (_name, handler, path) => {
    const response = await get(handler, path);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.exclusions).toHaveLength(7);
    expect(body.exclusions.map((ex: { id: string }) => ex.id)).toEqual(exclusions.exclusions.map((ex) => ex.id));
    expect(typeof body.audit_tier).toBe("string");
    expect(body.factor_version).toBeTruthy();
    expect(body.ecologits_version).toBeTruthy();
    expect(body.generated_at).toMatch(/^\d{4}-/);
    expect(body.sample).toBe(true);
  });
  it("rejects bad queries and non-local requests", async () => {
    expect((await get(summary, "/summary?period=2026-13")).status).toBe(400);
    expect((await get(summary, "/summary?scope=nobody")).status).toBe(400);
    expect((await get(breakdown, "/breakdown?dimension=color")).status).toBe(400);
    expect((await summary(new Request(`${BASE}/summary`, { headers: { Host: "evil.example" } }))).status).toBe(403);
  });
});

describe("registry and API stay in sync", () => {
  it("returns every registry metric, in order, with its values", async () => {
    const body = await (await get(metrics, "/metrics")).json();
    expect(body.metrics.map((m: { key: string }) => m.key)).toEqual(registry.metrics.map((m) => m.key));
    for (const m of body.metrics) {
      expect(m).toHaveProperty("value");
      expect(m).toHaveProperty("unit");
      expect(m.audit_tier).toBeTruthy();
      expect(m.plain).toBeTruthy();
    }
    expect(body.not_calculable.map((n: { iso_clause: string }) => n.iso_clause)).toEqual(["11.2.5", "11.2.8", "11.3.2", "11.4"]);
    for (const term of ["ADPe", "PE", "WUE", "PUE", "WCF", "SCI"]) expect(body.glossary.map((g: { term: string }) => g.term)).toContain(term);
  });
  it("never presents ADPe as ESG-reportable", () => {
    const adpe = registry.metrics.find((m) => m.key === "adpe")!;
    expect(adpe.esg_targets).toEqual([]);
    expect(adpe.posture).toBe("Internal only");
  });
  it("never labels energy as ESRS E1-5 own operations", () => {
    for (const m of registry.metrics) for (const t of m.esg_targets) if (t.startsWith("ESRS E1-5")) expect(t).toMatch(/narrative support only/);
  });
});

describe("summary", () => {
  it("reports Scope 3 Category 1, location-based, with a decomposition that sums to the change", async () => {
    const s = await (await get(summary, "/summary?period=2026-08&baseline=previous")).json();
    expect(s.scope3_category).toBe("Scope 3 Category 1 (Purchased Goods and Services)");
    expect(s.method).toBe("Location-based");
    const d = s.decomposition;
    expect(d.volume + d.mix + d.intensity).toBeCloseTo(d.total, 12);
    expect(s.deltas.tco2e_total.abs).toBeCloseTo(d.total, 12);
    expect(s.m3_water_onsite + s.m3_water_offsite).toBeCloseTo(s.m3_water, 15);
    expect(s.materiality.material).toBe(true);
    expect(s.cpd).toBeCloseTo(s.ci_tok / 1000 * s.tpd, 10);
    expect(s.revenue).toBeNull();
  });
  it("fires the long-context warning for teams above ratio 5", async () => {
    const s = await (await get(summary, "/summary?period=2026-08")).json();
    expect(s.long_context.map((row: { team: string }) => row.team)).toEqual(["engineering"]);
    const team = await (await get(summary, "/summary?period=2026-08&scope=support")).json();
    expect(team.long_context).toEqual([]);
  });
  it("uses the fiscal-year-to-date monthly average as an alternative baseline", async () => {
    const s = await (await get(summary, "/summary?period=2026-08&baseline=fytd")).json();
    expect(s.baseline.label).toMatch(/to date, monthly average/);
    expect(s.decomposition.volume + s.decomposition.mix + s.decomposition.intensity).toBeCloseTo(s.decomposition.total, 12);
  });
});

describe("trend annotates factor-version changes", () => {
  it("marks the month a new factor version appears", async () => {
    const t = await (await get(trend, "/trend?period=2026-08")).json();
    expect(t.series.filter((m: { factor_version_changed: boolean }) => m.factor_version_changed).map((m: { month: string }) => m.month)).toEqual(["2026-06"]);
    expect(t.providers).toEqual(["anthropic", "openai", "google"]);
  });
});

describe("ingestion, supplier overrides and revenue", () => {
  it("switches from sample to real data once records arrive, and deduplicates", async () => {
    const first = await (await post(ingest, "/records", [canonical("a"), canonical("b")])).json();
    expect(first).toEqual({ accepted: 2, duplicates: 0 });
    expect(await (await post(ingest, "/records", [canonical("a")])).json()).toEqual({ accepted: 0, duplicates: 1 });
    const s = await (await get(summary, "/summary?period=2026-08")).json();
    expect(s.sample).toBe(false);
    expect(s.requests).toBe(2);
    expect(s.tco2e_total).toBeCloseTo(1e-6, 15);
  });
  it("rejects invalid records with a precise path instead of guessing", async () => {
    const bad = await post(ingest, "/records", [canonical("x", { cost: { currency: "EUR", amount: 1, source: "invoice" } })]);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.message).toContain("records[0].cost.currency");
    expect((await post(ingest, "/records", [canonical("y", { call: { ...canonical("y").call, region: "USA" } })])).status).toBe(400);
  });
  it("applies supplier figures first, keeps the EcoLogits estimate as cross-check, and never rewrites stored records", async () => {
    await post(ingest, "/records", [canonical("before")]);
    const o = await post(override, "/settings/supplier-override", { provider: "anthropic", metric: "gwp_usage_g", value: 0.3, unit: "gCO2e/1k output tokens", source_url: "https://example.com/report", effective_from: "2026-01-01T00:00:00Z", effective_to: "2027-01-01T00:00:00Z" });
    expect(o.status).toBe(200);
    await post(ingest, "/records", [canonical("after")]);
    const lines = readFileSync(join(dir, "records.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(lines[0].supplier_override.applied).toBe(false);
    expect(lines[0].ecologits.gwp_usage_g).toBe(0.45);
    expect(lines[1].supplier_override).toMatchObject({ applied: true, fields: ["gwp_usage_g"], ecologits_estimate: { gwp_usage_g: 0.45 } });
    expect(lines[1].ecologits.gwp_usage_g).toBeCloseTo(0.3, 12);
    expect(lines[1].classification.data_tier).toBe("Supplier-specific");
    const s = await (await get(summary, "/summary?period=2026-08")).json();
    expect(s.audit_tier).toMatch(/Mixed: 50% Supplier-specific/);
    expect(readFileSync(join(dir, "audit.jsonl"), "utf8")).toContain("supplier_override.add");
  });
  it("validates supplier overrides", async () => {
    expect((await post(override, "/settings/supplier-override", { provider: "anthropic", metric: "gwp_usage_g", value: 1, unit: "g", source_url: "https://x.example", effective_from: "2026-01-01", effective_to: "2027-01-01" })).status).toBe(400);
    expect((await post(override, "/settings/supplier-override", { provider: "anthropic", metric: "adpe_kgsbeq", value: 1, unit: "x", source_url: "https://x.example", effective_from: "2026-01-01", effective_to: "2027-01-01" })).status).toBe(400);
  });
  it("computes revenue intensity only from entered revenue, with an audit trail", async () => {
    expect((await post(revenue, "/settings/revenue", { period: "2026-08", net_revenue: -5 })).status).toBe(400);
    expect((await post(revenue, "/settings/revenue", { period: "2026-08", net_revenue: 2_000_000 })).status).toBe(200);
    const s = await (await get(summary, "/summary?period=2026-08")).json();
    expect(s.revenue.tco2e_per_musd).toBeCloseTo(s.tco2e_total / 2, 12);
    expect(readFileSync(join(dir, "audit.jsonl"), "utf8")).toContain("revenue.set");
    const readiness = (await (await get(mapping, "/disclosure/mapping?period=2026-08")).json()).readiness;
    expect(readiness.find((r: { id: string }) => r.id === "GRI 305-4").status).not.toBe("blocked");
  });
});

describe("disclosure artifacts", () => {
  it("golden: the methodology has all seven Section 12 elements and all seven exclusions", async () => {
    const m = await (await get(methodology, "/disclosure/methodology?period=2026-08")).json();
    expect(m.sections.map((s: { id: string }) => s.id)).toEqual(["tool", "provenance", "parameters", "boundary", "tiers", "precision", "aggregation"]);
    const text = JSON.stringify(m.sections);
    for (const needle of ["EcoLogits", "ML.ENERGY", "Our World in Data", "ADEME Base Empreinte", "BoaviztAPI", "World Resources Institute", "PUE", "3 years", "2x to 5x", "Scope 3 Category 1", "Supplier-specific", "SAMPLE DATA"]) expect(text).toContain(needle);
    for (const ex of exclusions.exclusions) expect(text).toContain(ex.title);
  });
  it("mapping lists every standard the acceptance criteria name", async () => {
    const m = await (await get(mapping, "/disclosure/mapping")).json();
    const all = JSON.stringify(m.rows) + JSON.stringify(m.readiness);
    for (const id of ["ESRS E1-6", "ESRS E3-3", "GRI 302-2", "GRI 305-3", "GRI 305-4", "GRI 303-3", "IFRS S2 para 29", "SASB TC-SI-110a.1", "SASB TC-SI-130a.1"]) expect(all).toContain(id);
    expect(m.rows.every((r: { boundary_check: string }) => r.boundary_check.length > 0)).toBe(true);
  });

  const exported = async (format: string) => post(exportPack, "/disclosure/export", { format, period: "2026-08" });
  it("csv embeds methodology and exclusions", async () => {
    const response = await exported("csv");
    expect(response.headers.get("content-type")).toContain("text/csv");
    const text = await response.text();
    for (const ex of exclusions.exclusions) expect(text).toContain(ex.title);
    expect(text).toContain("7. Aggregation method");
    expect(text).toContain("SAMPLE DATA");
    // Headline total and exclusions share the first section of the file.
    expect(text.indexOf("Not included in these figures")).toBeLessThan(text.indexOf("## ISO metrics"));
  });
  it("xlsx puts exclusions on the Summary sheet and includes methodology", async () => {
    const response = await exported("xlsx");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(new Uint8Array(await response.arrayBuffer()) as unknown as ArrayBuffer);
    const summarySheet: string[] = [];
    book.getWorksheet("Summary")!.eachRow((row) => summarySheet.push(JSON.stringify(row.values)));
    const summaryText = summarySheet.join("\n");
    expect(summaryText).toContain("Total AI emissions (tCO2e)");
    expect(summaryText).toContain("Audit tier");
    for (const ex of exclusions.exclusions) expect(summaryText).toContain(ex.title);
    const method: string[] = [];
    book.getWorksheet("Methodology")!.eachRow((row) => method.push(JSON.stringify(row.values)));
    expect(method.join("\n")).toContain("1. Tool and version");
  });
  it("pdf puts exclusions on the first page and includes methodology", async () => {
    const response = await exported("pdf");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const streams: string[] = [];
    const raw = bytes.toString("latin1");
    for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
      const data = Buffer.from(match[1], "latin1");
      try { streams.push(inflateSync(data).toString("latin1")); } catch { streams.push(match[1]); }
    }
    const pages = streams.map((s) => [...s.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map((m) => Buffer.from(m[1], "hex").toString("latin1")).join(" ")).filter(Boolean);
    expect(pages[0]).toContain("Total AI emissions");
    expect(pages[0]).toContain("Not included in these figures");
    for (const ex of exclusions.exclusions) expect(pages[0]).toContain(ex.title);
    expect(pages.join(" ")).toContain("7. Aggregation method");
  });
  it("rejects unknown formats", async () => {
    expect((await exported("docx")).status).toBe(400);
  });
});
