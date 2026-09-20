"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert, Copy, GitBranch, KeyRound, Leaf, LoaderCircle, Plus, RotateCcw, Scale, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MAX_PROMPT_LENGTH } from "@/lib/config";
import { number, percent, tokens } from "@/lib/format";
import { SavingsGauge } from "@/components/savings-gauge";
import { SessionSavingsEmojis } from "@/components/session-savings-emojis";
import { buildDemoTurns, DEMO_TURN_COUNT } from "@/lib/demo-seed";
import { EMPTY_KEYS, getKeysSnapshot, getServerKeysSnapshot, keyHeaders, maskKey, saveKeys, subscribeKeys, type ApiKeys } from "@/lib/keys-client";
import { recordResults, resetSession } from "@/lib/session";
import type { ChatReply, DashboardState, RouteError, RouteResult } from "@/lib/types";

// GreenRoute chat UI (from feat/claude-api-router), backed by Canopy's routing and the
// user's own Claude Code running in the background with tools off.

const EXAMPLES = [
  { label: "Explain something", prompt: "Explain why leaves change color in autumn in three simple sentences." },
  { label: "Solve a coding problem", prompt: "Write a TypeScript function that groups an array of objects by a given key. Explain its time complexity and handle missing keys." },
  { label: "Think through a system", prompt: "Design a fault-tolerant architecture for a global carbon accounting platform. Compare consistency, regional failover, and auditability tradeoffs under conflicting data updates." },
];

type Turn = { id: string; prompt: string; reply?: { answer: string; result: RouteResult }; error?: RouteError["error"] };
let nextId = 0;
const uid = () => `t${++nextId}`;

function SiteHeader({ onKeys, keysNeeded }: { onKeys: () => void; keysNeeded: boolean }) {
  return <header className="site-header">
    <Link className="brand" href="/" aria-label="GreenRoute home"><span className="brand-symbol"><Leaf size={22} strokeWidth={1.7} /></span>GreenRoute</Link>
    <div className="header-actions">
      <span className="header-pill"><span />Carbon-aware AI</span>
      <button type="button" className="impact-toggle" onClick={onKeys} data-testid="open-keys"><KeyRound size={15} />{keysNeeded ? "Add API keys" : "API keys"}</button>
      <Link className="impact-toggle" href="/reports/esg"><Scale size={15} />Impact</Link>
    </div>
  </header>;
}

/** Keys stay in this browser; the server uses them per request and never stores them. */
function KeysPanel({ keys, serverKeys, onClose }: { keys: ApiKeys; serverKeys: { gemini: boolean; anthropic: boolean }; onClose: () => void }) {
  const [draft, setDraft] = useState(keys);
  const [saved, setSaved] = useState<string | null>(null);
  return <div className="keys-backdrop" role="dialog" aria-modal="true" aria-labelledby="keys-title" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="keys-panel">
      <div className="keys-head">
        <h2 id="keys-title">Your API keys</h2>
        <button type="button" className="keys-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <p className="keys-lede">One key is enough. Whichever vendor you add routes each prompt with its small model and answers with its bigger ones; add both and Gemini routes while Claude answers. Keys are saved in this browser and sent with your own requests, never stored, logged or shared by the server. Anyone who can run scripts on this page could read them, so revoke a key when you are done.</p>
      <label className="keys-field">
        <span>Gemini API key {serverKeys.gemini ? <em>· provided by the server</em> : <em>· routes prompts, and answers them (Flash Lite / Flash / Pro)</em>}</span>
        <input type="password" autoComplete="off" spellCheck={false} value={draft.gemini} onChange={(event) => setDraft({ ...draft, gemini: event.target.value })} placeholder={keys.gemini ? maskKey(keys.gemini) : "AIza…"} data-testid="gemini-key" />
        <small>Free tier available from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>.</small>
      </label>
      <label className="keys-field">
        <span>Anthropic API key {serverKeys.anthropic ? <em>· provided by the server</em> : <em>· answers with Haiku / Sonnet / Opus</em>}</span>
        <input type="password" autoComplete="off" spellCheck={false} value={draft.anthropic} onChange={(event) => setDraft({ ...draft, anthropic: event.target.value })} placeholder={keys.anthropic ? maskKey(keys.anthropic) : "sk-ant-…"} data-testid="anthropic-key" />
        <small>From the <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">Anthropic Console</a>, billed to you per token. A Claude Pro or Max subscription is a different product and does not work here.</small>
      </label>
      <div className="keys-actions">
        <button type="button" className="submit-button" onClick={() => { const ok = saveKeys(draft); setSaved(ok ? "Saved in this browser." : "This browser blocked storage, so the keys last only until you reload."); }} data-testid="save-keys">Save keys</button>
        <button type="button" className="new-chat-button" onClick={() => { saveKeys(EMPTY_KEYS); setDraft(EMPTY_KEYS); setSaved("Cleared from this browser."); }}>Clear</button>
        {saved && <span className="keys-saved" role="status">{saved}</span>}
      </div>
    </div>
  </div>;
}

