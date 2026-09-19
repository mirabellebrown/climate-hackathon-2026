"use client";

import { useState, useSyncExternalStore } from "react";
import { money, number, percent } from "@/lib/format";
import {
  DEFAULT_REQUESTS_PER_PERSON_PER_DAY,
  DEFAULT_TEAM_SIZE,
  TEAM_YEAR_DAYS,
  teamYearProjection,
} from "@/lib/team-year-sim";
import { getServerSessionSnapshot, getSessionSnapshot, subscribeSession } from "@/lib/session";

export function TeamYearSimulator() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const [teamSize, setTeamSize] = useState(DEFAULT_TEAM_SIZE);
  const [perDay, setPerDay] = useState(DEFAULT_REQUESTS_PER_PERSON_PER_DAY);
  const projection = teamYearProjection(session, {
    teamSize,
    requestsPerPersonPerDay: perDay,
    days: TEAM_YEAR_DAYS,
  });
  const source = projection.averages.fromSession
    ? `Averaged from ${projection.averages.sampleRequests} session ${projection.averages.sampleRequests === 1 ? "request" : "requests"} in this browser`
    : "Using a demo Flash Lite turn (1k/1k tokens + classifier) until the team chats";

  return (
    <section className="dash-section team-year-sim" aria-labelledby="team-year-title" data-testid="team-year-simulator">
      <div className="dash-section-head">
        <p className="eyebrow">Simulation</p>
        <h2 id="team-year-title">Team-year cost projection</h2>
        <p>
          What a team of ~{DEFAULT_TEAM_SIZE} might spend in a year if every request looked like this session’s
          average (GreenRoute routed + classifier vs Always Gemini Pro). This is a <strong>projection</strong>, not measured org billing.
        </p>
      </div>

      <div className="sim-controls">
        <label className="sim-field">
          <span className="sim-field-label">Team size</span>
          <input
            type="number"
            min={1}
            max={10000}
            step={1}
            value={teamSize}
            onChange={(event) => setTeamSize(Number(event.target.value) || 1)}
            data-testid="sim-team-size"
          />
        </label>
        <label className="sim-field sim-field-wide">
          <span className="sim-field-label">
            Requests / person / day <strong data-testid="sim-per-day-value">{perDay}</strong>
          </span>
          <input
            type="range"
            min={1}
            max={40}
            step={1}
            value={perDay}
            onChange={(event) => setPerDay(Number(event.target.value))}
            data-testid="sim-per-day"
          />
        </label>
      </div>

      <p className="sim-source" data-testid="sim-source">{source} · {TEAM_YEAR_DAYS} days · {number(projection.annualRequests)} annual requests</p>

      <div className="sim-results">
        <article>
          <p className="lifetime-label">GreenRoute (projected)</p>
          <p className="sim-figure" data-testid="sim-routed">{money(projection.routedUsd)}</p>
          <p className="token-hero-meta">Annual team API spend</p>
        </article>
        <article>
          <p className="lifetime-label">Always Pro (projected)</p>
          <p className="sim-figure muted" data-testid="sim-pro">{money(projection.alwaysProUsd)}</p>
          <p className="token-hero-meta">Same volume at Pro rates</p>
        </article>
        <article>
          <p className="lifetime-label">Annual savings</p>
          <p className="sim-figure" data-testid="sim-saved">{money(Math.abs(projection.savedUsd))}</p>
          <p className="token-hero-meta" data-testid="sim-saved-meta">
            {projection.savedUsd >= 0 ? "saved vs Always Pro" : "extra vs Always Pro"}
            {projection.savedPercent !== null ? ` · ${percent(projection.savedPercent)}` : ""}
          </p>
        </article>
      </div>

      <div className="sim-env" data-testid="sim-env">
        <span>Projected footprint savings: {number(Math.abs(projection.co2eGramsSaved))} g CO₂e</span>
        <span aria-hidden="true">·</span>
        <span>{number(Math.abs(projection.waterLitersSaved) * 1000)} mL water</span>
      </div>
    </section>
  );
}
