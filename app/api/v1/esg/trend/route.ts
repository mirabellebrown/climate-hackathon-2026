import { contextFrom, handle, queryOf } from "@/lib/esg/http";
import { trend } from "@/lib/esg/report";

export async function GET(request: Request) {
  return handle(request, () => trend(contextFrom(queryOf(request))));
}
