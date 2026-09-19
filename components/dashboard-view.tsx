"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BudgetTracking } from "@/components/budget-tracking";
import { EnvironmentalImpact } from "@/components/environmental-impact";
import { LifetimeHero, LifetimeStats } from "@/components/lifetime-hero";
import { Methodology } from "@/components/methodology";
import { SessionPanel } from "@/components/session-panel";
import { SiteFooter } from "@/components/site-footer";
import { TeamYearSimulator } from "@/components/team-year-simulator";
import { TokenUsageOverview } from "@/components/token-usage-overview";
import { TopUseCases } from "@/components/top-use-cases";

export function DashboardView() {
  return (
    <main className="dashboard-page">
      <div className="dashboard-shell">
        <div className="dashboard-top">
          <Link className="back-to-chat" href="/"><ArrowLeft size={16} />Back to team chat</Link>
          <p className="dashboard-kicker">Usage dashboard · manager view</p>
        </div>
        <LifetimeHero />
        <TokenUsageOverview />
        <LifetimeStats />
        <TeamYearSimulator />
        <BudgetTracking />
        <TopUseCases />
        <EnvironmentalImpact />
        <section className="dashboard-details" aria-labelledby="details-title">
          <div className="dashboard-details-head">
            <h2 id="details-title">Session log & methodology</h2>
            <p>Prompt-level token log for this browser’s team prototype, plus how estimates are built.</p>
          </div>
          <SessionPanel disabled={false} />
          <Methodology />
          <SiteFooter />
        </section>
      </div>
    </main>
  );
}
