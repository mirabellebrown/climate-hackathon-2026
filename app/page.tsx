"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleAlert, Copy, GitBranch, Leaf, LoaderCircle, Terminal } from "lucide-react";
import { ImpactPanel } from "@/components/impact-panel";
import { Methodology } from "@/components/methodology";
import { SessionPanel } from "@/components/session-panel";
import { number, percent, tokens } from "@/lib/format";
import { recordResults } from "@/lib/session";
import type { Activity, DashboardState, RouteResult } from "@/lib/types";

const POLL_MS = 2_000;
const COMMAND = 'npm run ask -- "Explain why leaves change color in autumn."';
type Connection = "connecting" | "online" | "offline";

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Home() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data: DashboardState = await response.json();
        if (!active) return;
        setState(data);
        setConnection("online");
        // Deduplicated by routing ID, so repeated polls and reloads never double count.
        recordResults(data.activities.flatMap((activity) => activity.result ? [activity.result] : []));
      } catch { if (active) setConnection("offline"); }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const activities = state?.activities ?? [];
  const selected = activities.find((activity) => activity.id === selectedId) ?? activities.find((activity) => activity.status === "completed") ?? activities[0] ?? null;
  const result: RouteResult | null = selected?.result ?? null;
  const running = activities.some((activity) => activity.status === "routed");

  async function copyCommand() {
    try { await navigator.clipboard.writeText(COMMAND); setCopied(true); } catch { setCopied(false); }
  }

  function openMethodology() {
    const details = document.getElementById("methodology") as HTMLDetailsElement | null;
    if (details) { details.open = true; details.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }

  return <>
    <a className="skip-link" href="#activity-title">Skip to recent runs</a>
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Canopy home"><span className="brand-symbol"><Leaf size={25} strokeWidth={1.7} /></span>canopy<span className="brand-period">.</span></Link>
      <nav aria-label="Main navigation"><button onClick={openMethodology}>The methodology <ArrowUpRight size={14} /></button><span className="header-pill"><span />Carbon-aware Claude</span></nav>
    </header>

    <main className="page-shell">
      <section className="hero" aria-labelledby="hero-title">
        <div><p className="eyebrow hero-eyebrow"><span /> LESS IS A LITTLE MORE.</p><h1 id="hero-title">Your Claude. The right model.<br /><em>A lighter footprint.</em></h1><p className="hero-description">Big thinking doesn’t always need the biggest model.<br className="desktop-break" /> Ask through <code>canopy</code>. It picks a fitting Claude, runs it in your own Claude Code, and shows the impact here.</p></div>
        <div className="hero-aside"><div className="mini-branch"><GitBranch size={25} strokeWidth={1.3} /></div><p>One prompt.<br />The model it needs.<br /><span>Your own account.</span></p><span className="edition">CLIMATE HACKATHON / 2026</span></div>
      </section>

      <div className="workspace-grid">
        <div className="conversation-column">
          <section className="prompt-panel" aria-labelledby="setup-title">
            <div className="panel-heading"><h2 id="setup-title"><span className="step-number">01</span> Ask from your terminal.</h2><Terminal size={18} strokeWidth={1.5} /></div>
            <ul className="setup-status" aria-label="Connection status">
              <li className={`status-${connection}`}><span />{connection === "online" ? "Dashboard connected" : connection === "offline" ? "Can’t reach the local server" : "Connecting…"}</li>
              <li className={state ? state.configured ? "status-online" : "status-offline" : "status-connecting"}><span />{state ? state.configured ? "Gemini classifier ready" : "Add GEMINI_API_KEY to .env.local, then restart" : "Checking classifier…"}</li>
            </ul>
            <div className="command-block">
              <code>{COMMAND}</code>
              <button className="copy-button" onClick={copyCommand} aria-label="Copy command">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button>
            </div>
            <p className="setup-note">Run it from this project folder while the app is running. Canopy classifies the prompt, then starts <code>claude -p --model …</code> with your normal Claude Code sign-in. The answer stays in your terminal; only token counts come back here.</p>
          </section>

          <div className="route-strip" aria-label="Routing process"><span><span className="route-step">1</span>Classify the task</span><ArrowRight size={14} /><span><span className="route-step">2</span>Run your Claude Code</span><ArrowRight size={14} /><span><span className="route-step">3</span>See the difference</span></div>

          <section className={`answer-panel ${!activities.length ? "answer-empty" : ""}`} aria-labelledby="activity-title" aria-busy={running}>
            <div className="panel-heading"><h2 id="activity-title"><span className="step-number">02</span> Recent runs.</h2>{running && <span className="running-pill"><LoaderCircle className="spin" size={13} />Running</span>}</div>
            <div className="sr-only" role="status" aria-live="polite">{running ? "A Claude Code run is in progress." : result ? `Latest run used ${result.routing.modelName}.` : ""}</div>
            {activities.length ? <>
              <ol className="activity-list">
                {activities.slice(0, 12).map((activity) => <li key={activity.id}><ActivityRow activity={activity} selected={activity.id === selected?.id} onSelect={() => setSelectedId(activity.id)} /></li>)}
              </ol>
              {selected && <RunDetails activity={selected} />}
            </> : <div className="answer-waiting"><span className="answer-placeholder-icon"><ArrowDown size={20} strokeWidth={1.4} /></span><h3>Your runs will grow here.</h3><p>Ask something through <code>canopy</code> in your terminal.<br />Each run appears here as it finishes.</p></div>}
          </section>
        </div>

        <ImpactPanel result={result} loading={running && !result} />
      </div>

      <SessionPanel disabled={false} />
      <Methodology />
      <footer className="site-footer"><p><Leaf size={14} />Thoughtful AI. A little less impact.</p><p>Estimates, not measurements. <a href="https://arxiv.org/abs/2505.09598" target="_blank" rel="noreferrer">Research</a><span>·</span><a href="https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references" target="_blank" rel="noreferrer">EPA factors</a></p></footer>
    </main>
  </>;
}

