import { contextFrom, handle, queryOf } from "@/lib/esg/http";
import { mapping } from "@/lib/esg/report";

export async function GET(request: Request) {
  return handle(request, () => mapping(contextFrom(queryOf(request))));
}
