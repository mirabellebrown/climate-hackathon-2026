import { FACTORS } from "./factors";
import { validTokenCount } from "./impact";
import type { Footprint, Impact, RouteError, RouteResult, Routing, TokenUsage } from "./types";

export const CONVERSATION_KEY = `greenroute-conversation-${FACTORS.version}`;
/** Prior Canopy key — read once for continuity after rename. */
const LEGACY_CONVERSATION_KEY = `canopy-conversation-${FACTORS.version}`;
export const MAX_TURNS = 40;
const EVENT = "greenroute-conversation-change";

export interface ConversationTurn {
  id: string;
  prompt: string;
  result?: RouteResult;
  error?: RouteError["error"];
}

export interface ConversationState {
  turns: ConversationTurn[];
  lastResult: RouteResult | null;
  persistent: boolean;
}

const SERVER_SNAPSHOT: ConversationState = { turns: [], lastResult: null, persistent: true };
let snapshot = SERVER_SNAPSHOT;
let lastRaw: string | null | undefined;

function rec(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function validUsage(value: unknown): value is TokenUsage {
  const item = rec(value);
  if (!item) return false;
  return validTokenCount(item.inputTokens) && validTokenCount(item.outputTokens);
}

function validFootprint(value: unknown): value is Footprint {
  const item = rec(value);
  if (!item) return false;
  return [item.energyWh, item.co2eGrams, item.waterLiters, item.gasolineGallons, item.treeYears, item.treeMinutes].every(
    (field) => typeof field === "number" && Number.isFinite(field),
  );
}

function validRouting(value: unknown): value is Routing {
  const item = rec(value);
  if (!item) return false;
  if (item.tier !== "light" && item.tier !== "medium" && item.tier !== "heavy") return false;
  return typeof item.reason === "string" && typeof item.model === "string" && typeof item.modelName === "string"
    && typeof item.classifierModel === "string" && typeof item.classifierFallback === "boolean"
    && typeof item.baselineModel === "string";
}

function validImpact(value: unknown): value is Impact {
  const item = rec(value);
  if (!item) return false;
  if (!validFootprint(item.generation) || !validFootprint(item.classifier) || !validFootprint(item.routed) || !validFootprint(item.baseline)) return false;
  if (!validFootprint(item.savings)) return false;
  const cost = rec(item.cost);
  if (!cost) return false;
  if (typeof cost.generation !== "number" || typeof cost.classifier !== "number" || typeof cost.routed !== "number" || typeof cost.baseline !== "number" || typeof cost.savings !== "number") return false;
  if (cost.percent !== null && typeof cost.percent !== "number") return false;
  if (item.environmentalSource !== "ecologits" && item.environmentalSource !== "fallback") return false;
  return typeof item.methodologyVersion === "string";
}

export function validRouteResult(value: unknown): value is RouteResult {
  const item = rec(value);
  if (!item) return false;
  if (typeof item.answer !== "string" || typeof item.truncated !== "boolean") return false;
  if (!validRouting(item.routing) || !validImpact(item.impact)) return false;
  const usage = rec(item.usage);
  if (!usage) return false;
  return validUsage(usage.classifier) && validUsage(usage.generation) && validUsage(usage.baseline);
}

function validError(value: unknown): value is RouteError["error"] {
  const item = rec(value);
  if (!item) return false;
  return typeof item.code === "string" && typeof item.message === "string"
    && (item.stage === "request" || item.stage === "configuration" || item.stage === "classification" || item.stage === "generation");
}

export function latestResult(turns: ConversationTurn[]): RouteResult | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const result = turns[index]?.result;
    if (result) return result;
  }
  return null;
}

export function parseConversation(raw: string | null): Pick<ConversationState, "turns" | "lastResult"> {
  try {
    if (!raw) return { turns: [], lastResult: null };
    const data = JSON.parse(raw);
    if (data.version !== FACTORS.version || !Array.isArray(data.turns)) return { turns: [], lastResult: null };
    const turns: ConversationTurn[] = [];
    for (const rawTurn of data.turns) {
      const item = rec(rawTurn);
      if (!item) continue;
      if (typeof item.id !== "string" || typeof item.prompt !== "string" || !item.prompt.trim()) continue;
      const result = item.result === undefined ? undefined : validRouteResult(item.result) ? item.result : undefined;
      const error = item.error === undefined ? undefined : validError(item.error) ? item.error : undefined;
      if (!result && !error) continue;
      turns.push({ id: item.id, prompt: item.prompt, result, error });
    }
    const sliced = turns.slice(-MAX_TURNS);
    const storedLast = validRouteResult(data.lastResult) ? data.lastResult : null;
    return { turns: sliced, lastResult: storedLast ?? latestResult(sliced) };
  } catch {
    return { turns: [], lastResult: null };
  }
}

export function getConversationSnapshot(): ConversationState {
  try {
    let raw = window.localStorage.getItem(CONVERSATION_KEY);
    if (raw === null) {
      const legacy = window.localStorage.getItem(LEGACY_CONVERSATION_KEY);
      if (legacy !== null) {
        try { window.localStorage.setItem(CONVERSATION_KEY, legacy); } catch { /* keep reading legacy */ }
        raw = legacy;
      }
    }
    if (raw !== lastRaw) {
      snapshot = { ...parseConversation(raw), persistent: true };
      lastRaw = raw;
    }
  } catch {
    if (snapshot.persistent) snapshot = { ...snapshot, persistent: false };
  }
  return snapshot;
}

export function getServerConversationSnapshot() { return SERVER_SNAPSHOT; }

export function subscribeConversation(callback: () => void) {
  const storageListener = (event: StorageEvent) => { if (event.key === CONVERSATION_KEY || event.key === null) callback(); };
  window.addEventListener("storage", storageListener);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", storageListener); window.removeEventListener(EVENT, callback); };
}

function save(turns: ConversationTurn[], lastResult: RouteResult | null) {
  const next = turns.slice(-MAX_TURNS);
  const raw = JSON.stringify({ version: FACTORS.version, turns: next, lastResult });
  snapshot = { turns: next, lastResult, persistent: true };
  try { window.localStorage.setItem(CONVERSATION_KEY, raw); lastRaw = raw; }
  catch { snapshot = { turns: next, lastResult, persistent: false }; }
  window.dispatchEvent(new Event(EVENT));
}

export function appendTurn(turn: ConversationTurn) {
  const current = getConversationSnapshot();
  save([...current.turns, turn], turn.result ?? current.lastResult);
}

export function resetConversation() {
  const current = getConversationSnapshot();
  save([], current.lastResult);
}

export function clearConversation() { save([], null); }

export function newTurnId() {
  return crypto.randomUUID();
}
