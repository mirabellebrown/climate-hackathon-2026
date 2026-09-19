import "server-only";
import { errorResponse, NO_STORE, requireLocalRequest } from "../local-api";
import { RouteFailure } from "../errors";
import { resolve, QueryError, type Context } from "./report";
import { loadDataset, loadSettings } from "./store";
import { EsgInputError } from "./validate";

export function contextFrom(query: { period?: string | null; scope?: string | null; baseline?: string | null }): Context {
  const { records, sample } = loadDataset();
  return resolve(records, loadSettings(), query, sample);
}

export function queryOf(request: Request) {
  const params = new URL(request.url).searchParams;
  return { period: params.get("period"), scope: params.get("scope"), baseline: params.get("baseline") };
}

export async function readJson(request: Request, limit = 5_000_000): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new RouteFailure("INVALID_CONTENT_TYPE", "Send a JSON body.", 415, "request");
  const text = await request.text();
  if (text.length > limit) throw new RouteFailure("TOO_LARGE", "This request is too large.", 413, "request");
  try { return JSON.parse(text); } catch { throw new RouteFailure("INVALID_JSON", "The request body is not valid JSON.", 400, "request"); }
}

/** Local-only guard, no-store, and consistent errors for every ESG endpoint. */
export async function handle(request: Request, run: () => unknown | Promise<unknown>): Promise<Response> {
  try {
    requireLocalRequest(request);
    const result = await run();
    return result instanceof Response ? result : Response.json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof EsgInputError || error instanceof QueryError) return errorResponse(new RouteFailure("INVALID_INPUT", error.message, 400, "request"));
    return errorResponse(error);
  }
}
