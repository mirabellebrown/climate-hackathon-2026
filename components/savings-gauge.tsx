"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { percent } from "@/lib/format";
import { gaugePercent, savingsOverview } from "@/lib/savings";
import { getServerSessionSnapshot, getSessionSnapshot, subscribeSession } from "@/lib/session";

const R = 36;
const CIRC = 2 * Math.PI * R;

function BoltIcon() {
  return <svg className="savings-gauge-bolt" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M13.2 2.1 4.8 13.2c-.35.46-.02 1.1.55 1.1h5.1l-1.55 7.4c-.12.58.6.95 1.02.52l9.2-11.1c.35-.46.02-1.1-.55-1.1h-5.2l1.45-7.4c.12-.58-.6-.95-1.02-.52Z" />
  </svg>;
}

/** Circular session savings gauge (GreenRoute design), in-flow under the composer. */
export function SavingsGauge() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const s = savingsOverview(session);
  const fill = gaugePercent(s.savedPercent, s.requests);
  const empty = s.requests === 0;
  const extra = s.savedWh < 0;
  const answers = `${s.requests} ${s.requests === 1 ? "answer" : "answers"}`;
  const caption = empty ? "vs always Opus" : extra ? `${percent(Math.abs(s.savedPercent ?? 0))} extra · ${answers}` : `${percent(fill)} less · ${answers}`;
  return <Link href="/reports/esg" className="savings-gauge" data-testid="savings-gauge"
    aria-label={empty ? "Energy savings versus always using Opus. Open the impact report." : `${caption} energy versus always using Opus. Open the impact report.`}>
    <span className="savings-gauge-dial">
      <svg className="savings-gauge-svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="savings-gauge-track" cx="50" cy="50" r={R} fill="none" strokeWidth="12" />
        <circle className="savings-gauge-fill" cx="50" cy="50" r={R} fill="none" strokeWidth="12" strokeLinecap="butt"
          strokeDasharray={`${fill / 100 * CIRC} ${CIRC - fill / 100 * CIRC}`} transform="rotate(90 50 50)" data-testid="savings-gauge-fill" data-fill={String(Math.round(fill))} />
      </svg>
      <span className="savings-gauge-center"><BoltIcon /></span>
    </span>
    <span className="savings-gauge-label">Savings</span>
    <span className="savings-gauge-caption" data-testid="savings-gauge-caption">{caption}</span>
  </Link>;
}
