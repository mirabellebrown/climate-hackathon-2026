import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { breakdown, mapping, methodology, metrics, summary, type Context } from "./report";

export const FORMATS = ["csv", "xlsx", "pdf"] as const;
export type Format = typeof FORMATS[number];

// Every export carries the headline totals WITH their audit tier and the full exclusion list
// on the same page/sheet, plus the complete methodology artifact (spec §5, §8, §12).
export function buildPack(ctx: Context) {
  return { summary: summary(ctx), metrics: metrics(ctx), mapping: mapping(ctx), methodology: methodology(ctx), breakdown: breakdown(ctx, "model") };
}
type Pack = ReturnType<typeof buildPack>;

const fmt = (value: number | null | undefined, digits = 4) => value === null || value === undefined ? "n/a" : Number(value.toPrecision(digits)).toString();

function headline(pack: Pack): [string, string][] {
  const s = pack.summary;
  return [
    ["Period", s.period.label],
    ["Scope", s.scope === "org" ? "Whole organization" : `Team: ${s.scope}`],
    ["Total AI emissions (tCO2e)", fmt(s.tco2e_total)],
    ["  of which operational / usage (tCO2e)", fmt(s.tco2e_usage)],
    ["  of which embodied (tCO2e)", fmt(s.tco2e_embodied)],
    ["GHG Protocol classification", `${s.scope3_category}, ${s.method}`],
    ["Carbon intensity (gCO2e per 1k output tokens)", fmt(s.ci_tok)],
    ["Output tokens per dollar", fmt(s.tpd)],
    ["Emissions per dollar (gCO2e/USD)", fmt(s.cpd)],
    ["Energy (MWh)", fmt(s.mwh)],
    ["Water, on-site (m3)", fmt(s.m3_water_onsite)],
    ["Water, off-site (m3)", fmt(s.m3_water_offsite)],
    ["Cost (USD)", fmt(s.cost_usd, 8)],
    ["Revenue intensity (tCO2e per USD 1M net revenue)", s.revenue ? fmt(s.revenue.tco2e_per_musd) : "Net revenue not entered for this period"],
    ["Audit tier", s.audit_tier],
    ["EcoLogits version(s)", s.ecologits_versions.join(", ")],
    ["Factor version(s)", s.factor_versions.join(", ")],
    ["Generated at", s.generated_at],
  ];
}

