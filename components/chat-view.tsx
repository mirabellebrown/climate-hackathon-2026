"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert, Copy, GitBranch, Leaf, LoaderCircle, Plus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EfficiencyStrip } from "@/components/efficiency-strip";
import { SavingsGauge } from "@/components/savings-gauge";
import { SessionSavingsEmojis } from "@/components/session-savings-emojis";
import { appendTurn, getConversationSnapshot, getServerConversationSnapshot, latestResult, newTurnId, resetConversation, subscribeConversation } from "@/lib/conversation";
import { MAX_PROMPT_LENGTH } from "@/lib/config";
import { tokens } from "@/lib/format";
import { recordRoute } from "@/lib/session";
import type { RouteError, RouteResult } from "@/lib/types";

const EXAMPLES = [
  { label: "Explain something", prompt: "Explain why leaves change color in autumn in three simple sentences." },
  { label: "Solve a coding problem", prompt: "Write a TypeScript function that groups an array of objects by a given key. Explain its time complexity and handle missing keys." },
  { label: "Think through a system", prompt: "Design a fault-tolerant architecture for a global carbon accounting platform. Compare consistency, regional failover, and auditability tradeoffs under conflicting data updates." },
];

export function ChatView() {
  const conversation = useSyncExternalStore(subscribeConversation, getConversationSnapshot, getServerConversationSnapshot);
  const [prompt, setPrompt] = useState("");
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [error, setError] = useState<RouteError["error"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const hydratedPrompt = useRef(false);
  const turns = conversation.turns;
  const latest = conversation.lastResult ?? latestResult(turns);
  const empty = turns.length === 0 && !pendingPrompt;
  const canSubmit = prompt.trim().length > 0 && prompt.length <= MAX_PROMPT_LENGTH && !loading;

  useEffect(() => {
    if (hydratedPrompt.current) return;
    hydratedPrompt.current = true;
    const last = turns.at(-1);
    if (last?.error) setPrompt(last.prompt);
  }, [turns]);

  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [prompt, empty]);

  useEffect(() => {
    if (empty) return;
    threadEnd.current?.scrollIntoView({ block: "end" });
  }, [empty, turns.length, pendingPrompt, loading]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextPrompt = prompt.trim();
    if (!nextPrompt || nextPrompt.length > MAX_PROMPT_LENGTH || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    setCopiedId(null);
    setCopyErrorId(null);
    setPendingPrompt(nextPrompt);
    setPrompt("");
    try {
      const response = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: nextPrompt }) });
      const data: RouteResult | RouteError = await response.json();
      if (!response.ok || "error" in data) {
        const nextError = "error" in data ? data.error : { code: "REQUEST_FAILED", message: "The request could not be completed. Please try again.", stage: "request" as const };
        setError(nextError);
        appendTurn({ id: newTurnId(), prompt: nextPrompt, error: nextError });
        setPrompt(nextPrompt);
      } else {
        appendTurn({ id: newTurnId(), prompt: nextPrompt, result: data });
        recordRoute(nextPrompt, data);
      }
    } catch {
      const nextError = { code: "NETWORK_ERROR", message: "We couldn’t reach the router. Check your connection and try again.", stage: "request" as const };
      setError(nextError);
      appendTurn({ id: newTurnId(), prompt: nextPrompt, error: nextError });
      setPrompt(nextPrompt);
    } finally {
      setPendingPrompt(null);
      setLoading(false);
      inFlight.current = false;
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function copyAnswer(id: string, answer: string) {
    try {
      await navigator.clipboard.writeText(answer);
      setCopiedId(id);
      setCopyErrorId(null);
    } catch {
      setCopyErrorId(id);
    }
  }

  const composer = (
    <form className="composer" onSubmit={submit}>
      <label className="sr-only" htmlFor="prompt">Your prompt</label>
      <textarea id="prompt" ref={textarea} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={loading} maxLength={MAX_PROMPT_LENGTH} placeholder="Ask anything…" aria-describedby="prompt-hint efficiency-strip" rows={1} onKeyDown={onComposerKeyDown} />
      <EfficiencyStrip result={latest} loading={loading} />
      <div className="composer-footer">
        <span id="prompt-hint">{prompt.length ? `${tokens(prompt.length)} / ${tokens(MAX_PROMPT_LENGTH)}` : "Enter to send · Shift+Enter for a new line"}</span>
        <button className="submit-button" type="submit" disabled={!canSubmit}>{loading ? <><LoaderCircle className="spin" size={16} />Thinking…</> : <>Send <ArrowRight size={16} /></>}</button>
      </div>
    </form>
  );

  return <>
    <a className="skip-link" href="#prompt">Skip to prompt</a>
    <main className={`chat-page ${empty ? "is-empty" : "is-active"}`}>
      {empty ? (
        <section className="chat-welcome" aria-labelledby="welcome-title">
          <p className="eyebrow hero-eyebrow"><span /> LESS IS A LITTLE MORE.</p>
          <h1 id="welcome-title">What’s on your mind?</h1>
          <p className="hero-description">Ask anything for your team. We’ll pick Flash Lite, Flash, or Pro. Efficiency sits above Send; Impact opens the team usage dashboard.</p>
          <div className="welcome-composer">
            {composer}
            <div className="examples"><span>Try a prompt</span>{EXAMPLES.map((example) => <button key={example.label} type="button" disabled={loading} onClick={() => { setPrompt(example.prompt); textarea.current?.focus(); }}>{example.label}</button>)}</div>
          </div>
        </section>
      ) : (
        <>
          <div className="chat-toolbar">
            <p>Team chat · each prompt is classified on its own</p>
            <button type="button" className="new-chat-button" onClick={resetConversation} disabled={loading || turns.length === 0}><Plus size={14} />New conversation</button>
          </div>
          <div className="chat-thread" role="log" aria-live="polite" aria-relevant="additions">
            {turns.map((turn) => <article key={turn.id} className="turn">
              <div className="message-user"><div className="user-bubble"><p>{turn.prompt}</p></div></div>
              {turn.result ? <AssistantMessage result={turn.result} copied={copiedId === turn.id} copyError={copyErrorId === turn.id} onCopy={() => copyAnswer(turn.id, turn.result!.answer)} /> : null}
              {turn.error ? <div className="error-message" role="alert"><CircleAlert size={22} /><div><h3>We hit a small snag.</h3><p>{turn.error.message}</p><small>{turn.error.stage === "generation" ? "Classification completed, but the answer failed. Provider resources may have been used; this attempt is not included in session totals." : "No completed request was added to your session totals."}</small></div></div> : null}
            </article>)}
            {pendingPrompt ? <article className="turn">
              <div className="message-user"><div className="user-bubble"><p>{pendingPrompt}</p></div></div>
              <div className="thinking-row"><div className="loading-orbit"><Leaf size={18} /></div><div><h3>A little thought goes into this.</h3><p>Finding the right model and preparing your answer.</p></div></div>
            </article> : null}
            <div className="sr-only" role="status" aria-live="polite">{loading ? "Classifying and generating your answer." : error ? error.message : turns.at(-1)?.result ? `Answer ready. Routed to ${turns.at(-1)!.result!.routing.modelName}.` : ""}</div>
            <div ref={threadEnd} />
          </div>
          <div className="composer-dock">
            {composer}
            <div className="examples dock-examples"><span>Try a prompt</span>{EXAMPLES.map((example) => <button key={example.label} type="button" disabled={loading} onClick={() => { setPrompt(example.prompt); textarea.current?.focus(); }}>{example.label}</button>)}</div>
          </div>
        </>
      )}
      <SessionSavingsEmojis />
      <SavingsGauge />
    </main>
  </>;
}

function AssistantMessage({ result, copied, copyError, onCopy }: { result: RouteResult; copied: boolean; copyError: boolean; onCopy: () => void }) {
  return <div className="message-assistant">
    <div className="routing-result">
      <span className={`tier-badge tier-${result.routing.tier}`}><span />{result.routing.tier}</span>
      <strong>{result.routing.modelName}</strong>
      <Link className="see-impact" href="/dashboard">See impact</Link>
      <button className="copy-button" onClick={onCopy} aria-label="Copy answer">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button>
    </div>
    <p className="routing-reason"><GitBranch size={14} />{result.routing.reason}</p>
    {result.routing.classifierFallback && <p className="fallback-note">Classified with Gemini 3.1 Flash Lite because the primary classifier was unavailable.</p>}
    <div className="answer-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a> }}>{result.answer}</ReactMarkdown></div>
    {result.truncated && <p className="truncation-note" role="status">This answer reached the output limit and may be incomplete. All reported tokens are included in the estimate.</p>}
    {copyError && <p className="copy-error" role="status">Clipboard access is unavailable. You can select and copy the answer above.</p>}
  </div>;
}