/** "Opus" or "Gemini Pro": the always-biggest baseline this run was compared with. */
const baselineName = (result: RouteResult) => result.routing.baselineModel.startsWith("gemini") ? "Gemini Pro" : "Opus";

function EfficiencyStrip({ result, loading }: { result: RouteResult | null; loading: boolean }) {
  if (loading) return <div id="efficiency-strip" className="efficiency-strip" aria-live="polite"><LoaderCircle className="spin" size={14} /><span>Choosing a lighter Claude…</span></div>;
  if (!result) return <div id="efficiency-strip" className="efficiency-strip"><Leaf size={14} /><span>Smallest suitable model · compared with always using the biggest one after you send</span></div>;
  const extra = result.impact.savings.energyWh < 0;
  return <div id="efficiency-strip" className="efficiency-strip" aria-label="This turn’s efficiency">
    <span className={`tier-badge tier-${result.routing.tier}`}><span />{result.routing.modelName}</span>
    <span data-testid="efficiency-savings">{result.impact.savings.percent === null ? "No energy comparison" : `${percent(result.impact.savings.percent)} ${extra ? "more" : "less"} energy than ${baselineName(result)}`}</span>
    <span>{number(result.impact.routed.energyWh)} Wh · {number(result.impact.routed.co2eGrams)} g CO₂e</span>
    <span>{tokens(result.usage.generation.inputTokens + result.usage.generation.outputTokens)} tokens</span>
  </div>;
}

