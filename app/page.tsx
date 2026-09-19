"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, CircleAlert, Copy, GitBranch, Leaf, LoaderCircle, Plus, RotateCcw, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ImpactPanel } from "@/components/impact-panel";
import { Methodology } from "@/components/methodology";
import { SessionPanel } from "@/components/session-panel";
import { MAX_PROMPT_LENGTH } from "@/lib/config";
import { number, percent, tokens } from "@/lib/format";
import { recordResults } from "@/lib/session";
import type { ChatReply, DashboardState, RouteError, RouteResult } from "@/lib/types";

const POLL_MS = 5_000;
const EXAMPLES = [
  { label: "Explain something", prompt: "Explain why leaves change color in autumn in three simple sentences." },
  { label: "Solve a coding problem", prompt: "Write a TypeScript function that groups an array of objects by a given key. Explain its time complexity and handle missing keys." },
  { label: "Think through a system", prompt: "Design a fault-tolerant architecture for a global carbon accounting platform. Compare consistency, regional failover, and auditability tradeoffs under conflicting data updates." },
];

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; result: RouteResult }
  | { id: string; role: "error"; error: RouteError["error"]; prompt: string };

let nextId = 0;
const uid = () => `m${++nextId}`;

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Totals also include runs started from the terminal launcher; dedupe is by routing ID.
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        if (!response.ok) return;
        const data: DashboardState = await response.json();
        if (!active) return;
        setConfigured(data.configured);
        recordResults(data.activities.flatMap((activity) => activity.result ? [activity.result] : []));
      } catch { /* the chat reports its own errors */ }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { active = false; clearInterval(timer); };
  }, []);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, loading]);

  const replies = messages.filter((message): message is Extract<Message, { role: "assistant" }> => message.role === "assistant");
  const selected = replies.find((message) => message.id === selectedId) ?? replies.at(-1) ?? null;
  const canSend = prompt.trim().length > 0 && prompt.length <= MAX_PROMPT_LENGTH && !loading;

  async function send(text: string) {
    if (!text.trim() || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setSelectedId(null);
    setMessages((current) => [...current.filter((message) => message.role !== "error"), { id: uid(), role: "user", text }]);
    setPrompt("");
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sessionId ? { prompt: text, sessionId } : { prompt: text }) });
      const data: ChatReply | RouteError = await response.json();
      if (!response.ok || "error" in data) {
        const error = "error" in data ? data.error : { code: "REQUEST_FAILED", message: "The request could not be completed. Please try again.", stage: "request" as const };
        setMessages((current) => [...current, { id: uid(), role: "error", error, prompt: text }]);
      } else {
        if (data.sessionId) setSessionId(data.sessionId);
        recordResults([data.result]);
        setMessages((current) => [...current, { id: uid(), role: "assistant", text: data.answer, result: data.result }]);
      }
    } catch {
      setMessages((current) => [...current, { id: uid(), role: "error", error: { code: "NETWORK_ERROR", message: "We couldn’t reach the local server. Is it still running?", stage: "request" }, prompt: text }]);
    } finally { setLoading(false); inFlight.current = false; textarea.current?.focus(); }
  }

  function submit(event: FormEvent) { event.preventDefault(); if (canSend) send(prompt); }

  function retry(message: Extract<Message, { role: "error" }>) {
    // Drop the failed exchange, then resend the same prompt.
    setMessages((current) => current.slice(0, Math.max(0, current.indexOf(message) - 1)));
    send(message.prompt);
  }

  function newChat() { setMessages([]); setSessionId(null); setSelectedId(null); setPrompt(""); textarea.current?.focus(); }

  async function copy(message: Extract<Message, { role: "assistant" }>) {
    try { await navigator.clipboard.writeText(message.text); setCopiedId(message.id); } catch { setCopiedId(null); }
  }

  function openMethodology() {
    const details = document.getElementById("methodology") as HTMLDetailsElement | null;
    if (details) { details.open = true; details.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }

  return <>
    <a className="skip-link" href="#prompt">Skip to message box</a>
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Canopy home"><span className="brand-symbol"><Leaf size={25} strokeWidth={1.7} /></span>canopy<span className="brand-period">.</span></Link>
      <nav aria-label="Main navigation"><button onClick={openMethodology}>The methodology <ArrowUpRight size={14} /></button><span className="header-pill"><span />Carbon-aware Claude</span></nav>
    </header>

    <main className="page-shell">
      <section className="hero hero-compact" aria-labelledby="hero-title">
        <div><p className="eyebrow hero-eyebrow"><span /> LESS IS A LITTLE MORE.</p><h1 id="hero-title">The right Claude. <em>A lighter footprint.</em></h1><p className="hero-description">Chat as usual. Each message is routed to the smallest suitable Claude model and answered by your own Claude Code, running quietly in the background.</p></div>
      </section>

      <div className="workspace-grid">
        <section className="chat-panel" aria-labelledby="chat-title">
          <div className="panel-heading">
            <h2 id="chat-title"><Sparkles size={16} strokeWidth={1.5} /> Conversation</h2>
            <button className="copy-button" onClick={newChat} disabled={loading || (!messages.length && !sessionId)}><Plus size={15} />New chat</button>
          </div>
          {configured === false && <p className="fallback-note chat-setup">Add GEMINI_API_KEY to .env.local, then restart the app.</p>}

          <div className="chat-log" aria-live="polite" aria-busy={loading}>
            {!messages.length && !loading && <div className="answer-waiting chat-empty">
              <h3>What’s on your mind?</h3>
              <p>A quick question, a tricky problem, a spark of an idea.<br />Claude Code answers with its tools switched off.</p>
              <div className="examples">{EXAMPLES.map((example) => <button key={example.label} onClick={() => { setPrompt(example.prompt); textarea.current?.focus(); }}>{example.label}<ArrowUpRight size={12} /></button>)}</div>
            </div>}

            {messages.map((message) => message.role === "user"
              ? <div key={message.id} className="bubble bubble-user"><p>{message.text}</p></div>
              : message.role === "error"
                ? <div key={message.id} className="error-message" role="alert"><CircleAlert size={22} /><div><h3>We hit a small snag.</h3><p>{message.error.message}</p><small>{message.error.stage === "generation" ? "Classification completed, but Claude Code didn’t finish. This attempt is not included in totals." : "Nothing was added to your totals."}</small><button className="retry-button" onClick={() => retry(message)} disabled={loading}><RotateCcw size={13} />Try again</button></div></div>
                : <article key={message.id} className={`bubble bubble-assistant ${selected?.id === message.id ? "bubble-selected" : ""}`}>
                  <div className="routing-result"><span className={`tier-badge tier-${message.result.routing.tier}`}><span />{message.result.routing.tier}</span><strong>{message.result.routing.modelName}</strong></div>
                  <p className="routing-reason"><GitBranch size={14} />{message.result.routing.reason}</p>
                  {message.result.routing.classifierFallback && <p className="fallback-note">Classified with the fallback Gemini model because the primary classifier was unavailable.</p>}
                  {message.result.modelMismatch && <p className="fallback-note">Claude Code reported {message.result.usage.models.map((model) => model.model).join(", ")}. The estimate uses those models.</p>}
                  <div className="answer-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a> }}>{message.text}</ReactMarkdown></div>
                  <div className="answer-meta">
                    <button className="meta-button" onClick={() => setSelectedId(message.id)} aria-pressed={selected?.id === message.id}>{number(message.result.impact.routed.energyWh)} Wh · {percent(message.result.impact.savings.percent)} {message.result.impact.savings.energyWh < 0 ? "more" : "less"} than Opus</button>
                    <span>{tokens(message.result.usage.generation.inputTokens + message.result.usage.generation.outputTokens)} tokens</span>
                    <button className="meta-button" onClick={() => copy(message)} aria-label="Copy answer">{copiedId === message.id ? <Check size={12} /> : <Copy size={12} />}{copiedId === message.id ? "Copied" : "Copy"}</button>
                  </div>
                </article>)}

            {loading && <div className="bubble bubble-assistant bubble-loading" role="status"><LoaderCircle className="spin" size={16} />Choosing a model and asking Claude Code…</div>}
            <div ref={bottom} />
          </div>

          <form className="composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="prompt">Your message</label>
            <textarea id="prompt" ref={textarea} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={loading} maxLength={MAX_PROMPT_LENGTH} rows={3}
              placeholder={sessionId ? "Ask a follow-up…" : "Ask anything…"}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <div className="composer-footer"><span>Enter to send · Shift+Enter for a new line</span><button className="submit-button" type="submit" disabled={!canSend}>{loading ? <><LoaderCircle className="spin" size={16} />Thinking…</> : <>Send <ArrowRight size={17} /></>}</button></div>
          </form>
          <p className="setup-note">Prefer the terminal? <code>npm run ask -- &quot;…&quot;</code> runs the same router, and those runs count here too.</p>
        </section>

        <ImpactPanel result={selected?.result ?? null} loading={loading && !selected} />
      </div>

      <SessionPanel disabled={loading} />
      <Methodology />
      <footer className="site-footer"><p><Leaf size={14} />Thoughtful AI. A little less impact.</p><p>Estimates, not measurements. <a href="https://arxiv.org/abs/2505.09598" target="_blank" rel="noreferrer">Research</a><span>·</span><a href="https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references" target="_blank" rel="noreferrer">EPA factors</a></p></footer>
    </main>
  </>;
}
