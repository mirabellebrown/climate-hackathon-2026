import { ArrowDownRight, ArrowUpRight, Droplets, Flame, Info, Leaf, Trees, Zap } from "lucide-react";
import { number, percent, tokens } from "@/lib/format";
import type { RouteResult } from "@/lib/types";

export function ImpactPanel({ result, loading }: { result: RouteResult | null; loading: boolean }) {
  const impact = result?.impact;
  const extra = (impact?.savings.energyWh ?? 0) < 0;
  const maxWh = impact ? Math.max(impact.routed.energyWh, impact.baseline.energyWh) : 1;
  const width = (value: number) => `${maxWh === 0 ? 0 : value / maxWh * 100}%`;
  const rows = impact ? [
    { icon: Zap, name: "Energy", unit: "Wh", a: impact.routed.energyWh, b: impact.baseline.energyWh },
    { icon: Leaf, name: "Emissions", unit: "g CO₂e", a: impact.routed.co2eGrams, b: impact.baseline.co2eGrams },
    { icon: Droplets, name: "Water", unit: "mL", a: impact.routed.waterLiters * 1000, b: impact.baseline.waterLiters * 1000 },
    { icon: Flame, name: "Gasoline equivalent", unit: "gal", a: impact.routed.gasolineGallons, b: impact.baseline.gasolineGallons },
    { icon: Trees, name: "Tree uptake equivalent", unit: "tree-min", a: impact.routed.treeMinutes, b: impact.baseline.treeMinutes },
  ] : [];
  return <section className={`impact-panel ${extra ? "extra-impact" : ""}`} aria-labelledby="impact-title" aria-busy={loading}>
    <div className="panel-heading"><span className="eyebrow">A lighter way to think</span><span className="estimate-tag">ESTIMATE</span></div>
    <h2 id="impact-title">Your impact, in perspective.</h2>
    {impact ? <>
      <div className="savings-heading">
        {extra ? <ArrowUpRight size={35} strokeWidth={1.5} /> : <ArrowDownRight size={35} strokeWidth={1.5} />}
        <strong data-testid="savings-percent">{percent(impact.savings.percent)}</strong>
      </div>
      <p className="savings-description">{impact.savings.percent === null ? "No percentage available for a zero baseline." : `${extra ? "more" : "less"} estimated impact than always using Opus`}</p>
      <div className="energy-chart" aria-label="Estimated energy comparison">
        <div className="chart-label"><span><i className="legend-dot routed-dot" />This run</span><strong>{number(impact.routed.energyWh)} Wh</strong></div>
        <div className="bar-track"><div className="bar routed-bar" style={{ width: width(impact.routed.energyWh) }} /></div>
        <div className="chart-label"><span><i className="legend-dot baseline-dot" />Opus default</span><strong>{number(impact.baseline.energyWh)} Wh</strong></div>
        <div className="bar-track"><div className="bar baseline-bar" style={{ width: width(impact.baseline.energyWh) }} /></div>
      </div>
      <div className="comparison-scroll">
        <table className="comparison-table">
          <caption className="sr-only">This run including classification compared with estimated Claude Opus impact</caption>
          <thead><tr><th scope="col">Estimated footprint</th><th scope="col">This run</th><th scope="col">Opus default</th></tr></thead>
          <tbody>
            <tr><th scope="row">Tokens <small>input incl. cache / output</small></th><td>{tokens(result!.usage.total.inputTokens)} / {tokens(result!.usage.total.outputTokens)}</td><td>{tokens(result!.usage.generation.inputTokens)} / {tokens(result!.usage.generation.outputTokens)}</td></tr>
            {rows.map(({ icon: Icon, name, unit, a, b }) => <tr key={name}><th scope="row"><span className="metric-name"><Icon size={14} />{name}</span></th><td>{number(a)} <small>{unit}</small></td><td>{number(b)} <small>{unit}</small></td></tr>)}
            <tr><th scope="row">Tree-year fraction</th><td>{number(impact.routed.treeYears)}</td><td>{number(impact.baseline.treeYears)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="overhead"><Zap size={14} /><span>Includes {number(impact.classifier.energyWh)} Wh for classification + {number(impact.generation.energyWh)} Wh for Claude Code’s work, which can span several model calls. Cached input is counted at the full input rate.</span></p>
      {extra && <p className="extra-note">{result?.routing.tier === "heavy" ? "This task needed Opus, so classification adds a little extra impact." : "For this request, classifier overhead outweighed the smaller model’s savings."} That extra cost is included.</p>}
    </> : <div className="empty-impact">
      <div className="contour-art" aria-hidden="true">
        <span /><span /><span /><span /><span /><span />
        <div className="contour-leaf"><Leaf size={38} strokeWidth={1.2} /></div>
      </div>
      <h3>{loading ? "Finding a thoughtful fit." : "Small choices. Smaller footprints."}</h3>
      <p>{loading ? "Claude Code is working on it in the background. The comparison appears with the answer." : "Send a message to see how its estimated footprint compares with using our largest model every time."}</p>
      <div className="empty-units"><span><Zap size={14} />Energy</span><span><Leaf size={14} />Carbon</span><span><Droplets size={14} />Water</span></div>
    </div>}
    <div className="baseline-note"><Info size={16} /><p><strong>A comparison without a second call.</strong> Opus is estimated from the same Claude Code token counts, assuming similar-length work. The baseline has no classifier cost.</p></div>
  </section>;
}
