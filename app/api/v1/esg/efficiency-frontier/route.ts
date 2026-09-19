import { contextFrom, handle, queryOf } from "@/lib/esg/http";
import { frontier } from "@/lib/esg/report";

export async function GET(request: Request) {
  return handle(request, () => frontier(contextFrom(queryOf(request))));
}
