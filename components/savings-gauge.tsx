"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { costOverview } from "@/lib/dashboard";
import { money, percent } from "@/lib/format";
import { savingsGaugePercent } from "@/lib/savings-gauge";
import { getServerSessionSnapshot, getSessionSnapshot, subscribeSession } from "@/lib/session";

const R = 36;
const CIRC = 2 * Math.PI * R;

function BoltIcon() {
  return (
    <svg className="savings-gauge-bolt" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.2 2.1 4.8 13.2c-.35.46-.02 1.1.55 1.1h5.1l-1.55 7.4c-.12.58.6.95 1.02.52l9.2-11.1c.35-.46.02-1.1-.55-1.1h-5.2l1.45-7.4c.12-.58-.6-.95-1.02-.52Z"
      />
    </svg>
  );
}

/** Frame_18-style circular savings gauge — bottom-right on chat, links to /dashboard. */
export function SavingsGauge() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const cost = costOverview(session);
  const fillPct = savingsGaugePercent(cost.savedPercent, cost.requests);
  const fillLen = (fillPct / 100) * CIRC;
  const empty = cost.requests === 0;
  const caption = empty
    ? "vs Always Pro"
    : cost.savedUsd >= 0
      ? `${percent(fillPct)} · ${money(cost.savedUsd)}`
      : `${percent(Math.abs(cost.savedPercent ?? 0))} extra`;

  return (
    <Link
      href="/dashboard"
      className="savings-gauge"
      data-testid="savings-gauge"
      aria-label={
        empty
          ? "GreenRoute savings — open impact dashboard"
          : `GreenRoute savings ${percent(fillPct)} versus Always Pro — open impact dashboard`
      }
    >
      <span className="savings-gauge-dial">
        <svg className="savings-gauge-svg" viewBox="0 0 100 100" role="img" aria-hidden="true">
          {/* Full ring track — faint translucent green (Frame_18) */}
          <circle className="savings-gauge-track" cx="50" cy="50" r={R} fill="none" strokeWidth="12" />
          {/* Fill starts at bottom (6 o'clock), sweeps clockwise */}
          <circle
            className="savings-gauge-fill"
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="12"
            strokeLinecap="butt"
            strokeDasharray={`${fillLen} ${CIRC - fillLen}`}
            transform="rotate(90 50 50)"
            data-testid="savings-gauge-fill"
            data-fill={String(Math.round(fillPct))}
          />
        </svg>
        <span className="savings-gauge-center">
          <BoltIcon />
        </span>
      </span>
      <span className="savings-gauge-label">Savings</span>
      <span className="savings-gauge-caption" data-testid="savings-gauge-caption">{caption}</span>
    </Link>
  );
}
