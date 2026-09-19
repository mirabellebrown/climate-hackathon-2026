import "server-only";
import { randomUUID } from "node:crypto";
import { RouteFailure } from "./errors";
import { calculateObservedImpact, tierForModel, totalModelTokens } from "./impact";
import type { Activity, ModelUsage, RouteResult, RoutingDecision } from "./types";

type Entry = { decision: RoutingDecision; activity: Activity };
const root = globalThis as typeof globalThis & { canopyActivities?: Map<string, Entry> };
const entries = root.canopyActivities ??= new Map<string, Entry>();
export const MAX_ENTRIES = 200;
// A launcher that never reports back (crash, closed terminal) should not stay "in progress" forever.
export const PENDING_TTL_MS = 60 * 60 * 1000;

function expire(now = Date.now()) {
  for (const entry of entries.values()) {
    if (entry.activity.status === "routed" && now - Date.parse(entry.activity.createdAt) > PENDING_TTL_MS) {
      entry.activity = { ...entry.activity, status: "failed", error: "The launcher never reported this run. No usage was recorded." };
    }
  }
}

function evict() {
  if (entries.size <= MAX_ENTRIES) return;
  // Prefer dropping finished entries; fall back to the oldest pending ones so memory stays bounded.
  for (const finishedOnly of [true, false]) {
    for (const [id, entry] of entries) {
      if (entries.size <= MAX_ENTRIES) return;
      if (!finishedOnly || entry.activity.status !== "routed") entries.delete(id);
    }
  }
}

export function createDecision(data: Omit<RoutingDecision, "id" | "createdAt">): RoutingDecision {
  const decision = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  entries.set(decision.id, { decision, activity: { id: decision.id, createdAt: decision.createdAt, routing: decision.routing, status: "routed" } });
  expire();
  evict();
  return decision;
}

export function listActivities(): Activity[] {
  expire();
  return [...entries.values()].map((entry) => entry.activity).reverse().slice(0, 100);
}

function find(id: string): Entry {
  const entry = entries.get(id);
  if (!entry) throw new RouteFailure("UNKNOWN_REQUEST", "This routing decision is no longer available. The local server may have restarted.", 404, "request");
  return entry;
}

export function finishRun(id: string, models: ModelUsage[], durationMs: number): RouteResult {
  const entry = find(id);
  if (entry.activity.result) return entry.activity.result;
  if (entry.activity.status === "failed") throw new RouteFailure("REQUEST_FINISHED", "This request has already been marked as failed.", 409, "request");
  const unknown = models.find((model) => !tierForModel(model.model));
  if (unknown) {
    const message = `Claude Code used ${unknown.model}, which has no impact factor, so this run cannot be estimated honestly.`;
    failRun(id, message);
    throw new RouteFailure("UNSUPPORTED_MODEL", message, 422, "generation");
  }
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

export function failRun(id: string, message = "Claude Code did not complete this run. See the terminal for details. No usage is included in savings."): Activity {
  const entry = find(id);
  if (entry.activity.status === "routed") entry.activity = { ...entry.activity, status: "failed", error: message };
  return entry.activity;
}

export function clearActivities() { entries.clear(); }
