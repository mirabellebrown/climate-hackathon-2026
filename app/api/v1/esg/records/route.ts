import { handle, readJson } from "@/lib/esg/http";
import { ingest } from "@/lib/esg/store";
import { EsgInputError } from "@/lib/esg/validate";

export const runtime = "nodejs";

// Single ingestion target for canonical per-request records from the EcoLogits integration.
export async function POST(request: Request) {
  return handle(request, async () => {
    const body = await readJson(request);
    const records = Array.isArray(body) ? body : (body as { records?: unknown })?.records;
    if (!Array.isArray(records) || !records.length || records.length > 5000) throw new EsgInputError("records: send an array of 1 to 5,000 canonical records");
    return ingest(records);
  });
}
