import { FACTORS } from "./factors";
import type { LifetimeSavings } from "./session";

/** Chat-footer emoji scales (tiny EcoLogits totals need fine units). */
export const SAVINGS_EMOJI_SCALE = {
  /** One 💧 ≈ this much water saved. */
  dropletLiters: 0.001, // 1 mL
  /** One 🌳 ≈ this many tree-minutes of EPA uptake. */
  treeMinutes: 1,
  maxIcons: 10,
} as const;

export function treeMinutesFromCo2eGrams(co2eGrams: number): number {
  return (co2eGrams / FACTORS.treeGramsPerYear) * FACTORS.minutesPerYear;
}

function iconCount(amount: number, unit: number, max: number): { count: number; capped: boolean } {
  if (!(amount > 0) || !(unit > 0)) return { count: 0, capped: false };
  const raw = Math.max(1, Math.round(amount / unit));
  if (raw > max) return { count: max, capped: true };
  return { count: raw, capped: false };
}

export interface SavingsEmojiCounts {
  droplets: number;
  trees: number;
  hasSavings: boolean;
  waterLiters: number;
  treeMinutes: number;
  capped: { droplets: boolean; trees: boolean };
}

/** Map session lifetime savings into water-droplet and tree emoji counts. */
export function savingsEmojiCounts(life: LifetimeSavings): SavingsEmojiCounts {
  const waterLiters = life.waterLiters;
  const treeMinutes = treeMinutesFromCo2eGrams(Math.max(0, life.co2eGrams));
  const droplets = iconCount(waterLiters, SAVINGS_EMOJI_SCALE.dropletLiters, SAVINGS_EMOJI_SCALE.maxIcons);
  const trees = iconCount(treeMinutes, SAVINGS_EMOJI_SCALE.treeMinutes, SAVINGS_EMOJI_SCALE.maxIcons);
  return {
    droplets: droplets.count,
    trees: trees.count,
    hasSavings: waterLiters > 0 || life.co2eGrams > 0,
    waterLiters,
    treeMinutes,
    capped: { droplets: droplets.capped, trees: trees.capped },
  };
}