const SAMPLE_BANNER = "SAMPLE DATA - illustrative records, not EcoLogits output and not any organization's figures.";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(pack: Pack): string {
  const rows: unknown[][] = [];
  const section = (title: string) => rows.push([], [`## ${title}`]);
  rows.push(["AI Environmental Reporting - ISO/IEC TR 20226 metrics mapped to ESG disclosures"]);
  if (pack.summary.sample) rows.push([SAMPLE_BANNER]);
  section("Headline");
  for (const [k, v] of headline(pack)) rows.push([k, v]);
  section("Not included in these figures (boundary exclusions)");
  rows.push(["Exclusion", "Statement", "Affected ESG lines", "Remediation"]);
  for (const ex of pack.summary.exclusions) rows.push([ex.title, ex.statement, ex.affects.join("; "), ex.remediation]);
  section("ISO metrics");
  rows.push(["ISO clause", "Metric", "Plain language", "Value", "Unit", "Audit tier", "Posture", "ESG targets"]);
  for (const m of pack.metrics.metrics) rows.push([m.iso_clause, m.iso_name, m.plain, m.value ?? "", m.unit, m.audit_tier, m.posture, m.esg_targets.join("; ")]);
  for (const n of pack.metrics.not_calculable) rows.push([n.iso_clause, n.iso_name, `Not calculable: ${n.why}`, "", "", "", "Data gap", ""]);
  section("ESG crosswalk");
  rows.push(["ISO clause", "Metric", "ESRS", "GRI", "IFRS S2", "SASB", "GHG Protocol", "Boundary check"]);
  for (const r of pack.mapping.rows) rows.push([r.iso_clause, r.metric, r.esrs, r.gri, r.ifrs_s2, r.sasb, r.ghg_scope3, r.boundary_check]);
  section("Disclosure readiness");
  rows.push(["Requirement", "Description", "Data available", "Audit tier", "Status", "Caveats", "Note"]);
  for (const r of pack.mapping.readiness) rows.push([r.id, r.requirement, r.data_available ? "yes" : "no", r.audit_tier, r.status, r.caveats.join("; "), r.note]);
  section("Breakdown by model");
  rows.push(["Model", "Provider", "tCO2e", "gCO2e per 1k output tokens", "Cost USD", "Output tokens", "Confidence", "Audit tier"]);
  for (const r of pack.breakdown.rows) rows.push([r.key, r.provider, r.tco2e, r.ci_tok ?? "", r.cost_usd, r.tokens_out, r.confidence, r.audit_tier]);
  section(pack.methodology.title);
  for (const s of pack.methodology.sections) { rows.push([s.title]); for (const line of s.lines) rows.push(["", line]); }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export async function toXlsx(pack: Pack): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Canopy"; book.created = new Date(pack.summary.generated_at);
  const bold = { font: { bold: true } };
  const summarySheet = book.addWorksheet("Summary");
  summarySheet.columns = [{ width: 52 }, { width: 70 }, { width: 40 }, { width: 50 }];
  summarySheet.addRow(["AI Environmental Reporting"]).font = { bold: true, size: 14 };
  if (pack.summary.sample) summarySheet.addRow([SAMPLE_BANNER]).font = { bold: true, color: { argb: "FFB00020" } };
  for (const row of headline(pack)) summarySheet.addRow(row);
  summarySheet.addRow([]);
  summarySheet.addRow(["Not included in these figures"]).font = { bold: true };
  for (const ex of pack.summary.exclusions) summarySheet.addRow([ex.title, ex.statement, ex.affects.join("; "), ex.remediation]);
  const table = (name: string, header: string[], rows: unknown[][]) => {
    const sheet = book.addWorksheet(name);
    sheet.addRow(header).font = bold.font;
    rows.forEach((row) => sheet.addRow(row));
    sheet.columns.forEach((column) => { column.width = 28; });
    return sheet;
  };
  table("ISO metrics", ["ISO clause", "Metric", "Plain language", "Value", "Unit", "Audit tier", "Posture", "ESG targets"],
    [...pack.metrics.metrics.map((m) => [m.iso_clause, m.iso_name, m.plain, m.value ?? "", m.unit, m.audit_tier, m.posture, m.esg_targets.join("; ")]),
      ...pack.metrics.not_calculable.map((n) => [n.iso_clause, n.iso_name, `Not calculable: ${n.why}`, "", "", "", "Data gap", ""])]);
  table("ESG crosswalk", ["ISO clause", "Metric", "ESRS", "GRI", "IFRS S2", "SASB", "GHG Protocol", "Boundary check"],
    pack.mapping.rows.map((r) => [r.iso_clause, r.metric, r.esrs, r.gri, r.ifrs_s2, r.sasb, r.ghg_scope3, r.boundary_check]));
  table("Readiness", ["Requirement", "Description", "Data available", "Audit tier", "Status", "Caveats", "Note"],
    pack.mapping.readiness.map((r) => [r.id, r.requirement, r.data_available ? "yes" : "no", r.audit_tier, r.status, r.caveats.join("; "), r.note]));
  table("Breakdown by model", ["Model", "Provider", "tCO2e", "gCO2e per 1k output tokens", "Cost USD", "Output tokens", "Confidence", "Audit tier"],
    pack.breakdown.rows.map((r) => [r.key, r.provider, r.tco2e, r.ci_tok ?? "", r.cost_usd, r.tokens_out, r.confidence, r.audit_tier]));
  const method = book.addWorksheet("Methodology");
  method.columns = [{ width: 40 }, { width: 140 }];
  method.addRow([pack.methodology.title]).font = { bold: true, size: 13 };
  for (const s of pack.methodology.sections) { method.addRow([s.title]).font = bold.font; for (const line of s.lines) method.addRow(["", line]); }
  table("Exclusions", ["Exclusion", "Statement", "Affected ESG lines", "Remediation"], pack.summary.exclusions.map((ex) => [ex.title, ex.statement, ex.affects.join("; "), ex.remediation]));
  return Buffer.from(await book.xlsx.writeBuffer());
}

