import {
  buildMeta,
  getFilteredRecords,
  jsonOk,
  trendByMonth,
} from "@/lib/esg/api-helpers";

export const runtime = "nodejs";

/** GET /api/v1/esg/trend — monthly CI_tok by provider. */
export async function GET(request: Request) {
  const { records, opts } = getFilteredRecords(request);
  const meta = buildMeta(records, opts.teamId);
  return jsonOk({
    ...meta,
    series: trendByMonth(records),
  });
}
