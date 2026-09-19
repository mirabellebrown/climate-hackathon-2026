import { contextFrom, handle, queryOf } from "@/lib/esg/http";
import { breakdown, DIMENSIONS, QueryError, type Dimension } from "@/lib/esg/report";

export async function GET(request: Request) {
  return handle(request, () => {
    const dimension = new URL(request.url).searchParams.get("dimension") ?? "provider";
    if (!DIMENSIONS.includes(dimension as Dimension)) throw new QueryError(`dimension must be one of ${DIMENSIONS.join(", ")}`);
    return breakdown(contextFrom(queryOf(request)), dimension as Dimension);
  });
}
