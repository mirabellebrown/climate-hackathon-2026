import { DEFAULT_TEAM_ID } from "@/lib/esg/constants";
import { isValidEsgRecord } from "@/lib/esg/adapt";
import {
  breakdownByGrain,
  buildMeta,
  efficiencyFrontier,
  filterRecords,
  summaryKpis,
  trendByMonth,
} from "@/lib/esg/rollup";
import { metricsFromTotals, sumRecords } from "@/lib/esg/metrics";
import { appendEsgRecords, listEsgRecords } from "@/lib/esg/store";
import { buildMethodologyPack } from "@/lib/esg/methodology";
import { ISO_ESG_MAPPING, NOT_CALCULABLE } from "@/lib/esg/mapping";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };

function queryOpts(url: URL) {
  return {
    teamId: url.searchParams.get("team_id") ?? DEFAULT_TEAM_ID,
    provider: url.searchParams.get("provider") ?? undefined,
    model: url.searchParams.get("model") ?? undefined,
    since: url.searchParams.get("since") ?? undefined,
    until: url.searchParams.get("until") ?? undefined,
  };
}

export function getFilteredRecords(request: Request) {
  const url = new URL(request.url);
  const opts = queryOpts(url);
  const records = filterRecords(listEsgRecords(), opts);
  return { records, opts, url };
}

export function jsonOk(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}

export { appendEsgRecords, listEsgRecords, isValidEsgRecord };
export {
  breakdownByGrain,
  buildMeta,
  efficiencyFrontier,
  summaryKpis,
  trendByMonth,
  metricsFromTotals,
  sumRecords,
  buildMethodologyPack,
  ISO_ESG_MAPPING,
  NOT_CALCULABLE,
  DEFAULT_TEAM_ID,
};
