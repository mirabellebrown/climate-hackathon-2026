import {
  buildMeta,
  buildMethodologyPack,
  getFilteredRecords,
  jsonOk,
  metricsFromTotals,
  sumRecords,
  summaryKpis,
} from "@/lib/esg/api-helpers";
import { ISO_ESG_MAPPING } from "@/lib/esg/mapping";

export const runtime = "nodejs";

/** POST /api/v1/esg/disclosure/export — auditor pack (totals + exclusions + methodology). */
export async function POST(request: Request) {
  const { records, opts } = getFilteredRecords(request);
  const totals = sumRecords(records);
  const meta = buildMeta(records, opts.teamId);
  const body = {
    ...meta,
    exported_at: new Date().toISOString(),
    kpis: summaryKpis(totals),
    metrics: metricsFromTotals(totals),
    totals,
    mapping: ISO_ESG_MAPPING.filter((row) => !row.internal_only),
    methodology: buildMethodologyPack(),
    records: records.map((r) => ({
      ...r,
      // ADPe internal only — strip from disclosure export
      adpe_kgsbeq: undefined,
    })),
  };
  return jsonOk(body);
}
