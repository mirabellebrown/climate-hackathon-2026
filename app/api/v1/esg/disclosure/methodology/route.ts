import { contextFrom, handle, queryOf } from "@/lib/esg/http";
import { methodology } from "@/lib/esg/report";

export async function GET(request: Request) {
  return handle(request, () => methodology(contextFrom(queryOf(request))));
}
