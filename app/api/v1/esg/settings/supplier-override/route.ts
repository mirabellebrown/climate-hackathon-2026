import { handle, readJson } from "@/lib/esg/http";
import { addOverride, loadSettings } from "@/lib/esg/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handle(request, () => ({ overrides: loadSettings().overrides }));
}

// Supplier-published figures take precedence for records ingested in their effective period.
// Already-stored records are never rewritten.
export async function POST(request: Request) {
  return handle(request, async () => addOverride(await readJson(request, 10_000)));
}
