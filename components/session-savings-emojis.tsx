"use client";

import { useSyncExternalStore } from "react";
import { FACTORS } from "@/lib/factors";
import { number } from "@/lib/format";
import { iconCount, SAVINGS_EMOJI_SCALE, savingsOverview } from "@/lib/savings";
import { getServerSessionSnapshot, getSessionSnapshot, subscribeSession } from "@/lib/session";

function repeat(emoji: string, count: number) {
  return Array.from({ length: count }, (_, index) => <span key={`${emoji}-${index}`} className="savings-emoji" aria-hidden="true">{emoji}</span>);
}

/** Water + tree savings strip (GreenRoute design), in-flow beside the gauge. */
export function SessionSavingsEmojis() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const s = savingsOverview(session);
  const droplets = iconCount(s.waterLiters, SAVINGS_EMOJI_SCALE.dropletLiters);
  const trees = iconCount(s.treeMinutes, SAVINGS_EMOJI_SCALE.treeMinutes);
  const empty = s.requests === 0 || s.savedWh <= 0;
  return <aside className="session-savings-emojis" aria-label="Water and tree savings" data-testid="session-savings-emojis">
    {empty ? <p className="session-savings-emojis-empty" data-testid="session-savings-emojis-empty">💧🌳 grow here as you save water and trees vs always Opus</p> : <>
      <div className="session-savings-emoji-row" data-testid="savings-droplets">
        <span className="session-savings-emoji-label">Water</span>
        <span className="session-savings-emoji-icons">{repeat("💧", droplets.count)}{droplets.capped && <span className="savings-more">+</span>}</span>
        <span className="session-savings-emoji-meta">{number(s.waterLiters * 1000)} mL</span>
      </div>
      <div className="session-savings-emoji-row" data-testid="savings-trees">
        <span className="session-savings-emoji-label">Trees</span>
        <span className="session-savings-emoji-icons">{repeat("🌳", trees.count)}{trees.capped && <span className="savings-more">+</span>}</span>
        <span className="session-savings-emoji-meta">{number(s.treeMinutes)} min</span>
      </div>
      <p className="session-savings-emoji-caption" data-testid="session-savings-emoji-caption">
        1 💧 = {SAVINGS_EMOJI_SCALE.dropletLiters * 1000} mL · 1 🌳 = {SAVINGS_EMOJI_SCALE.treeMinutes} tree-min (EPA {number(FACTORS.treeGramsPerYear / 1000)} kg CO₂/yr)
      </p>
    </>}
  </aside>;
}
