"use client";

import { useSyncExternalStore } from "react";
import { CircleDollarSign, Droplets, Leaf } from "lucide-react";
import { money, number } from "@/lib/format";
import { getServerSessionSnapshot, getSessionSnapshot, lifetimeSavings, subscribeSession } from "@/lib/session";

function waterLabel(liters: number): { value: string; unit: string } {
  const abs = Math.abs(liters);
  if (abs < 0.001) return { value: number(abs * 1_000_000), unit: "µL" };
  if (abs < 1) return { value: number(abs * 1000), unit: "mL" };
  return { value: number(abs), unit: "L" };
}

/** Page title + lead for the manager dashboard (sits above the cost chart). */
export function LifetimeHero() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const life = lifetimeSavings(session);
  const empty = life.requests === 0;

  return (
    <header className="lifetime-hero" aria-labelledby="lifetime-title" data-testid="lifetime-hero">
      <p className="eyebrow">Team lifetime savings</p>
      <h1 id="lifetime-title">What your team has saved.</h1>
      <p className="lifetime-lead">
        {empty
          ? "Team chats on the home page feed this manager view. Savings compare every completed request with always using Gemini Pro (like always Opus)."
          : `${life.requests} team ${life.requests === 1 ? "request" : "requests"} · vs always Gemini Pro`}
      </p>
    </header>
  );
}

/** Money / CO₂ / Water — placed under the cost chart. */
export function LifetimeStats() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const life = lifetimeSavings(session);
  const water = waterLabel(life.waterLiters);
  const empty = life.requests === 0;

  return (
    <section className="lifetime-stats dash-section" aria-labelledby="lifetime-stats-title" data-testid="lifetime-stats">
      <div className="dash-section-head">
        <p className="eyebrow">Lifetime</p>
        <h2 id="lifetime-stats-title">Money, CO₂, and water</h2>
        <p>Lifetime totals vs always Gemini Pro — the same counterfactual as the spend chart above.</p>
      </div>
      <div className="lifetime-grid">
        <article className="lifetime-stat" data-testid="lifetime-money">
          <span className="lifetime-icon" aria-hidden="true"><CircleDollarSign size={22} strokeWidth={1.6} /></span>
          <p className="lifetime-label">Money</p>
          <p className="lifetime-value">{empty ? "—" : money(Math.abs(life.usd))}</p>
          <p className="lifetime-meta">{empty ? "API cost saved" : life.extraUsd ? "extra API cost" : "API cost saved"}</p>
        </article>
        <article className="lifetime-stat" data-testid="lifetime-co2">
          <span className="lifetime-icon" aria-hidden="true"><Leaf size={22} strokeWidth={1.6} /></span>
          <p className="lifetime-label">CO₂</p>
          <p className="lifetime-value">{empty ? "—" : <>{number(Math.abs(life.co2eGrams))}<small> g</small></>}</p>
          <p className="lifetime-meta">{empty ? "CO₂e saved" : life.extraCo2 ? "extra CO₂e" : "CO₂e saved"}</p>
        </article>
        <article className="lifetime-stat" data-testid="lifetime-water">
          <span className="lifetime-icon" aria-hidden="true"><Droplets size={22} strokeWidth={1.6} /></span>
          <p className="lifetime-label">Water</p>
          <p className="lifetime-value">{empty ? "—" : <>{water.value}<small> {water.unit}</small></>}</p>
          <p className="lifetime-meta">{empty ? "Water saved" : life.extraWater ? "extra water" : "water saved"}</p>
        </article>
      </div>
    </section>
  );
}
