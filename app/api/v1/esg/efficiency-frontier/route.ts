import {
  buildMeta,
  efficiencyFrontier,
  getFilteredRecords,
  jsonOk,
} from "@/lib/esg/api-helpers";

export const runtime = "nodejs";

/** GET /api/v1/esg/efficiency-frontier — scatter inputs (USD/1M vs gCO2e/1M output tokens). */
export async function GET(request: Request) {
  const { records, opts } = getFilteredRecords(request);
  const meta = buildMeta(records, opts.teamId);
  return jsonOk({
    ...meta,
    points: efficiencyFrontier(records),
    quadrant_label: "Cheaper and cleaner",
    axes: {
      x: "USD per 1M output tokens",
      y: "gCO₂e per 1M output tokens",
      bubble: "Output token volume",
      color: "Provider",
    },
  });
}
