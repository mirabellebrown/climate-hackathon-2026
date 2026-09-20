"use client";

// The visitor's own Claude Code, running on their own machine.
//
// `npm run pair` on that machine prints a code holding the loopback address and a one-run
// token. Pasting it here points the chat at that copy of the app instead of this server, so
// prompts and answers go straight from this browser to that computer and never reach ours.
// Only a loopback address is accepted, so a pasted code can never aim the chat at someone
// else's machine.

export const BRIDGE_STORAGE = "canopy-local-bridge";
export interface Bridge { url: string; token: string }

const LOOPBACK = ["127.0.0.1", "localhost", "[::1]"];

/** Parse "http://127.0.0.1:3000#token" into a bridge, or null if it is not one we accept. */
export function parseConnectCode(text: string): Bridge | null {
  let url: URL;
  try { url = new URL(text.trim()); } catch { return null; }
  const token = url.hash.replace(/^#/, "").trim();
  if (url.protocol !== "http:" || !LOOPBACK.includes(url.hostname) || !token) return null;
  if (!/^[A-Za-z0-9._-]{16,300}$/.test(token)) return null;
  return { url: url.origin, token };
}

function read(): Bridge | null {
  try {
    const raw = window.localStorage.getItem(BRIDGE_STORAGE);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return typeof data?.url === "string" && typeof data?.token === "string" ? parseConnectCode(`${data.url}#${data.token}`) : null;
  } catch { return null; }
}

const EVENT = "canopy-bridge-change";
let snapshot: Bridge | null = null;
let lastRaw: string | null | undefined;

/** Stable snapshot for useSyncExternalStore, so reading storage never loops. */
export function getBridgeSnapshot(): Bridge | null {
  try {
    const raw = window.localStorage.getItem(BRIDGE_STORAGE);
    if (raw !== lastRaw) { snapshot = read(); lastRaw = raw; }
  } catch { /* keep the last snapshot */ }
  return snapshot;
}
export const getServerBridgeSnapshot = () => null;
export function subscribeBridge(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === BRIDGE_STORAGE || event.key === null) callback(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(EVENT, callback); };
}

export function saveBridge(bridge: Bridge | null) {
  try {
    if (bridge) window.localStorage.setItem(BRIDGE_STORAGE, JSON.stringify(bridge));
    else window.localStorage.removeItem(BRIDGE_STORAGE);
  } catch { /* private window: this page keeps it in memory */ }
  snapshot = bridge; lastRaw = undefined;
  window.dispatchEvent(new Event(EVENT));
}

export const bridgeHeaders = (bridge: Bridge) => ({ "x-canopy-pair": bridge.token });

/**
 * Ask the paired app whether it is there. This is also the call that makes the browser
 * prompt for local network access, so it is worth doing before the first prompt.
 */
export async function checkBridge(bridge: Bridge): Promise<string | null> {
  try {
    const response = await fetch(`${bridge.url}/api/bridge`, { headers: bridgeHeaders(bridge), cache: "no-store" });
    if (response.status === 403) return "That code was refused. Start the app again with `npm run pair` and paste the new code.";
    if (!response.ok) return "Your computer answered, but not as Canopy. Is something else using that port?";
    return null;
  } catch {
    return "Couldn’t reach that address. Check the app is still running, and allow local network access if your browser asked.";
  }
}
