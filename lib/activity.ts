import "server-only";
import { randomUUID } from "node:crypto";
import { RouteFailure } from "./errors";
import { calculateObservedImpact, totalModelTokens } from "./impact";
import type { Activity, ModelUsage, RouteResult, RoutingDecision } from "./types";

type Entry = { decision: RoutingDecision; activity: Activity };
const root = globalThis as typeof globalThis & { canopyActivities?: Map<string, Entry> };
const entries = root.canopyActivities ??= new Map<string, Entry>();
const MAX_ENTRIES = 200;

export function createDecision(data: Omit<RoutingDecision, "id" | "createdAt">): RoutingDecision {
  const decision = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  entries.set(decision.id, { decision, activity: { id: decision.id, createdAt: decision.createdAt, routing: decision.routing, status: "routed" } });
  // Never evict an in-flight run to make room for a newer completed one.
  if (entries.size > MAX_ENTRIES) {
    for (const [id, entry] of entries) {
      if (entry.activity.status !== "routed") { entries.delete(id); if (entries.size <= MAX_ENTRIES) break; }
    }
  }
  return decision;
}

export function listActivities(): Activity[] { return [...entries.values()].map((entry) => entry.activity).reverse().slice(0, 100); }

export function finishRun(id: string, models: ModelUsage[], durationMs: number): RouteResult {
  const entry = entries.get(id);
  if (!entry) throw new RouteFailure("UNKNOWN_REQUEST", "This routing decision is no longer available. The local server may have restarted.", 404, "request");
  if (entry.activity.result) return entry.activity.result;
  if (entry.activity.status === "failed") throw new RouteFailure("REQUEST_FINISHED", "This request has already been marked as failed.", 409, "request");
  const generation = totalModelTokens(models);
  const classifier = entry.decision.usage.classifier;
  const result: RouteResult = {
    id, createdAt: entry.decision.createdAt, completedAt: new Date().toISOString(), routing: entry.decision.routing,
    usage: { classifier, generation, models, total: { inputTokens: generation.inputTokens + classifier.inputTokens, outputTokens: generation.outputTokens + classifier.outputTokens } },
    impact: calculateObservedImpact(models, classifier), durationMs,
    modelMismatch: models.some((model) => !model.model.startsWith(entry.decision.routing.model)),
  };
  entry.activity = { ...entry.activity, status: "completed", result };
  return result;
}

export function failRun(id: string): Activity {
  const entry = entries.get(id);
  if (!entry) throw new RouteFailure("UNKNOWN_REQUEST", "This routing decision is no longer available.", 404, "request");
  if (entry.activity.status === "routed") entry.activity = { ...entry.activity, status: "failed", error: "Claude Code did not complete this run. See the terminal for details. Partial usage is not included in savings." };
  return entry.activity;
}
