import { isValidEsgRecord, appendEsgRecords, jsonOk, listEsgRecords, buildMeta, DEFAULT_TEAM_ID } from "@/lib/esg/api-helpers";

export const runtime = "nodejs";

/** GET /api/v1/esg/records — raw per-request store (prototype). */
export async function GET() {
  const records = listEsgRecords();
  return jsonOk({
    ...buildMeta(records, DEFAULT_TEAM_ID),
    records,
  });
}

/** POST /api/v1/esg/records — ingest client localStorage records into the server Map. */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonOk({ error: "Invalid JSON" }, 400);
  }
  const records = typeof payload === "object" && payload !== null && "records" in payload
    ? (payload as { records: unknown }).records
    : payload;
  if (!Array.isArray(records)) {
    return jsonOk({ error: "Expected { records: EsgRequestRecord[] }" }, 400);
  }
  const valid = records.filter(isValidEsgRecord);
  const added = appendEsgRecords(valid);
  return jsonOk({
    ...buildMeta(listEsgRecords(), DEFAULT_TEAM_ID),
    added,
    received: records.length,
    accepted: valid.length,
  });
}
