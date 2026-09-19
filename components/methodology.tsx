import { ArrowUpRight, BookOpen } from "lucide-react";
import { SOURCES } from "@/lib/factors";

export function Methodology() {
  return <details className="methodology" id="methodology">
    <summary><span><BookOpen size={16} /> A little transparency goes a long way.</span><span>How we estimate <span aria-hidden="true">+</span></span></summary>
    <div className="methodology-content">
      <div><h3>Tokens in. Estimates out.</h3><p>Energy = input tokens × 0.000135 Wh + output tokens × 0.00288 Wh, scaled by model. Sonnet = 1×, Haiku = 0.5×, Opus = 2×, and Flash Lite = 0.25×. Routing includes both classifier and answer tokens.</p><p>The Sonnet factors derive from modeled Claude 3.7 results in Jegham et al. (2025), via claude-carbon. Applying them to today’s models and scaling the other families are assumptions, not direct measurements.</p></div>
      <div><h3>What those numbers mean.</h3><p>CO₂e uses 0.287 g/Wh. Water uses a prototype assumption of 1.8 L/kWh for cooling and electricity generation combined; it is not the current claude-carbon water factor. Gasoline uses 8,887 g CO₂/gallon. Tree equivalents use 60,000 g CO₂/tree-year and a 365-day year.</p><p>Gasoline and tree figures are illustrative equivalents, not fuel consumed, trees planted, or offsets. Energy, carbon, and water savings share the same percentage because their factors are linear.</p></div>
      <div><h3>Useful perspective. Real uncertainty.</h3><p>These are order-of-magnitude inference estimates. Actual hardware, batching, grid mix, location, caching, and answer length vary. Training, hardware manufacturing, your device, and network use are excluded. The counterfactual does not establish equal answer quality.</p><p>Both providers receive your prompt. Only numeric totals are stored locally. No second answer is generated for comparison.</p></div>
    </div>
    <div className="source-links"><a href={SOURCES.paper} target="_blank" rel="noreferrer">Jegham et al., 2025 <ArrowUpRight size={14} /></a><a href={SOURCES.factors} target="_blank" rel="noreferrer">claude-carbon factors <ArrowUpRight size={14} /></a><a href={SOURCES.epa} target="_blank" rel="noreferrer">EPA equivalencies <ArrowUpRight size={14} /></a></div>
  </details>;
}