function ActivityRow({ activity, selected, onSelect }: { activity: Activity; selected: boolean; onSelect: () => void }) {
  const impact = activity.result?.impact;
  return <button className={`activity-row ${selected ? "activity-selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
    <span className={`tier-badge tier-${activity.routing.tier}`}><span />{activity.routing.tier}</span>
    <strong>{activity.routing.modelName}</strong>
    <span className="activity-meta">
      {activity.status === "routed" ? "Running…" : activity.status === "failed" ? "Not completed" : `${number(impact!.routed.energyWh)} Wh · ${percent(impact!.savings.percent)} ${impact!.savings.energyWh < 0 ? "more" : "less"}`}
    </span>
    <time dateTime={activity.createdAt}>{time(activity.createdAt)}</time>
  </button>;
}

function RunDetails({ activity }: { activity: Activity }) {
  const result = activity.result;
  return <div className="run-details">
    <p className="routing-reason"><GitBranch size={14} />{activity.routing.reason}</p>
    {activity.routing.classifierFallback && <p className="fallback-note">Classified with the fallback Gemini model because the primary classifier was unavailable.</p>}
    {activity.status === "failed" && <div className="error-message" role="alert"><CircleAlert size={22} /><div><h3>This run didn’t finish.</h3><p>{activity.error}</p><small>Classifier usage may still have been spent. This run is not included in session totals.</small></div></div>}
    {activity.status === "routed" && <p className="setup-note">Claude Code is working on this in your terminal.</p>}
    {result && <>
      {result.modelMismatch && <p className="fallback-note">Canopy selected {result.routing.model}, but Claude Code reported {result.usage.models.map((model) => model.model).join(", ")}. The estimate uses the models it actually reported.</p>}
      <div className="comparison-scroll">
        <table className="model-table">
          <caption className="sr-only">Token usage reported by Claude Code for each model</caption>
          <thead><tr><th scope="col">Model</th><th scope="col">Input</th><th scope="col">Cache read</th><th scope="col">Cache write</th><th scope="col">Output</th></tr></thead>
          <tbody>{result.usage.models.map((model) => <tr key={model.model}><th scope="row">{model.model}</th><td>{tokens(model.inputTokens)}</td><td>{tokens(model.cacheReadInputTokens)}</td><td>{tokens(model.cacheCreationInputTokens)}</td><td>{tokens(model.outputTokens)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="answer-meta"><span>{(result.durationMs / 1000).toFixed(1)} s in Claude Code</span><span>{tokens(result.usage.classifier.inputTokens + result.usage.classifier.outputTokens)} classifier tokens</span><span>Answer shown in your terminal only</span></div>
    </>}
  </div>;
}
