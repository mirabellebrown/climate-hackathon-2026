import { FORMATS, render, type Format } from "@/lib/esg/export";
import { contextFrom, handle, readJson } from "@/lib/esg/http";
import { QueryError } from "@/lib/esg/report";

export const runtime = "nodejs";

// Every export embeds the methodology artifact and the exclusion list.
export async function POST(request: Request) {
  return handle(request, async () => {
    const body = (await readJson(request, 10_000)) as { format?: string; period?: string; scope?: string; baseline?: string };
    if (!FORMATS.includes(body?.format as Format)) throw new QueryError(`format must be one of ${FORMATS.join(", ")}`);
    const file = await render(body.format as Format, contextFrom({ period: body.period, scope: body.scope, baseline: body.baseline }));
    return new Response(new Uint8Array(typeof file.body === "string" ? Buffer.from(file.body) : file.body), {
      headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename="${file.name}"`, "Cache-Control": "no-store" },
    });
  });
}
