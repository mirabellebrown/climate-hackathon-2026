import { jsonOk, ISO_ESG_MAPPING, NOT_CALCULABLE } from "@/lib/esg/api-helpers";
import { ESG_EXCLUSIONS } from "@/lib/esg/exclusions";
import { ECOLOGITS_VERSION, ESG_FACTOR_VERSION, DEFAULT_TEAM_ID } from "@/lib/esg/constants";

export const runtime = "nodejs";

/** GET /api/v1/esg/disclosure/mapping — ISO→ESG crosswalk config. */
export async function GET() {
  return jsonOk({
    factor_version: ESG_FACTOR_VERSION,
    ecologits_version: ECOLOGITS_VERSION,
    audit_tier: "average-data" as const,
    exclusions: [...ESG_EXCLUSIONS],
    team_id: DEFAULT_TEAM_ID,
    period: { start: null, end: null },
    prefill_warning: false,
    prefill_warning_message: null,
    mapping: ISO_ESG_MAPPING,
    not_calculable: NOT_CALCULABLE,
  });
}
