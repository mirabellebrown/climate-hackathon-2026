import { handle, readJson } from "@/lib/esg/http";
import { loadSettings, setRevenue } from "@/lib/esg/store";
import { EsgInputError } from "@/lib/esg/validate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handle(request, () => ({ revenue: loadSettings().revenue }));
}

// Entered by the ESG owner per reporting period. Never inferred. Every change is audit-logged.
export async function POST(request: Request) {
  return handle(request, async () => {
    const body = (await readJson(request, 10_000)) as { period?: unknown; net_revenue?: unknown; currency?: unknown };
    if (typeof body?.period !== "string" || !/^(\d{4}-(0[1-9]|1[0-2])|FY\d{4})$/.test(body.period)) throw new EsgInputError("period: use YYYY-MM or FYYYYY");
    if (typeof body.net_revenue !== "number" || !Number.isFinite(body.net_revenue) || body.net_revenue <= 0) throw new EsgInputError("net_revenue: must be a positive number");
    if (body.currency !== undefined && body.currency !== "USD") throw new EsgInputError("currency: only USD is supported");
    return setRevenue({ period: body.period, net_revenue: body.net_revenue, currency: "USD" });
  });
}
