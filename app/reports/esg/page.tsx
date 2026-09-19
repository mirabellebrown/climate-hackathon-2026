import type { Metadata } from "next";
import { EsgReportView } from "@/components/esg-report-view";
import { DEFAULT_TEAM_ID } from "@/lib/esg/constants";
import { ISO_ESG_MAPPING } from "@/lib/esg/mapping";
import {
  breakdownByGrain,
  buildMeta,
  efficiencyFrontier,
  filterRecords,
  summaryKpis,
} from "@/lib/esg/rollup";
import { metricsFromTotals, sumRecords } from "@/lib/esg/metrics";
import { listEsgRecords } from "@/lib/esg/store";

export const metadata: Metadata = {
  title: "AI Environmental Reporting — GreenRoute",
  description: "ISO/IEC TR 20226 metrics mapped to ESG disclosures for GreenRoute inference usage.",
};

export const dynamic = "force-dynamic";

export default function EsgReportPage() {
  const records = filterRecords(listEsgRecords(), { teamId: DEFAULT_TEAM_ID });
  const totals = sumRecords(records);
  const meta = buildMeta(records, DEFAULT_TEAM_ID);
  const kpis = summaryKpis(totals);
  const mapping = ISO_ESG_MAPPING.filter((row) => !row.internal_only);

  return (
    <EsgReportView
      initial={{
        meta,
        kpis,
        metrics: metricsFromTotals(totals),
        labels: {
          tco2e: "Total carbon (tCO₂e) — Scope 3 Category 1 purchased services (ESRS E1-6, location-based)",
          ci_tok: "Carbon intensity (ISO 11.5.2): grams of CO₂e per 1,000 output tokens",
          cpd: "Carbon per dollar: grams of CO₂e per USD of API spend",
          mwh: "Energy (MWh) — GRI 302-2 energy outside the organisation",
          water_m3: "Water (m³) — ESRS E3-3 / E3-5; embodied water excluded",
        },
        frontier: efficiencyFrontier(records),
        breakdown: breakdownByGrain(records),
        mapping,
      }}
    />
  );
}
