"use client";

import { Leaf, LoaderCircle } from "lucide-react";
import { money, percent, tokens } from "@/lib/format";
import type { RouteResult } from "@/lib/types";

export function EfficiencyStrip({ result, loading }: { result: RouteResult | null; loading: boolean }) {
  if (loading) {
    return <div id="efficiency-strip" className="efficiency-strip" data-testid="efficiency-strip" aria-live="polite">
      <LoaderCircle className="spin" size={14} />
      <span>Choosing a lighter Gemini…</span>
    </div>;
  }
  if (!result) {
    return <div id="efficiency-strip" className="efficiency-strip" data-testid="efficiency-strip">
      <Leaf size={14} />
      <span>Flash Lite by default · compared with always using Pro after you send</span>
    </div>;
  }
  const extraCost = result.impact.cost.savings < 0;
  const extraEnergy = result.impact.savings.energyWh < 0;
  return <div id="efficiency-strip" className="efficiency-strip" data-testid="efficiency-strip" aria-label="This turn’s efficiency">
    <span className={`tier-badge tier-${result.routing.tier}`}><span />{result.routing.modelName}</span>
    <span>{result.impact.cost.percent === null ? "No cost comparison" : `${percent(result.impact.cost.percent)} ${extraCost ? "more expensive" : "cheaper"} than Pro`}</span>
    <span>{result.impact.savings.percent === null ? "No energy comparison" : `${extraEnergy ? "more" : "less"} energy`}</span>
    <span data-testid="efficiency-cost">{money(result.impact.cost.routed)}</span>
    <span>{tokens(result.usage.generation.inputTokens + result.usage.generation.outputTokens)} tokens</span>
  </div>;
}
