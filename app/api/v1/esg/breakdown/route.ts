import {
  breakdownByGrain,
  buildMeta,
  getFilteredRecords,
  jsonOk,
} from "@/lib/esg/api-helpers";

export const runtime = "nodejs";

/** GET /api/v1/esg/breakdown — team × provider × model × region × month. */
export async function GET(request: Request) {
  const { records, opts } = getFilteredRecords(request);
  const meta = buildMeta(records, opts.teamId);
  return jsonOk({
    ...meta,
    rows: breakdownByGrain(records),
  });
}
