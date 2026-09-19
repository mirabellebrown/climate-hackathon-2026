import { FACTORS } from "./factors";
import type { Impact } from "./types";

export const SESSION_KEY = `canopy-session-${FACTORS.version}`;
const EVENT = "canopy-session-change";
export interface SessionTotals {
  requests: number;
  routedWh: number;
  baselineWh: number;
}
const EMPTY: SessionTotals = { requests: 0, routedWh: 0, baselineWh: 0 };
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
    return { requests: data.requests, routedWh: data.routedWh, baselineWh: data.baselineWh };
  } catch { return EMPTY; }
}

export function addImpact(totals: SessionTotals, impact: Impact): SessionTotals {
  return { requests: totals.requests + 1, routedWh: totals.routedWh + impact.routed.energyWh, baselineWh: totals.baselineWh + impact.baseline.energyWh };
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

export function recordImpact(impact: Impact) { save(addImpact(getSessionSnapshot(), impact)); }
export function resetSession() { save(EMPTY); }
