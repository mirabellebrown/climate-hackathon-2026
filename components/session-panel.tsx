"use client";

import { useSyncExternalStore } from "react";
import { ArrowDownRight, RotateCcw, Sprout } from "lucide-react";
import { clearConversation } from "@/lib/conversation";
import { getServerSessionSnapshot, getSessionSnapshot, lifetimeSavings, resetSession, subscribeSession } from "@/lib/session";
import { money, number, percent, tokens } from "@/lib/format";

function pair(inputTokens: number, outputTokens: number) {
  return `${tokens(inputTokens)} / ${tokens(outputTokens)}`;
}

export function SessionPanel({ disabled }: { disabled: boolean }) {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const life = lifetimeSavings(session);
  const savedCostPercent = session.baselineUsd ? life.usd / session.baselineUsd * 100 : null;
  return <section className="session-panel" aria-labelledby="session-title">
    <div className="session-intro"><span className="session-icon"><Sprout size={22} /></span><div><h2 id="session-title">Team session log</h2><p>This browser’s team prototype · {session.requests} completed {session.requests === 1 ? "request" : "requests"}</p></div></div>
    <div className="session-stat"><strong data-testid="session-carbon">{session.requests ? number(Math.abs(life.co2eGrams)) : "—"}<small> g CO₂e</small></strong><span>{life.extraCo2 ? "extra emissions" : "estimated emissions saved"}</span></div>
    <div className="session-stat"><strong data-testid="session-cost">{session.requests ? money(Math.abs(life.usd)) : "—"}</strong><span>{life.extraUsd ? "extra API cost" : "estimated API cost saved"}</span></div>
    <div className="session-stat"><strong>{percent(savedCostPercent)}</strong><span>{life.extraUsd ? "more" : "less"} expensive overall</span></div>
    <button className="reset-button" onClick={() => { resetSession(); clearConversation(); }} disabled={disabled || !session.requests} aria-label="Reset session totals" title="Reset session totals"><RotateCcw size={17} /></button>
    {session.entries.length > 0 && <div className="prompt-log">
      <h3>Prompt token log</h3>
      <p>Each row is the model we used for that prompt versus the Gemini Pro counterfactual for the same answer tokens.</p>
      <div className="prompt-log-scroll">
        <table>
          <thead><tr><th scope="col">Prompt</th><th scope="col">Chosen model</th><th scope="col">Chosen tokens</th><th scope="col">If Gemini Pro</th><th scope="col">Chosen $</th><th scope="col">Pro $</th></tr></thead>
          <tbody>
            {session.entries.map((entry, index) => <tr key={`${entry.model}-${index}`}>
              <th scope="row">{entry.prompt}</th>
              <td>{entry.modelName}</td>
              <td>{pair(entry.chosen.inputTokens, entry.chosen.outputTokens)}</td>
              <td>{pair(entry.baseline.inputTokens, entry.baseline.outputTokens)}</td>
              <td>{money(entry.routedUsd)}</td>
              <td>{money(entry.baselineUsd)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p className="prompt-log-totals">Session answer tokens · chosen {pair(session.chosenInputTokens, session.chosenOutputTokens)} · Gemini Pro {pair(session.baselineInputTokens, session.baselineOutputTokens)} · {money(session.routedUsd)} vs {money(session.baselineUsd)}</p>
    </div>}
    <p className="session-note"><ArrowDownRight size={13} />{session.persistent ? "Prompt text and token counts stay in this browser until you reset them. Answers are never saved here." : "Browser storage is unavailable. Totals will last only while this page stays open."} Completed requests only; failed attempts may still use provider resources.</p>
  </section>;
}