// Standard PDF fonts are WinAnsi-encoded; map the few non-Latin-1 symbols we use.
const pdfText = (text: string) => text.replace(/₂/g, "2").replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/→/g, "->").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e -ÿ–—•]/g, "?");

class PdfWriter {
  page!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument, private font: PDFFont, private boldFont: PDFFont) { this.newPage(); }
  newPage() { this.page = this.doc.addPage([595, 842]); this.y = 800; }
  line(text: string, options: { size?: number; bold?: boolean; indent?: number; color?: [number, number, number] } = {}) {
    const size = options.size ?? 9, font = options.bold ? this.boldFont : this.font, indent = options.indent ?? 0;
    const maxWidth = 515 - indent;
    const words = pdfText(text).split(/\s+/);
    let current = "";
    const flush = () => {
      if (this.y < 50) this.newPage();
      this.page.drawText(current, { x: 40 + indent, y: this.y, size, font, color: rgb(...(options.color ?? [0.1, 0.1, 0.1])) });
      this.y -= size * 1.45; current = "";
    };
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && current) { flush(); current = word; } else current = next;
    }
    if (current) flush();
  }
  gap(amount = 6) { this.y -= amount; }
}

export async function toPdf(pack: Pack): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle("AI Environmental Reporting - disclosure pack");
  doc.setCreator("Canopy");
  const w = new PdfWriter(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  w.line("AI Environmental Reporting", { size: 16, bold: true });
  w.line("ISO/IEC TR 20226 metrics mapped to your ESG disclosures", { size: 10 });
  if (pack.summary.sample) w.line(SAMPLE_BANNER, { bold: true, color: [0.69, 0, 0.13] });
  w.gap();
  for (const [k, v] of headline(pack)) w.line(`${k}: ${v}`);
  w.gap();
  // Same page as the totals: the boundary exclusions.
  w.line("Not included in these figures", { size: 11, bold: true });
  for (const ex of pack.summary.exclusions) w.line(`- ${ex.title}: ${ex.statement}`, { indent: 6 });
  w.newPage();
  w.line(pack.methodology.title, { size: 13, bold: true });
  for (const s of pack.methodology.sections) { w.gap(4); w.line(s.title, { bold: true, size: 10 }); for (const line of s.lines) w.line(line, { indent: 8 }); }
  w.newPage();
  w.line("ESG crosswalk", { size: 13, bold: true });
  for (const r of pack.mapping.rows) {
    w.gap(3);
    w.line(`${r.iso_clause} ${r.metric}`, { bold: true });
    w.line(`ESRS: ${r.esrs} | GRI: ${r.gri} | IFRS S2: ${r.ifrs_s2} | SASB: ${r.sasb} | GHG: ${r.ghg_scope3}`, { indent: 8 });
    if (r.boundary_check) w.line(`Boundary check: ${r.boundary_check}`, { indent: 8 });
  }
  w.gap();
  w.line("Disclosure readiness", { size: 11, bold: true });
  for (const r of pack.mapping.readiness) w.line(`${r.id} - ${r.status.toUpperCase()}: ${r.note}`, { indent: 6 });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

export async function render(format: Format, ctx: Context) {
  const pack = buildPack(ctx);
  const name = `ai-environmental-report-${pack.summary.period.id}-${pack.summary.scope}`;
  if (format === "csv") return { body: toCsv(pack), type: "text/csv; charset=utf-8", name: `${name}.csv` };
  if (format === "xlsx") return { body: await toXlsx(pack), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name: `${name}.xlsx` };
  return { body: await toPdf(pack), type: "application/pdf", name: `${name}.pdf` };
}
