# Plan: general-purpose Claude chat

Branch: `feat/general-claude-chat` · Status: **planned, not implemented** · Written 2026-09-19

## Problem

The web chat runs the user's Claude Code in the background. Claude Code ships a coding-focused system prompt: it frames Claude as a software engineering agent. It's also tuned for terse, code-first replies. The team wants Canopy to feel like chatting with Claude itself, for everyday questions, writing, planning and learning, while still routing each message to the smallest suitable model and tracking impact.

## What we measured first

We sent the same non-coding prompt (a 3-day Lisbon itinerary) to Haiku through Claude Code 2.1.270, with tools disabled:

| Setup | Answered well? | Input tokens incl. cache |
| --- | --- | --- |
| Current chat mode (Claude Code prompt + `--append-system-prompt`) | Yes | ~6,750 |
| `--system-prompt "<general assistant prompt>"` (replaces Claude Code's prompt) | Yes | ~620 |

Takeaways:

1. **Claude Code is not technically limited to coding.** It answers general questions; the default prompt just biases tone and scope.
2. **Replacing the system prompt removes that bias**, while still using the user's own Claude sign-in.
3. It also cuts per-message overhead by about 10×. A short reply's estimated footprint drops from ~0.75 Wh to well under 0.1 Wh, which fits Canopy's climate story.

## Options

### Option A: Claude Code with a general system prompt (recommended)

Keep the current architecture and change how the background process is launched:

- In `lib/claude-code.ts`, replace `--append-system-prompt …` with `--system-prompt <CHAT_SYSTEM_PROMPT>`. The prompt describes a warm, general-purpose assistant; Markdown is allowed; tools are unavailable.
- Consider `--setting-sources ""` (or `--safe-mode`) so user-level CLAUDE.md, hooks, plugins and output styles don't leak into the chat. Verify which flag keeps authentication working.
- Optional: a "Mode" toggle in the UI, either **General** (the new prompt) or **Coding** (Claude Code's own prompt). Both still have no tools.
- Update copy ("Claude Code answers…" → "Claude answers…, via your Claude Code sign-in"), README and METHODOLOGY. The fixed overhead figures change.
- Tests: assert `--system-prompt` is passed and `--append-system-prompt` is not. Add a chat test that follow-ups keep the prompt, and an e2e test for the mode toggle, if we add it.

| | |
| --- | --- |
| Difficulty | **Low** |
| Effort | ~1–2 hours including tests and docs |
| Needs | Nothing new; same Claude Code login |
| Risks | The system prompt is recorded per session (`--system-prompt-snapshot` defaults to on), so switching modes mid-conversation should start a new chat. Programmatic use counts against the user's Claude plan limits, as today. |

### Option B: the Claude API directly (Messages API with an API key)

Replace the background Claude Code process with server-side calls via the official Anthropic SDK. This is close to Canopy's original architecture.

- Add `@anthropic-ai/sdk` and `ANTHROPIC_API_KEY` (server-only).
- Implement `lib/generate.ts`: send the conversation history (kept by the browser or server) plus a general system prompt to the routed model. Read `usage` (input, output, cache read, cache creation) straight from the response.
- Streaming becomes easy (`stream: true`), a clear UX win.
- Handle 401/403/404/429/5xx, max-token truncation, and no automatic escalation to Opus.
- Tests: intercept HTTP as the earlier version did.

| | |
| --- | --- |
| Difficulty | **Medium** |
| Effort | ~3–5 hours (history handling, streaming UI, errors, tests, docs) |
| Needs | An Anthropic API key with billing. **Separate from a Claude.ai Pro/Max subscription.** |
| Pros | Real Claude API behavior, exact usage, no CLI dependency, streaming, works on a server/deployment |
| Cons | Costs money per token and needs an API account for every user or team. Users can no longer "use their own Claude app account". |

### Option C: drive the claude.ai website or desktop app

Intercept or automate the user's logged-in Claude app so Canopy picks the model and reads usage.

| | |
| --- | --- |
| Difficulty | **Not feasible** |
| Why | No public API. Automating the consumer app is brittle, likely against the Terms of Service, and doesn't expose per-message token usage, which Canopy's impact math needs. |

## Recommendation

1. Do **Option A** now. It's the smallest change, keeps "use your own Claude account", and makes Canopy's footprint numbers dramatically better.
2. Keep **Option B** as a follow-up if the team needs streaming, deployment beyond localhost, or users without Claude Code. It can live alongside A behind a server setting (`CANOPY_BACKEND=claude-code | api`).

## Implementation checklist (Option A)

- [ ] `CHAT_SYSTEM_PROMPT` constant; switch `chatArgs` to `--system-prompt`
- [ ] Decide on and verify isolation flags (`--setting-sources`, `--safe-mode`) with a real signed-in run
- [ ] Optional General/Coding mode toggle; the mode is fixed per conversation
- [ ] UI and docs copy; methodology overhead numbers
- [ ] Unit + e2e tests; `npm run check`; browser e2e; one live general and one live coding message
- [ ] PR into `main`
