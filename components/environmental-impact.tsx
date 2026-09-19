"use client";

import { useSyncExternalStore } from "react";
import { Droplets, Leaf, Zap } from "lucide-react";
import { environmentalTotals } from "@/lib/dashboard";
import { number } from "@/lib/format";
import { getServerSessionSnapshot, getSessionSnapshot, subscribeSession } from "@/lib/session";

function waterDisplay(liters: number) {
  const abs = Math.abs(liters);
  if (abs < 0.001) return { value: number(abs * 1_000_000), unit: "µL" };
  if (abs < 1) return { value: number(abs * 1000), unit: "mL" };
  return { value: number(abs), unit: "L" };
}

export function EnvironmentalImpact() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const env = environmentalTotals(session);
  const empty = env.requests === 0;
  const water = waterDisplay(env.routed.waterLiters);
  const waterSaved = waterDisplay(env.saved.waterLiters);

  return (
    <section className="dash-section env-section" aria-labelledby="env-title" data-testid="environmental-impact">
      <div className="dash-section-head">
        <p className="eyebrow">Environment</p>
        <h2 id="env-title">Environmental impact</h2>
        <p>
          Absolute footprint for the team’s routed usage. Savings vs Always Pro are callouts — Money, CO₂, and water above stay focused on lifetime totals.
        </p>
      </div>
      {empty ? (
        <p className="dash-empty">Environmental totals appear with the first completed team request.</p>
      ) : (
        <div className="env-grid">
          <article className="env-card" data-testid="env-carbon">
            <span className="lifetime-icon"><Leaf size={20} strokeWidth={1.6} /></span>
            <p className="lifetime-label">Carbon</p>
            <p className="env-value">{number(env.routed.co2eGrams)}<small> g CO₂e</small></p>
            <p className="lifetime-meta">
              {env.saved.co2eGrams >= 0
                ? `${number(env.saved.co2eGrams)} g saved vs Always Pro`
                : `${number(Math.abs(env.saved.co2eGrams))} g extra vs Always Pro`}
            </p>
          </article>
          <article className="env-card" data-testid="env-energy">
            <span className="lifetime-icon"><Zap size={20} strokeWidth={1.6} /></span>
            <p className="lifetime-label">Energy</p>
            <p className="env-value">{number(env.routed.energyWh)}<small> Wh</small></p>
            <p className="lifetime-meta">
              {env.saved.energyWh >= 0
                ? `${number(env.saved.energyWh)} Wh saved vs Always Pro`
                : `${number(Math.abs(env.saved.energyWh))} Wh extra vs Always Pro`}
            </p>
          </article>
          <article className="env-card" data-testid="env-water">
            <span className="lifetime-icon"><Droplets size={20} strokeWidth={1.6} /></span>
            <p className="lifetime-label">Water</p>
            <p className="env-value">{water.value}<small> {water.unit}</small></p>
            <p className="lifetime-meta">
              {env.saved.waterLiters >= 0
                ? `${waterSaved.value} ${waterSaved.unit} saved vs Always Pro`
                : `${waterSaved.value} ${waterSaved.unit} extra vs Always Pro`}
            </p>
          </article>
        </div>
      )}
    </section>
  );
}
