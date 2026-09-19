import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Droplets, Flame, Info, Leaf, Trees, Zap } from "lucide-react";
import { money, number, percent, tokens } from "@/lib/format";
import type { RouteResult } from "@/lib/types";

function pair(usage: { inputTokens: number; outputTokens: number }) {
  return `${tokens(usage.inputTokens)} / ${tokens(usage.outputTokens)}`;
}

export function ImpactPanel({ result, loading }: { result: RouteResult | null; loading: boolean }) {
  const impact = result?.impact;
  const extraCost = (impact?.cost.savings ?? 0) < 0;
  const extraEnergy = (impact?.savings.energyWh ?? 0) < 0;
  const extra = extraCost;
  const maxUsd = impact ? Math.max(impact.cost.routed, impact.cost.baseline) : 1;
  const maxWh = impact ? Math.max(impact.routed.energyWh, impact.baseline.energyWh) : 1;
  const width = (value: number, max: number) => `${max === 0 ? 0 : value / max * 100}%`;
  const rows = impact ? [
    { icon: CircleDollarSign, name: "API cost", unit: "USD", a: impact.cost.routed, b: impact.cost.baseline, format: money },
    { icon: Zap, name: "Energy", unit: "Wh", a: impact.routed.energyWh, b: impact.baseline.energyWh, format: number },
    { icon: Leaf, name: "Emissions", unit: "g CO₂e", a: impact.routed.co2eGrams, b: impact.baseline.co2eGrams, format: number },
    { icon: Droplets, name: "Water", unit: "mL", a: impact.routed.waterLiters * 1000, b: impact.baseline.waterLiters * 1000, format: number },
    { icon: Flame, name: "Gasoline equivalent", unit: "gal", a: impact.routed.gasolineGallons, b: impact.baseline.gasolineGallons, format: number },
    { icon: Trees, name: "Tree uptake equivalent", unit: "tree-min", a: impact.routed.treeMinutes, b: impact.baseline.treeMinutes, format: number },
  ] : [];
  return <section className={`impact-panel ${extra ? "extra-impact" : ""}`} aria-labelledby="impact-title" aria-busy={loading}>
    <div className="panel-heading"><span className="eyebrow">A lighter way to think</span><span className="estimate-tag">ESTIMATE</span></div>
    <h2 id="impact-title">Your impact, in perspective.</h2>
    {impact ? <>
      <div className="savings-heading">
        {extraCost ? <ArrowUpRight size={35} strokeWidth={1.5} /> : <ArrowDownRight size={35} strokeWidth={1.5} />}
        <strong data-testid="cost-savings-percent">{percent(impact.cost.percent)}</strong>
      </div>
      <p className="savings-description">{impact.cost.percent === null ? "No percentage available for a zero-cost baseline." : `${extraCost ? "more expensive" : "cheaper"} than always using Gemini Pro`}</p>
      <div className="energy-chart cost-chart" aria-label="Estimated API cost comparison">
        <div className="chart-label"><span><i className="legend-dot routed-dot" />This request</span><strong data-testid="routed-cost">{money(impact.cost.routed)}</strong></div>
        <div className="bar-track"><div className="bar routed-bar" style={{ width: width(impact.cost.routed, maxUsd) }} /></div>
        <div className="chart-label"><span><i className="legend-dot baseline-dot" />Gemini Pro default</span><strong data-testid="baseline-cost">{money(impact.cost.baseline)}</strong></div>
        <div className="bar-track"><div className="bar baseline-bar" style={{ width: width(impact.cost.baseline, maxUsd) }} /></div>
      </div>
      <p className="cost-aside">Same answer tokens, different prices. Flash Lite is the inexpensive model here; Pro is the expensive default — like Haiku versus Opus.</p>
      <div className="energy-chart" aria-label="Estimated energy comparison">
        <div className="chart-label"><span><i className="legend-dot routed-dot" />This request</span><strong>{number(impact.routed.energyWh)} Wh</strong></div>
        <div className="bar-track"><div className="bar routed-bar" style={{ width: width(impact.routed.energyWh, maxWh) }} /></div>
        <div className="chart-label"><span><i className="legend-dot baseline-dot" />Gemini Pro default</span><strong>{number(impact.baseline.energyWh)} Wh</strong></div>
        <div className="bar-track"><div className="bar baseline-bar" style={{ width: width(impact.baseline.energyWh, maxWh) }} /></div>
      </div>
      <p className="savings-energy"><span data-testid="savings-percent">{percent(impact.savings.percent)}</span> {impact.savings.percent === null ? "No energy percentage for a zero baseline." : `${extraEnergy ? "more" : "less"} estimated energy than always using Gemini Pro`}</p>
      <div className="comparison-scroll">
        <table className="comparison-table">
          <caption className="sr-only">Chosen-model tokens versus estimated Gemini Pro tokens, then API cost and environmental impact from those counts</caption>
          <thead><tr><th scope="col">This prompt</th><th scope="col">{result!.routing.modelName}</th><th scope="col">If Gemini Pro</th></tr></thead>
          <tbody>
            <tr><th scope="row">Answer tokens <small>input / output</small></th><td data-testid="chosen-tokens">{pair(result!.usage.generation)}</td><td data-testid="baseline-tokens">{pair(result!.usage.baseline)}</td></tr>
            <tr><th scope="row">Classifier tokens <small>input / output</small></th><td data-testid="classifier-tokens">{pair(result!.usage.classifier)}</td><td>0 / 0</td></tr>
            {rows.map(({ icon: Icon, name, unit, a, b, format }) => <tr key={name}><th scope="row"><span className="metric-name"><Icon size={14} />{name}</span></th><td>{format(a)} <small>{unit}</small></td><td>{format(b)} <small>{unit}</small></td></tr>)}
            <tr><th scope="row">Tree-year fraction</th><td>{number(impact.routed.treeYears)}</td><td>{number(impact.baseline.treeYears)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="overhead"><Zap size={14} /><span>USD uses published Gemini paid-tier rates. Energy, carbon, and water come from Code Carbon’s EcoLogits API when available{impact.environmentalSource === "fallback" ? " — EcoLogits was unreachable, so a published fallback is shown" : ""}. Gasoline and trees are EPA CO₂ equivalencies. This request includes {money(impact.cost.classifier)} and {number(impact.classifier.energyWh)} Wh to classify. Gemini Pro is the same answer tokens at Pro rates, with no classifier.</span></p>
      {extra && <p className="extra-note">{result?.routing.tier === "heavy" ? "This task needed Gemini Pro, so classification adds a little extra cost." : "For this request, classifier overhead outweighed the smaller model’s savings."} That extra cost is included.</p>}
    </> : <div className="empty-impact">
      <div className="contour-art" aria-hidden="true">
        <span /><span /><span /><span /><span /><span />
        <div className="contour-leaf"><Leaf size={38} strokeWidth={1.2} /></div>
      </div>
      <h3>{loading ? "Finding a thoughtful fit." : "Small choices. Smaller footprints."}</h3>
      <p>{loading ? "Your prompt is being classified and answered. The comparison will appear when it’s ready." : "Send a prompt to see how its estimated cost and footprint compare with using Gemini Pro every time."}</p>
      <div className="empty-units"><span><CircleDollarSign size={14} />Cost</span><span><Zap size={14} />Energy</span><span><Leaf size={14} />Carbon</span></div>
    </div>}
    <div className="baseline-note"><Info size={16} /><p><strong>Same prompt, two token bills.</strong> We record the chosen model’s real tokens. Gemini Pro is estimated with those same answer tokens — we do not send the prompt to Pro a second time — then convert both bills into dollars, energy, carbon, water, fuel, and trees.</p></div>
  </section>;
}
