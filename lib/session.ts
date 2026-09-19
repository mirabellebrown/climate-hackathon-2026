import { FACTORS } from "./factors";
import type { RouteResult } from "./types";

export const SESSION_KEY = `canopy-session-${FACTORS.version}`;
const EVENT = "canopy-session-change";
// Covers everything the local server can still return (it keeps at most 200 runs).
export const MAX_SEEN = 500;
export interface SessionTotals {
  requests: number;
  routedWh: number;
  baselineWh: number;
  // Routing IDs already counted. Kept across resets so polling never re-adds old runs.
  seen: string[];
}
const EMPTY: SessionTotals = { requests: 0, routedWh: 0, baselineWh: 0, seen: [] };
export interface SessionSnapshot extends SessionTotals { persistent: boolean }
const SERVER_SNAPSHOT: SessionSnapshot = { ...EMPTY, persistent: true };
let snapshot = SERVER_SNAPSHOT;
let lastRaw: string | null | undefined;

export function parseSession(raw: string | null): SessionTotals {
  try {
    if (!raw) return EMPTY;
    const data = JSON.parse(raw);
    if (data.version !== FACTORS.version || !Number.isSafeInteger(data.requests) || data.requests < 0
      || !Number.isFinite(data.routedWh) || data.routedWh < 0
      || !Number.isFinite(data.baselineWh) || data.baselineWh < 0) return EMPTY;
    const seen = Array.isArray(data.seen) ? data.seen.filter((id: unknown): id is string => typeof id === "string").slice(-MAX_SEEN) : [];
    return { requests: data.requests, routedWh: data.routedWh, baselineWh: data.baselineWh, seen };
  } catch { return EMPTY; }
}

/** Adds completed runs not yet counted. Returns the same object when nothing is new. */
export function addResults(totals: SessionTotals, results: RouteResult[]): SessionTotals {
  const seen = new Set(totals.seen);
  let next = totals;
  for (const result of results) {
    if (seen.has(result.id)) continue;
    seen.add(result.id);
    next = {
      requests: next.requests + 1,
      routedWh: next.routedWh + result.impact.routed.energyWh,
      baselineWh: next.baselineWh + result.impact.baseline.energyWh,
      seen: [...next.seen, result.id].slice(-MAX_SEEN),
    };
  }
  return next;
}

export function resetTotals(totals: SessionTotals): SessionTotals {
  return { ...EMPTY, seen: totals.seen };
}

export function getSessionSnapshot(): SessionSnapshot {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw !== lastRaw) {
      snapshot = { ...parseSession(raw), persistent: true };
      lastRaw = raw;
    }
  } catch {
    if (snapshot.persistent) snapshot = { ...snapshot, persistent: false };
  }
  return snapshot;
}

export function getServerSessionSnapshot() { return SERVER_SNAPSHOT; }

export function subscribeSession(callback: () => void) {
  const storageListener = (event: StorageEvent) => { if (event.key === SESSION_KEY || event.key === null) callback(); };
  window.addEventListener("storage", storageListener);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", storageListener); window.removeEventListener(EVENT, callback); };
}

function save(totals: SessionTotals) {
  const raw = JSON.stringify({ ...totals, version: FACTORS.version });
  snapshot = { ...totals, persistent: true };
  try { window.localStorage.setItem(SESSION_KEY, raw); lastRaw = raw; }
  catch { snapshot = { ...totals, persistent: false }; }
  window.dispatchEvent(new Event(EVENT));
}

export function recordResults(results: RouteResult[]) {
  const current = getSessionSnapshot();
  const next = addResults(current, results);
  if (next !== current) save(next);
}
export function resetSession() { save(resetTotals(getSessionSnapshot())); }
