import { FACTORS } from "./factors";
import type { Impact, RouteResult, Tier, TokenUsage } from "./types";

export const SESSION_KEY = `greenroute-session-${FACTORS.version}`;
/** Prior Canopy key — read once for continuity after rename. */
const LEGACY_SESSION_KEY = `canopy-session-${FACTORS.version}`;
export const MAX_PROMPT_LOG = 40;
const EVENT = "greenroute-session-change";

export interface PromptUsageRecord {
  prompt: string;
  model: string;
  modelName: string;
  tier: Tier;
  chosen: TokenUsage;
  baseline: TokenUsage;
  classifier: TokenUsage;
  routedWh: number;
  baselineWh: number;
  routedUsd: number;
  baselineUsd: number;
}

export interface SessionTotals {
  requests: number;
  routedWh: number;
  baselineWh: number;
  routedUsd: number;
  baselineUsd: number;
  routedCo2eGrams: number;
  baselineCo2eGrams: number;
  routedWaterLiters: number;
  baselineWaterLiters: number;
  chosenInputTokens: number;
  chosenOutputTokens: number;
  baselineInputTokens: number;
  baselineOutputTokens: number;
  entries: PromptUsageRecord[];
}

export interface LifetimeSavings {
  requests: number;
  usd: number;
  co2eGrams: number;
  waterLiters: number;
  energyWh: number;
  extraUsd: boolean;
  extraCo2: boolean;
  extraWater: boolean;
}

const EMPTY: SessionTotals = {
  requests: 0, routedWh: 0, baselineWh: 0, routedUsd: 0, baselineUsd: 0,
  routedCo2eGrams: 0, baselineCo2eGrams: 0, routedWaterLiters: 0, baselineWaterLiters: 0,
  chosenInputTokens: 0, chosenOutputTokens: 0, baselineInputTokens: 0, baselineOutputTokens: 0,
  entries: [],
};
export interface SessionSnapshot extends SessionTotals { persistent: boolean }
const SERVER_SNAPSHOT: SessionSnapshot = { ...EMPTY, persistent: true, entries: [] };
let snapshot = SERVER_SNAPSHOT;
let lastRaw: string | null | undefined;

function validTokens(value: unknown): value is TokenUsage {
  if (typeof value !== "object" || value === null) return false;
  const inputTokens = "inputTokens" in value ? value.inputTokens : undefined;
  const outputTokens = "outputTokens" in value ? value.outputTokens : undefined;
  return typeof inputTokens === "number" && Number.isSafeInteger(inputTokens) && inputTokens >= 0
    && typeof outputTokens === "number" && Number.isSafeInteger(outputTokens) && outputTokens >= 0;
}

function parseEntries(value: unknown): PromptUsageRecord[] {
  if (!Array.isArray(value)) return [];
  const entries: PromptUsageRecord[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    if (typeof item.prompt !== "string" || typeof item.model !== "string" || typeof item.modelName !== "string") continue;
    if (item.tier !== "light" && item.tier !== "medium" && item.tier !== "heavy") continue;
    if (!validTokens(item.chosen) || !validTokens(item.baseline) || !validTokens(item.classifier)) continue;
    if (!Number.isFinite(item.routedWh) || item.routedWh < 0 || !Number.isFinite(item.baselineWh) || item.baselineWh < 0) continue;
    if (!Number.isFinite(item.routedUsd) || item.routedUsd < 0 || !Number.isFinite(item.baselineUsd) || item.baselineUsd < 0) continue;
    entries.push({
      prompt: item.prompt, model: item.model, modelName: item.modelName, tier: item.tier,
      chosen: { inputTokens: item.chosen.inputTokens, outputTokens: item.chosen.outputTokens },
      baseline: { inputTokens: item.baseline.inputTokens, outputTokens: item.baseline.outputTokens },
      classifier: { inputTokens: item.classifier.inputTokens, outputTokens: item.classifier.outputTokens },
      routedWh: item.routedWh, baselineWh: item.baselineWh,
      routedUsd: item.routedUsd, baselineUsd: item.baselineUsd,
    });
  }
  return entries.slice(0, MAX_PROMPT_LOG);
}

function nonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseSession(raw: string | null): SessionTotals {
  try {
    if (!raw) return EMPTY;
    const data = JSON.parse(raw);
    if (data.version !== FACTORS.version || !Number.isSafeInteger(data.requests) || data.requests < 0
      || !Number.isFinite(data.routedWh) || data.routedWh < 0
      || !Number.isFinite(data.baselineWh) || data.baselineWh < 0
      || !Number.isFinite(data.routedUsd) || data.routedUsd < 0
      || !Number.isFinite(data.baselineUsd) || data.baselineUsd < 0) return EMPTY;
    const chosenInputTokens = Number.isSafeInteger(data.chosenInputTokens) && data.chosenInputTokens >= 0 ? data.chosenInputTokens : 0;
    const chosenOutputTokens = Number.isSafeInteger(data.chosenOutputTokens) && data.chosenOutputTokens >= 0 ? data.chosenOutputTokens : 0;
    const baselineInputTokens = Number.isSafeInteger(data.baselineInputTokens) && data.baselineInputTokens >= 0 ? data.baselineInputTokens : 0;
    const baselineOutputTokens = Number.isSafeInteger(data.baselineOutputTokens) && data.baselineOutputTokens >= 0 ? data.baselineOutputTokens : 0;
    const routedCo2eGrams = nonnegative(data.routedCo2eGrams) ?? Math.max(0, data.routedWh * FACTORS.carbonGramsPerWh);
    const baselineCo2eGrams = nonnegative(data.baselineCo2eGrams) ?? Math.max(0, data.baselineWh * FACTORS.carbonGramsPerWh);
    const routedWaterLiters = nonnegative(data.routedWaterLiters) ?? Math.max(0, (data.routedWh / 1000) * FACTORS.waterLitersPerKwh);
    const baselineWaterLiters = nonnegative(data.baselineWaterLiters) ?? Math.max(0, (data.baselineWh / 1000) * FACTORS.waterLitersPerKwh);
    return {
      requests: data.requests, routedWh: data.routedWh, baselineWh: data.baselineWh,
      routedUsd: data.routedUsd, baselineUsd: data.baselineUsd,
      routedCo2eGrams, baselineCo2eGrams, routedWaterLiters, baselineWaterLiters,
      chosenInputTokens, chosenOutputTokens, baselineInputTokens, baselineOutputTokens,
      entries: parseEntries(data.entries),
    };
  } catch { return EMPTY; }
}

export function addImpact(totals: SessionTotals, impact: Impact): SessionTotals {
  return {
    ...totals,
    requests: totals.requests + 1,
    routedWh: totals.routedWh + impact.routed.energyWh,
    baselineWh: totals.baselineWh + impact.baseline.energyWh,
    routedUsd: totals.routedUsd + impact.cost.routed,
    baselineUsd: totals.baselineUsd + impact.cost.baseline,
    routedCo2eGrams: totals.routedCo2eGrams + impact.routed.co2eGrams,
    baselineCo2eGrams: totals.baselineCo2eGrams + impact.baseline.co2eGrams,
    routedWaterLiters: totals.routedWaterLiters + impact.routed.waterLiters,
    baselineWaterLiters: totals.baselineWaterLiters + impact.baseline.waterLiters,
  };
}

/** Lifetime (browser-session) savings vs always using Gemini Pro. */
export function lifetimeSavings(totals: SessionTotals): LifetimeSavings {
  const usd = totals.baselineUsd - totals.routedUsd;
  const co2eGrams = totals.baselineCo2eGrams - totals.routedCo2eGrams;
  const waterLiters = totals.baselineWaterLiters - totals.routedWaterLiters;
  const energyWh = totals.baselineWh - totals.routedWh;
  return {
    requests: totals.requests,
    usd, co2eGrams, waterLiters, energyWh,
    extraUsd: usd < 0,
    extraCo2: co2eGrams < 0,
    extraWater: waterLiters < 0,
  };
}

export interface CostSeriesPoint {
  request: number;
  actualUsd: number;
  alwaysProUsd: number;
}

/** Cumulative USD after each request. Entries are stored newest-first; series is chronological. */
export function cumulativeCostSeries(entries: PromptUsageRecord[]): CostSeriesPoint[] {
  let actualUsd = 0;
  let alwaysProUsd = 0;
  return [...entries].reverse().map((entry, index) => {
    actualUsd += entry.routedUsd;
    alwaysProUsd += entry.baselineUsd;
    return { request: index + 1, actualUsd, alwaysProUsd };
  });
}

export function addRoute(totals: SessionTotals, prompt: string, result: RouteResult): SessionTotals {
  const withImpact = addImpact(totals, result.impact);
  const entry: PromptUsageRecord = {
    prompt, model: result.routing.model, modelName: result.routing.modelName, tier: result.routing.tier,
    chosen: result.usage.generation, baseline: result.usage.baseline, classifier: result.usage.classifier,
    routedWh: result.impact.routed.energyWh, baselineWh: result.impact.baseline.energyWh,
    routedUsd: result.impact.cost.routed, baselineUsd: result.impact.cost.baseline,
  };
  return {
    ...withImpact,
    chosenInputTokens: withImpact.chosenInputTokens + result.usage.generation.inputTokens,
    chosenOutputTokens: withImpact.chosenOutputTokens + result.usage.generation.outputTokens,
    baselineInputTokens: withImpact.baselineInputTokens + result.usage.baseline.inputTokens,
    baselineOutputTokens: withImpact.baselineOutputTokens + result.usage.baseline.outputTokens,
    entries: [entry, ...withImpact.entries].slice(0, MAX_PROMPT_LOG),
  };
}

export function getSessionSnapshot(): SessionSnapshot {
  try {
    let raw = window.localStorage.getItem(SESSION_KEY);
    if (raw === null) {
      const legacy = window.localStorage.getItem(LEGACY_SESSION_KEY);
      if (legacy !== null) {
        try { window.localStorage.setItem(SESSION_KEY, legacy); } catch { /* keep reading legacy */ }
        raw = legacy;
      }
    }
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
export function recordRoute(prompt: string, result: RouteResult) { save(addRoute(getSessionSnapshot(), prompt, result)); }
export function resetSession() { save({ ...EMPTY, entries: [] }); }
