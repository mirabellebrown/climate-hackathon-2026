"use client";

import { useSyncExternalStore } from "react";
import { FACTORS } from "@/lib/factors";
import { number } from "@/lib/format";
import { SAVINGS_EMOJI_SCALE, savingsEmojiCounts } from "@/lib/savings-emojis";
import { getServerSessionSnapshot, getSessionSnapshot, lifetimeSavings, subscribeSession } from "@/lib/session";

function repeat(emoji: string, count: number) {
  return Array.from({ length: count }, (_, index) => (
    <span key={`${emoji}-${index}`} className="savings-emoji" aria-hidden="true">{emoji}</span>
  ));
}

/** Compact water + tree strip along the chat bottom (gauge stays bottom-right). */
export function SessionSavingsEmojis() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const life = lifetimeSavings(session);
  const icons = savingsEmojiCounts(life);
  const empty = life.requests === 0 || !icons.hasSavings;
  const treeKg = FACTORS.treeGramsPerYear / 1000;

  return (
    <aside className="session-savings-emojis" aria-label="Water and tree savings" data-testid="session-savings-emojis">
      {empty ? (
        <p className="session-savings-emojis-empty" data-testid="session-savings-emojis-empty">
          🧴🌳 grow here as you save water and trees vs Always Pro
        </p>
      ) : (
        <>
          <div className="session-savings-emoji-row" data-testid="savings-bottles">
            <span className="session-savings-emoji-label">Water</span>
            <span className="session-savings-emoji-icons">
              {repeat("🧴", icons.bottles)}
              {icons.capped.bottles ? <span className="savings-more">+</span> : null}
            </span>
            <span className="session-savings-emoji-meta">{number(Math.abs(icons.waterLiters) * 1000)} mL</span>
          </div>
          <div className="session-savings-emoji-row" data-testid="savings-trees">
            <span className="session-savings-emoji-label">Trees</span>
            <span className="session-savings-emoji-icons">
              {repeat("🌳", icons.trees)}
              {icons.capped.trees ? <span className="savings-more">+</span> : null}
            </span>
            <span className="session-savings-emoji-meta">{number(icons.treeMinutes)} min</span>
          </div>
          <p className="session-savings-emoji-caption" data-testid="session-savings-emoji-caption">
            1 🧴 = {SAVINGS_EMOJI_SCALE.bottleLiters * 1000} mL · 1 🌳 = {SAVINGS_EMOJI_SCALE.treeMinutes} tree-min
            (EPA {number(treeKg)} kg CO₂/yr)
          </p>
        </>
      )}
    </aside>
  );
}
