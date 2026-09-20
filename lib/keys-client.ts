"use client";

// Provider keys the visitor brings. They live in this browser only: sent as request headers
// to this app's own API, which uses them for that request and never stores or logs them.
// Browser storage is readable by any script on this origin, so treat a pasted key as exposed
// to this site and revoke it when you are done.

export const KEYS_STORAGE = "canopy-api-keys";
export interface ApiKeys { gemini: string; anthropic: string }
export const EMPTY_KEYS: ApiKeys = { gemini: "", anthropic: "" };

export function loadKeys(): ApiKeys {
  try {
    const raw = window.localStorage.getItem(KEYS_STORAGE);
    if (!raw) return EMPTY_KEYS;
    const data = JSON.parse(raw);
    return { gemini: typeof data.gemini === "string" ? data.gemini : "", anthropic: typeof data.anthropic === "string" ? data.anthropic : "" };
  } catch { return EMPTY_KEYS; }
}

const EVENT = "canopy-keys-change";
let snapshot: ApiKeys = EMPTY_KEYS;
let lastRaw: string | null | undefined;

/** Stable snapshot for useSyncExternalStore, so reading storage never triggers a re-render loop. */
export function getKeysSnapshot(): ApiKeys {
  try {
    const raw = window.localStorage.getItem(KEYS_STORAGE);
    if (raw !== lastRaw) { snapshot = loadKeys(); lastRaw = raw; }
  } catch { /* keep the last snapshot */ }
  return snapshot;
}
export const getServerKeysSnapshot = () => EMPTY_KEYS;
export function subscribeKeys(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === KEYS_STORAGE || event.key === null) callback(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(EVENT, callback); };
}

export function saveKeys(keys: ApiKeys): boolean {
  try {
    const trimmed = { gemini: keys.gemini.trim(), anthropic: keys.anthropic.trim() };
    if (!trimmed.gemini && !trimmed.anthropic) window.localStorage.removeItem(KEYS_STORAGE);
    else window.localStorage.setItem(KEYS_STORAGE, JSON.stringify(trimmed));
    snapshot = trimmed; lastRaw = undefined;
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    // Storage blocked (private window): keep the keys in memory for this page only.
    snapshot = { gemini: keys.gemini.trim(), anthropic: keys.anthropic.trim() };
    window.dispatchEvent(new Event(EVENT));
    return false;
  }
}

/** Only sends a key the caller actually has; the server falls back to its own env keys. */
export function keyHeaders(keys: ApiKeys): Record<string, string> {
  const headers: Record<string, string> = {};
  if (keys.gemini.trim()) headers["x-gemini-key"] = keys.gemini.trim();
  if (keys.anthropic.trim()) headers["x-anthropic-key"] = keys.anthropic.trim();
  return headers;
}

export const maskKey = (key: string) => key.length <= 8 ? "••••" : `${key.slice(0, 4)}••••${key.slice(-4)}`;
