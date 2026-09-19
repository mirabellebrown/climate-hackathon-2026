import { contextFrom, handle, queryOf } from "@/lib/esg/http";
import { metrics } from "@/lib/esg/report";

export async function GET(request: Request) {
  return handle(request, () => metrics(contextFrom(queryOf(request))));
}
