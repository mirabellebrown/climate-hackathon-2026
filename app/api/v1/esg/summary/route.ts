import {
  buildMeta,
  getFilteredRecords,
  jsonOk,
  metricsFromTotals,
  sumRecords,
  summaryKpis,
} from "@/lib/esg/api-helpers";

export const runtime = "nodejs";

/** GET /api/v1/esg/summary — period totals + ISO/ESG KPIs (always with exclusions + audit_tier). */
export async function GET(request: Request) {
  const { records, opts } = getFilteredRecords(request);
  const totals = sumRecords(records);
  const meta = buildMeta(records, opts.teamId);
  return jsonOk({
    ...meta,
    kpis: summaryKpis(totals),
    metrics: metricsFromTotals(totals),
    totals: {
      gwp_usage_g: totals.gwp_usage_g,
      gwp_embodied_g: totals.gwp_embodied_g,
      gwp_total_g: totals.gwp_total_g,
      energy_wh: totals.energy_wh,
      water_ml_onsite: totals.water_ml_onsite,
      water_ml_offsite: totals.water_ml_offsite,
      water_ml_total: totals.water_ml_total,
      tokens_in: totals.tokens_in,
      tokens_out: totals.tokens_out,
      cost_usd: totals.cost_usd,
      requests: totals.requests,
    },
    labels: {
      tco2e: "Total carbon (tCO₂e) — Scope 3 Category 1 purchased services (ESRS E1-6, location-based)",
      ci_tok: "Carbon intensity (ISO 11.5.2): grams of CO₂e per 1,000 output tokens",
      cpd: "Carbon per dollar: grams of CO₂e per USD of API spend",
      mwh: "Energy (MWh) — GRI 302-2 energy outside the organisation",
      water_m3: "Water (m³) — ESRS E3-3 / E3-5; embodied water excluded",
    },
  });
}
