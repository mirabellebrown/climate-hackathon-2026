import { contextFrom, handle, queryOf } from "@/lib/esg/http";
import { summary } from "@/lib/esg/report";

export async function GET(request: Request) {
  return handle(request, () => { const ctx = contextFrom(queryOf(request)); return { ...summary(ctx), options: ctx.options }; });
}
