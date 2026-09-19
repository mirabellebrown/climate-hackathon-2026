"use client";

import { useSyncExternalStore } from "react";
import { ArrowDownRight, RotateCcw, Sprout } from "lucide-react";
import { getServerSessionSnapshot, getSessionSnapshot, resetSession, subscribeSession } from "@/lib/session";
import { footprintFromEnergy } from "@/lib/impact";
import { number, percent } from "@/lib/format";

export function SessionPanel({ disabled }: { disabled: boolean }) {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const savings = footprintFromEnergy(session.baselineWh - session.routedWh);
  const savedPercent = session.baselineWh ? savings.energyWh / session.baselineWh * 100 : null;
  const extra = savings.energyWh < 0;
  return <section className="session-panel" aria-labelledby="session-title">
    <div className="session-intro"><span className="session-icon"><Sprout size={22} /></span><div><h2 id="session-title">Little by little, it adds up.</h2><p>Your browser session · {session.requests} completed {session.requests === 1 ? "run" : "runs"}</p></div></div>
    <div className="session-stat"><strong data-testid="session-carbon">{session.requests ? number(Math.abs(savings.co2eGrams)) : "—"}<small> g CO₂e</small></strong><span>{extra ? "extra emissions" : "estimated emissions saved"}</span></div>
    <div className="session-stat"><strong>{session.requests ? number(Math.abs(savings.waterLiters) * 1000) : "—"}<small> mL</small></strong><span>{extra ? "extra water use" : "estimated water saved"}</span></div>
    <div className="session-stat"><strong>{percent(savedPercent)}</strong><span>{extra ? "more" : "less"} impact overall</span></div>
    <button className="reset-button" onClick={resetSession} disabled={disabled || !session.requests} aria-label="Reset session totals" title="Reset session totals"><RotateCcw size={17} /></button>
    <p className="session-note"><ArrowDownRight size={13} />{session.persistent ? "Totals stay in this browser until you reset them. Prompts and answers are never saved here." : "Browser storage is unavailable. Totals will last only while this page stays open."} Completed runs only; failed or cancelled runs may still use provider resources.</p>
  </section>;
}
