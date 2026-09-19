import "server-only";
import type { RouteError } from "./types";

export class RouteFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public stage: RouteError["error"]["stage"],
  ) { super(message); }
}

export function providerStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") return error.status;
  return undefined;
}

export function providerFailure(
  error: unknown,
  provider: "Gemini",
  model: string,
  stage: RouteError["error"]["stage"],
): RouteFailure {
  if (error instanceof RouteFailure) return error;
  const status = providerStatus(error);
  if (status === 401 || status === 403) {
    return new RouteFailure("PROVIDER_AUTH", `${provider} could not authorize this request. Check the server API key and model access.`, 502, stage);
  }
  if (status === 404) {
    return new RouteFailure("MODEL_UNAVAILABLE", `${provider} model ${model} is unavailable for this API key. Check model access and the pinned model configuration.`, 502, stage);
  }
  if (status === 429) {
    return new RouteFailure("RATE_LIMITED", `${provider} is rate-limited or out of quota. Check your provider quota and try again later.`, 429, stage);
  }
  const timedOut = error instanceof Error && /timeout|abort/i.test(error.name);
  return new RouteFailure(timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR",
    timedOut ? `${provider} took too long to respond. Please try again.` : `${provider} could not complete the ${stage} step. Please try again.`,
    timedOut ? 504 : 502, stage);
}