export default function Home() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [server, setServer] = useState<Pick<DashboardState, "mode" | "serverKeys"> | null>(null);
  const keys = useSyncExternalStore(subscribeKeys, getKeysSnapshot, getServerKeysSnapshot);
  const [keysOpen, setKeysOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const latest = turns.findLast((turn) => turn.reply)?.reply?.result ?? null;
  const empty = turns.length === 0 && !pending;
  // One key is enough: that vendor routes and answers. Locally, Claude Code still answers
  // when only a Gemini key is present.
  const hasGemini = !!server?.serverKeys.gemini || !!keys.gemini.trim();
  const hasAnthropic = !!server?.serverKeys.anthropic || !!keys.anthropic.trim();
  const keysNeeded = !!server && !hasGemini && !hasAnthropic;
  const canSubmit = prompt.trim().length > 0 && prompt.length <= MAX_PROMPT_LENGTH && !loading && !keysNeeded;

  // Totals also count runs started from the terminal launcher; dedupe is by routing ID.
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        if (!response.ok) return;
        const data: DashboardState = await response.json();
        if (!active) return;
        setServer({ mode: data.mode, serverKeys: data.serverKeys });
        recordResults(data.activities.flatMap((activity) => activity.result ? [activity.result] : []));
      } catch { /* the chat reports its own errors */ }
    }
    poll();
    const timer = setInterval(poll, 5_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [prompt, empty]);

  useEffect(() => { if (!empty) threadEnd.current?.scrollIntoView({ block: "end" }); }, [empty, turns.length, pending]);

  async function send(text: string) {
    const next = text.trim();
    if (!next || next.length > MAX_PROMPT_LENGTH || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setPending(next);
    setPrompt("");
    try {
      const history = server?.mode === "hosted" || keys.anthropic.trim()
        ? turns.flatMap((turn) => turn.reply ? [{ role: "user" as const, content: turn.prompt }, { role: "assistant" as const, content: turn.reply.answer }] : [])
        : undefined;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...keyHeaders(keys) },
        body: JSON.stringify({ prompt: next, ...(sessionId ? { sessionId } : {}), ...(history?.length ? { history } : {}) }),
      });
      const data: ChatReply | RouteError = await response.json();
      if (!response.ok || "error" in data) {
        const error = "error" in data ? data.error : { code: "REQUEST_FAILED", message: "The request could not be completed. Please try again.", stage: "request" as const };
        setTurns((current) => [...current, { id: uid(), prompt: next, error }]);
      } else {
        if (data.sessionId) setSessionId(data.sessionId);
        recordResults([data.result]);
        setTurns((current) => [...current, { id: uid(), prompt: next, reply: { answer: data.answer, result: data.result } }]);
      }
    } catch {
      setTurns((current) => [...current, { id: uid(), prompt: next, error: { code: "NETWORK_ERROR", message: "We couldn’t reach the local server. Is it still running?", stage: "request" } }]);
    } finally {
      setPending(null);
      setLoading(false);
      inFlight.current = false;
      textarea.current?.focus();
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); if (canSubmit) send(prompt); }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  }
  function retry(turn: Turn) { setTurns((current) => current.filter((t) => t.id !== turn.id)); send(turn.prompt); }
  function newConversation() { setTurns([]); setSessionId(null); setPrompt(""); textarea.current?.focus(); }
  async function copy(turn: Turn) {
    try { await navigator.clipboard.writeText(turn.reply!.answer); setCopiedId(turn.id); } catch { setCopiedId(null); }
  }

  /** Replace the conversation and session totals with local demo turns (no model calls). */
  function loadDemo() {
    const demo = buildDemoTurns();
    resetSession();
    recordResults(demo.map((turn) => turn.result));
    setTurns(demo.map((turn) => ({ id: turn.id, prompt: turn.prompt, reply: { answer: turn.answer, result: turn.result } })));
    setSessionId(null);
    setPending(null);
    setCopiedId(null);
  }
  const demoButton = (label: string) => <button type="button" className="demo-seed-button" data-testid="load-demo-data" disabled={loading} onClick={loadDemo}><Sparkles size={14} />{label}</button>;
  const savingsFooter = <div className="chat-savings-footer"><SessionSavingsEmojis /><SavingsGauge /></div>;

  const examples = (className: string) => <div className={className}><span>Try a prompt</span>{EXAMPLES.map((example) => <button key={example.label} type="button" disabled={loading} onClick={() => { setPrompt(example.prompt); textarea.current?.focus(); }}>{example.label}</button>)}</div>;

  const composer = <form className="composer" onSubmit={submit}>
    <label className="sr-only" htmlFor="prompt">Your message</label>
    <textarea id="prompt" ref={textarea} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={loading} maxLength={MAX_PROMPT_LENGTH}
      placeholder={sessionId ? "Ask a follow-up…" : "Ask anything…"} aria-describedby="prompt-hint efficiency-strip" rows={1} onKeyDown={onKeyDown} />
    <EfficiencyStrip result={latest} loading={loading} />
    <div className="composer-footer">
      <span id="prompt-hint">{prompt.length ? `${tokens(prompt.length)} / ${tokens(MAX_PROMPT_LENGTH)}` : "Enter to send · Shift+Enter for a new line"}</span>
      <button className="submit-button" type="submit" disabled={!canSubmit}>{loading ? <><LoaderCircle className="spin" size={16} />Thinking…</> : <>Send <ArrowRight size={16} /></>}</button>
    </div>
  </form>;

  return <>
    <a className="skip-link" href="#prompt">Skip to prompt</a>
    <SiteHeader onKeys={() => setKeysOpen(true)} keysNeeded={keysNeeded} />
    {keysOpen && <KeysPanel keys={keys} serverKeys={server?.serverKeys ?? { gemini: false, anthropic: false }} onClose={() => setKeysOpen(false)} />}
    <main className={`chat-page ${empty ? "is-empty" : "is-active"}`}>
      {empty ? <section className="chat-welcome" aria-labelledby="welcome-title">
        <p className="eyebrow hero-eyebrow"><span /> LESS IS A LITTLE MORE.</p>
        <h1 id="welcome-title">What’s on your mind?</h1>
        <p className="hero-description">{server?.mode === "hosted"
          ? "Ask anything for your team. We’ll route each prompt to the smallest suitable model on your own API key. Efficiency sits above Send; Impact opens the ESG report."
          : "Ask anything for your team. We’ll pick Haiku, Sonnet, or Opus and answer with your own Claude Code. Efficiency sits above Send; Impact opens the ESG report."}</p>
        <div className="welcome-composer">
          {keysNeeded && <p className="fallback-note" data-testid="keys-needed">This app runs on your own API key. Add a Gemini <em>or</em> an Anthropic key — whichever you add routes prompts with its small model and answers with its bigger ones. <button type="button" className="link-button" onClick={() => setKeysOpen(true)}>Add a key</button> — or try <button type="button" className="link-button" onClick={loadDemo}>the demo conversation</button>, which needs no key.</p>}
          {composer}
          {examples("examples")}
          <div className="demo-seed-row">{demoButton(`Load demo data (${DEMO_TURN_COUNT} turns)`)}</div>
          {savingsFooter}
        </div>
      </section> : <>
        <div className="chat-toolbar">
          <p>Team chat · each prompt is routed on its own, in one continuing conversation</p>
          <div className="chat-toolbar-actions">
            {demoButton("Load demo data")}
            <button type="button" className="new-chat-button" onClick={newConversation} disabled={loading}><Plus size={14} />New conversation</button>
          </div>
        </div>
        <div className="chat-thread" role="log" aria-live="polite" aria-relevant="additions">
          {turns.map((turn) => <article key={turn.id} className="turn">
            <div className="message-user"><div className="user-bubble"><p>{turn.prompt}</p></div></div>
            {turn.reply && <div className="message-assistant">
              <div className="routing-result">
                <span className={`tier-badge tier-${turn.reply.result.routing.tier}`}><span />{turn.reply.result.routing.tier}</span>
                <strong>{turn.reply.result.routing.modelName}</strong>
                <Link className="see-impact" href="/reports/esg">See impact</Link>
                <button className="copy-button" onClick={() => copy(turn)} aria-label="Copy answer">{copiedId === turn.id ? <Check size={15} /> : <Copy size={15} />}{copiedId === turn.id ? "Copied" : "Copy"}</button>
              </div>
              <p className="routing-reason"><GitBranch size={14} />{turn.reply.result.routing.reason}</p>
              {turn.reply.result.routing.classifierFallback && <p className="fallback-note">Classified with the fallback Gemini model because the primary classifier was unavailable.</p>}
              {turn.reply.result.modelMismatch && <p className="fallback-note">Claude Code reported {turn.reply.result.usage.models.map((model) => model.model).join(", ")}. The estimate uses those models.</p>}
              <div className="answer-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a> }}>{turn.reply.answer}</ReactMarkdown></div>
              <p className="turn-impact">{number(turn.reply.result.impact.routed.energyWh)} Wh · {percent(turn.reply.result.impact.savings.percent)} {turn.reply.result.impact.savings.energyWh < 0 ? "more" : "less"} energy than {baselineName(turn.reply.result)} · {tokens(turn.reply.result.usage.generation.inputTokens + turn.reply.result.usage.generation.outputTokens)} tokens</p>
            </div>}
            {turn.error && <div className="error-message" role="alert"><CircleAlert size={22} /><div><h3>We hit a small snag.</h3><p>{turn.error.message}</p><small>{turn.error.stage === "generation" ? "Classification completed, but Claude Code didn’t finish. This attempt is not included in totals." : "Nothing was added to your totals."}</small><button className="new-chat-button retry-button" onClick={() => retry(turn)} disabled={loading}><RotateCcw size={13} />Try again</button></div></div>}
          </article>)}
          {pending && <article className="turn">
            <div className="message-user"><div className="user-bubble"><p>{pending}</p></div></div>
            <div className="thinking-row" role="status"><div className="loading-orbit"><Leaf size={18} /></div><div><h3>A little thought goes into this.</h3><p>Choosing a model and asking Claude Code…</p></div></div>
          </article>}
          <div ref={threadEnd} />
        </div>
        <div className="composer-dock">
          {composer}
          {examples("examples dock-examples")}
          {savingsFooter}
        </div>
      </>}
    </main>
  </>;
}
