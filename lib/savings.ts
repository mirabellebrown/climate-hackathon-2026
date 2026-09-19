import { footprintFromEnergy } from "./impact";
import type { SessionTotals } from "./session";

// Session savings vs always using Opus, for the chat's gauge and emoji strip
// (UI adapted from feat/claude-api-router, which measures cost vs Gemini Pro).

export const SAVINGS_EMOJI_SCALE = {
  /** One 💧 ≈ this much water saved. */
  dropletLiters: 0.001, // 1 mL
  /** One 🌳 ≈ this many tree-minutes of EPA uptake. */
  treeMinutes: 1,
  maxIcons: 10,
} as const;

export function savingsOverview(totals: Pick<SessionTotals, "requests" | "routedWh" | "baselineWh">) {
  const savedWh = totals.baselineWh - totals.routedWh;
  const footprint = footprintFromEnergy(savedWh);
  return {
    requests: totals.requests,
    savedWh,
    savedPercent: totals.baselineWh > 0 ? savedWh / totals.baselineWh * 100 : null,
    waterLiters: footprint.waterLiters,
    co2eGrams: footprint.co2eGrams,
    treeMinutes: footprint.treeMinutes,
  };
}

/** 0–100 gauge fill; extra impact shows an empty dial rather than a negative sweep. */
export function gaugePercent(savedPercent: number | null, requests: number): number {
  if (requests <= 0 || savedPercent === null) return 0;
  return Math.min(100, Math.max(0, savedPercent));
}

export function iconCount(amount: number, unit: number, max: number = SAVINGS_EMOJI_SCALE.maxIcons) {
  if (!(amount > 0) || !(unit > 0)) return { count: 0, capped: false };
  const raw = Math.max(1, Math.round(amount / unit));
  return raw > max ? { count: max, capped: true } : { count: raw, capped: false };
}
