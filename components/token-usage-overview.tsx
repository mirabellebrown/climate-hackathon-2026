"use client";

import { useSyncExternalStore } from "react";
import { money, percent, tokens } from "@/lib/format";
import { costOverview, tokenOverview } from "@/lib/dashboard";
import { cumulativeCostSeries, getServerSessionSnapshot, getSessionSnapshot, subscribeSession } from "@/lib/session";

const W = 640;
const H = 260;
const PAD = { top: 18, right: 16, bottom: 36, left: 56 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

function polyline(points: { x: number; y: number }[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function MoneyChart() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const series = cumulativeCostSeries(session.entries);
  if (series.length === 0) return null;

  const maxY = Math.max(...series.map((point) => Math.max(point.actualUsd, point.alwaysProUsd)), 1e-9);
  const maxX = series.length;
  const xAt = (request: number) => PAD.left + ((request - 1) / Math.max(maxX - 1, 1)) * INNER_W;
  const yAt = (usd: number) => PAD.top + INNER_H - (usd / maxY) * INNER_H;
  const actualPoints = series.map((point) => ({ x: xAt(point.request), y: yAt(point.actualUsd) }));
  const proPoints = series.map((point) => ({ x: xAt(point.request), y: yAt(point.alwaysProUsd) }));
  const yTicks = [0, 0.5, 1].map((fraction) => ({ value: maxY * fraction, y: yAt(maxY * fraction) }));

  return (
    <div className="token-money-chart is-primary" data-testid="cost-usage-chart">
      <h3>Money vs usage</h3>
      <p>Cumulative API spend as the team sends prompts — Actual (routed + classifier) vs Always Pro (Gemini Pro ≈ Opus).</p>
      <div className="cost-chart-legend" aria-hidden="true">
        <span><i className="legend-line actual-line" />Team actual</span>
        <span><i className="legend-line pro-line" />Always Pro</span>
      </div>
      <svg className="cost-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumulative team API cost versus Always Pro">
        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line className="chart-grid" x1={PAD.left} x2={W - PAD.right} y1={tick.y} y2={tick.y} />
            <text className="chart-axis-label" x={PAD.left - 10} y={tick.y + 4} textAnchor="end">{money(tick.value)}</text>
          </g>
        ))}
        <line className="chart-axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} />
        <line className="chart-axis" x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} />
        <polyline className="cost-series always-pro" fill="none" points={polyline(proPoints)} />
        <polyline className="cost-series actual" fill="none" points={polyline(actualPoints)} />
        {series.map((point) => (
          <g key={point.request}>
            <circle className="cost-dot always-pro" cx={xAt(point.request)} cy={yAt(point.alwaysProUsd)} r={3.5} />
            <circle className="cost-dot actual" cx={xAt(point.request)} cy={yAt(point.actualUsd)} r={3.5} />
            {(point.request === 1 || point.request === maxX || maxX <= 6) && (
              <text className="chart-axis-label" x={xAt(point.request)} y={H - PAD.bottom + 20} textAnchor="middle">{point.request}</text>
            )}
          </g>
        ))}
        <text className="chart-axis-title" x={PAD.left + INNER_W / 2} y={H - 2} textAnchor="middle">Team request #</text>
      </svg>
      <p className="cost-chart-summary" data-testid="cost-usage-summary">
        After {series.length} {series.length === 1 ? "request" : "requests"}: Team {money(series.at(-1)!.actualUsd)} · Always Pro {money(series.at(-1)!.alwaysProUsd)}
      </p>
    </div>
  );
}

export function TokenUsageOverview() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const cost = costOverview(session);
  const tokensView = tokenOverview(session);
  const empty = cost.requests === 0;
  const savedLabel = cost.savedUsd >= 0 ? "saved vs Always Pro" : "extra vs Always Pro";

  return (
    <section className="dash-section token-overview" aria-labelledby="token-overview-title" data-testid="token-usage-overview">
      <div className="dash-section-head">
        <p className="eyebrow">Primary</p>
        <h2 id="token-overview-title">Cost vs Always Pro</h2>
        <p>
          What the team paid with the classifier and router versus running every turn on Gemini Pro
          (like always Opus). Team spend includes routed answers plus classification; Always Pro is the same answers at Pro rates with no classifier.
        </p>
      </div>
      {empty ? (
        <>
          <p className="dash-empty">No team requests yet. Chat on the home page to start accumulating usage.</p>
          <div data-testid="cost-usage-chart" className="token-money-chart is-primary is-empty">
            <h3>Money vs usage</h3>
            <p className="dash-empty">Send team prompts to grow the spend comparison.</p>
          </div>
        </>
      ) : (
        <>
          <MoneyChart />
          <div className="token-hero-row cost-hero-row">
            <div>
              <p className="token-hero-label">Team spend</p>
              <p className="token-hero-value" data-testid="team-spend-total">{money(cost.teamSpendUsd)}</p>
              <p className="token-hero-meta">Routed models + classifier</p>
            </div>
            <div>
              <p className="token-hero-label muted">Always Pro</p>
              <p className="token-hero-value muted" data-testid="pro-spend-total">{money(cost.alwaysProUsd)}</p>
              <p className="token-hero-meta">Same answers at Gemini Pro</p>
            </div>
            <div>
              <p className="token-hero-label">Savings</p>
              <p className="token-hero-value" data-testid="cost-savings-total">{money(Math.abs(cost.savedUsd))}</p>
              <p className="token-hero-meta" data-testid="cost-savings-meta">
                {savedLabel}
                {cost.savedPercent !== null ? ` · ${percent(cost.savedPercent)}` : ""}
              </p>
            </div>
          </div>
          <p className="token-secondary-detail" data-testid="token-secondary-detail">
            Tokens (secondary): {tokens(tokensView.answerTokens)} answer
            {tokensView.classifierTokens > 0 ? ` · ${tokens(tokensView.classifierTokens)} classify` : ""}
            {" · "}
            {tokens(tokensView.alwaysProTokens)} Always Pro answer volume
          </p>
        </>
      )}
    </section>
  );
}
