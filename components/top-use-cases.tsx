"use client";

import { useSyncExternalStore } from "react";
import { topUseCases } from "@/lib/dashboard";
import { money, tokens } from "@/lib/format";
import { getServerSessionSnapshot, getSessionSnapshot, subscribeSession } from "@/lib/session";

export function TopUseCases() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const cases = topUseCases(session.entries, 5);

  return (
    <section className="dash-section use-cases-section" aria-labelledby="use-cases-title" data-testid="top-use-cases">
      <div className="dash-section-head">
        <p className="eyebrow">Use cases</p>
        <h2 id="use-cases-title">Top use cases</h2>
        <p>
          Ranked from this browser’s team session log. Tiers map to Quick answers / Coding &amp; reasoning / Complex systems;
          medium prompts with code-like keywords split into Coding. Prototype data — not a live org taxonomy.
        </p>
      </div>
      {cases.length === 0 ? (
        <p className="dash-empty">Use cases appear after the team completes routed chats.</p>
      ) : (
        <ol className="use-case-list">
          {cases.map((item, index) => (
            <li key={item.id} className="use-case-row" data-testid={`use-case-${item.id}`}>
              <span className="use-case-rank">{index + 1}</span>
              <div className="use-case-body">
                <strong>{item.label}</strong>
                <span>{item.requests} {item.requests === 1 ? "request" : "requests"} · {tokens(item.teamTokens)} team tokens</span>
              </div>
              <div className="use-case-savings">
                <span className="lifetime-label">vs Always Pro</span>
                <strong data-testid={`use-case-savings-${item.id}`}>
                  {item.usdSaved >= 0 ? `${money(item.usdSaved)} saved` : `${money(Math.abs(item.usdSaved))} extra`}
                </strong>
                <span className="use-case-token-note">{tokens(item.alwaysProTokens)} Pro answer tokens</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
