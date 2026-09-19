"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleAlert, Copy, GitBranch, Leaf, LoaderCircle, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ImpactPanel } from "@/components/impact-panel";
import { Methodology } from "@/components/methodology";
import { SessionPanel } from "@/components/session-panel";
import { MAX_PROMPT_LENGTH } from "@/lib/config";
import { tokens } from "@/lib/format";
import { recordImpact } from "@/lib/session";
import type { RouteError, RouteResult } from "@/lib/types";

const EXAMPLES = [
  { label: "Explain something", prompt: "Explain why leaves change color in autumn in three simple sentences." },
  { label: "Solve a coding problem", prompt: "Write a TypeScript function that groups an array of objects by a given key. Explain its time complexity and handle missing keys." },
  { label: "Think through a system", prompt: "Design a fault-tolerant architecture for a global carbon accounting platform. Compare consistency, regional failover, and auditability tradeoffs under conflicting data updates." },
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<RouteError["error"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  const canSubmit = prompt.trim().length > 0 && prompt.length <= MAX_PROMPT_LENGTH && !loading;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || inFlight.current) return;
    inFlight.current = true;
    setLoading(true); setError(null); setResult(null); setCopied(false); setCopyError(false);
    try {
      const response = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const data: RouteResult | RouteError = await response.json();
      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : { code: "REQUEST_FAILED", message: "The request could not be completed. Please try again.", stage: "request" });
      } else {
        setResult(data);
        recordImpact(data.impact);
      }
    } catch {
      setError({ code: "NETWORK_ERROR", message: "We couldn’t reach the router. Check your connection and try again.", stage: "request" });
    } finally { setLoading(false); inFlight.current = false; }
  }

  async function copyAnswer() {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.answer); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }

  function openMethodology() {
    const details = document.getElementById("methodology") as HTMLDetailsElement | null;
    if (details) { details.open = true; details.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }

  return <>
    <a className="skip-link" href="#prompt">Skip to prompt</a>
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Canopy home"><span className="brand-symbol"><Leaf size={25} strokeWidth={1.7} /></span>canopy<span className="brand-period">.</span></Link>
      <nav aria-label="Main navigation"><button onClick={openMethodology}>The methodology <ArrowUpRight size={14} /></button><span className="header-pill"><span />Carbon-aware AI</span></nav>
    </header>

    <main className="page-shell">
      <section className="hero" aria-labelledby="hero-title">
        <div><p className="eyebrow hero-eyebrow"><span /> LESS IS A LITTLE MORE.</p><h1 id="hero-title">The right model.<br /><em>A lighter footprint.</em></h1><p className="hero-description">Big thinking doesn’t always need the biggest model.<br className="desktop-break" /> Ask anything. We’ll find a thoughtful fit, then show the impact.</p></div>
        <div className="hero-aside"><div className="mini-branch"><GitBranch size={25} strokeWidth={1.3} /></div><p>One prompt.<br />The model it needs.<br /><span>Nothing extra.</span></p><span className="edition">CLIMATE HACKATHON / 2026</span></div>
      </section>

      <div className="workspace-grid">
        <div className="conversation-column">
          <section className="prompt-panel" aria-labelledby="prompt-title">
            <div className="panel-heading"><h2 id="prompt-title"><span className="step-number">01</span> What’s on your mind?</h2><Sparkles size={18} strokeWidth={1.5} /></div>
            <form onSubmit={submit}>
              <label className="sr-only" htmlFor="prompt">Your prompt</label>
              <textarea id="prompt" ref={textarea} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={loading} maxLength={MAX_PROMPT_LENGTH} placeholder="A quick question, a tricky problem, a spark of an idea…" aria-describedby="prompt-hint" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
              <div className="composer-footer"><span id="prompt-hint">{prompt.length ? `${tokens(prompt.length)} / ${tokens(MAX_PROMPT_LENGTH)}` : "A little curiosity goes a long way."}</span><button className="submit-button" type="submit" disabled={!canSubmit}>{loading ? <><LoaderCircle className="spin" size={16} />Thinking…</> : <>Find my model <ArrowRight size={17} /></>}</button></div>
            </form>
            <div className="examples"><span>Try a prompt</span>{EXAMPLES.map((example) => <button key={example.label} disabled={loading} onClick={() => { setPrompt(example.prompt); textarea.current?.focus(); }}>{example.label}<ArrowUpRight size={12} /></button>)}</div>
          </section>

          <div className="route-strip" aria-label="Routing process"><span><span className="route-step">1</span>Classify the task</span><ArrowRight size={14} /><span><span className="route-step">2</span>Choose a Claude</span><ArrowRight size={14} /><span><span className="route-step">3</span>See the difference</span></div>

          <section className={`answer-panel ${!result ? "answer-empty" : ""}`} aria-labelledby="answer-title" aria-busy={loading}>
            <div className="panel-heading"><h2 id="answer-title"><span className="step-number">02</span> A little clarity.</h2>{result && <button className="copy-button" onClick={copyAnswer} aria-label="Copy answer">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button>}</div>
            <div className="sr-only" role="status" aria-live="polite">{loading ? "Classifying and generating your answer." : result ? `Answer ready. Routed to ${result.routing.modelName}.` : ""}</div>
            {error ? <div className="error-message" role="alert"><CircleAlert size={22} /><div><h3>We hit a small snag.</h3><p>{error.message}</p><small>{error.stage === "generation" ? "Classification completed, but the answer failed. Provider resources may have been used; this attempt is not included in session totals." : "No completed request was added to your session totals."}</small></div></div>
              : loading ? <div className="answer-waiting"><div className="loading-orbit"><Leaf size={22} /></div><h3>A little thought goes into this.</h3><p>Finding the right model and preparing your answer.</p><div className="loading-lines"><span /><span /><span /></div></div>
              : result ? <>
                <div className="routing-result"><span className={`tier-badge tier-${result.routing.tier}`}><span />{result.routing.tier}</span><strong>{result.routing.modelName}</strong></div>
                <p className="routing-reason"><GitBranch size={14} />{result.routing.reason}</p>
                {result.routing.classifierFallback && <p className="fallback-note">Classified with Gemini 3.1 Flash Lite because the primary classifier was unavailable.</p>}
                <div className="answer-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a> }}>{result.answer}</ReactMarkdown></div>
                {result.truncated && <p className="truncation-note" role="status">This answer reached the output limit and may be incomplete. All reported tokens are included in the estimate.</p>}
                <div className="answer-meta"><span>{tokens(result.usage.generation.inputTokens)} input tokens</span><span>{tokens(result.usage.generation.outputTokens)} output tokens</span><span>One generation call</span></div>
                {copyError && <p className="copy-error" role="status">Clipboard access is unavailable. You can select and copy the answer above.</p>}
              </> : <div className="answer-waiting"><span className="answer-placeholder-icon"><ArrowDown size={20} strokeWidth={1.4} /></span><h3>Your answer will grow here.</h3><p>From everyday questions to complex ideas,<br />give your curiosity a place to start.</p></div>}
          </section>
        </div>

        <ImpactPanel result={result} loading={loading} />
      </div>

      <SessionPanel disabled={loading} />
      <Methodology />
      <footer className="site-footer"><p><Leaf size={14} />Thoughtful AI. A little less impact.</p><p>Estimates, not measurements. <a href="https://arxiv.org/abs/2505.09598" target="_blank" rel="noreferrer">Research</a><span>·</span><a href="https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references" target="_blank" rel="noreferrer">EPA factors</a></p></footer>
    </main>
  </>;
}
