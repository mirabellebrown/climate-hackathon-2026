"use client";

import { useSyncExternalStore } from "react";
import { TEAM_BUDGET_USD } from "@/lib/config";
import { budgetStatus } from "@/lib/dashboard";
import { money, percent, tokens } from "@/lib/format";
import { teamActualTokens } from "@/lib/dashboard";
import { getServerSessionSnapshot, getSessionSnapshot, subscribeSession } from "@/lib/session";

export function BudgetTracking() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const budget = budgetStatus(session);
  const teamTokens = teamActualTokens(session);
  const spentPct = Math.min(Math.max(budget.spentFraction, 0), 1.5);
  const tokenPct = Math.min(budget.tokenLoadVsPro, 1.5);

  return (
    <section className="dash-section budget-section" aria-labelledby="budget-title" data-testid="budget-tracking">
      <div className="dash-section-head">
        <p className="eyebrow">Budget</p>
        <h2 id="budget-title">Budget tracking</h2>
        <p>
          Prototype allocation of {money(TEAM_BUDGET_USD)} for this team’s Gemini API spend
          (<code>TEAM_BUDGET_USD</code> in config). Not enforced — for manager demos only.
        </p>
      </div>
      <div className="budget-grid">
        <article>
          <p className="lifetime-label">Allocated</p>
          <p className="budget-figure" data-testid="budget-allocated">{money(budget.allocatedUsd)}</p>
        </article>
        <article>
          <p className="lifetime-label">Spent</p>
          <p className="budget-figure" data-testid="budget-spent">{money(budget.spentUsd)}</p>
        </article>
        <article>
          <p className="lifetime-label">Remaining</p>
          <p className="budget-figure" data-testid="budget-remaining">{money(budget.remainingUsd)}</p>
        </article>
      </div>
      <div className="budget-meters">
        <div>
          <div className="chart-label"><span>Budget consumed</span><strong>{percent(budget.spentFraction * 100)}</strong></div>
          <div className="bar-track tall"><div className="bar routed-bar" style={{ width: `${Math.min(spentPct, 1) * 100}%` }} /></div>
        </div>
        <div>
          <div className="chart-label">
            <span>Token load vs Always Pro</span>
            <strong>{session.requests ? `${tokens(teamTokens)} tokens` : "—"}</strong>
          </div>
          <div className="bar-track tall"><div className="bar baseline-bar" style={{ width: `${Math.min(tokenPct || 0, 1) * 100}%` }} /></div>
          <p className="budget-hint">
            Grey bar scales total team tokens (answers + classifier) against Always Pro answer volume — secondary context; cost savings are in the chart above.
          </p>
        </div>
      </div>
    </section>
  );
}
