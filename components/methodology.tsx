"use client";

import { useEffect } from "react";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { SOURCES } from "@/lib/factors";

export function Methodology() {
  useEffect(() => {
    function openFromHash() {
      if (window.location.hash !== "#methodology") return;
      const details = document.getElementById("methodology") as HTMLDetailsElement | null;
      if (details) {
        details.open = true;
        details.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);
  return <details className="methodology" id="methodology">
    <summary><span><BookOpen size={16} /> A little transparency goes a long way.</span><span>How we estimate <span aria-hidden="true">+</span></span></summary>
    <div className="methodology-content">
      <div><h3>Tokens in. Cost and estimates out.</h3><p>API cost uses Google’s paid Gemini rates: Flash Lite $0.30 / $2.50, Flash $0.75 / $3.75, Pro $2.00 / $12.00 per million input / output tokens (prompts ≤ 200k). The classifier is billed as Flash Lite. When answer tokens match, the price gap is the main difference — the same idea as Haiku versus Opus.</p><p>Energy, CO₂e, and water come from Code Carbon’s EcoLogits HTTP API for the Gemini models we actually call. EcoLogits estimates from output tokens and optional latency, with a world-average electricity mix. If that API is unreachable, we fall back to Jegham et al. (2025) energy factors via claude-carbon, scaled for Flash Lite / Flash / Pro.</p></div>
      <div><h3>What those numbers mean.</h3><p>Gasoline uses 8,887 g CO₂/gallon. Tree equivalents use 60,000 g CO₂/tree-year and a 365-day year, both from EPA greenhouse-gas equivalencies. Those two figures are illustrative CO₂-mass equivalents, not fuel consumed, trees planted, or offsets. Fallback carbon uses 0.287 g/Wh and water 1.8 L/kWh; live EcoLogits values replace those when the API succeeds.</p><p>Cost savings and energy savings can differ because prices and environmental intensity are not the same ratio across models. The large number on the impact panel is the cost comparison.</p></div>
      <div><h3>Useful perspective. Real uncertainty.</h3><p>These are order-of-magnitude inference estimates. Actual hardware, batching, grid mix, location, caching, and answer length vary. Training, hardware manufacturing, your device, and network use are excluded. The counterfactual does not establish equal answer quality.</p><p>Gemini receives your prompt twice on a routed request: once to classify, once to answer. This browser keeps the chat thread, prompt text, and token counts. Resetting session totals also clears the conversation. No second Pro answer is generated for comparison; Pro uses the same measured answer tokens at Pro prices and EcoLogits Pro factors.</p></div>
    </div>
    <div className="source-links"><a href={SOURCES.codecarbon} target="_blank" rel="noreferrer">Code Carbon <ArrowUpRight size={14} /></a><a href={SOURCES.ecologits} target="_blank" rel="noreferrer">EcoLogits <ArrowUpRight size={14} /></a><a href={SOURCES.pricing} target="_blank" rel="noreferrer">Gemini API pricing <ArrowUpRight size={14} /></a><a href={SOURCES.epa} target="_blank" rel="noreferrer">EPA equivalencies <ArrowUpRight size={14} /></a></div>
  </details>;
}
