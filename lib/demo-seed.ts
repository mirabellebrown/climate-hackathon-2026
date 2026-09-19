import { BASELINE_MODEL, CLASSIFIER_MODEL, MODELS } from "./config";
import { calculateObservedImpact, totalModelTokens } from "./impact";
import type { ModelUsage, RouteResult, Tier, TokenUsage } from "./types";

// Demo conversation (adapted from feat/claude-api-router) so the chat, savings gauge and
// emoji strip can be shown without spending model calls. Turns are synthesized locally and
// are never sent to the server or the ESG report.

export const DEMO_TURN_COUNT = 21;
// Tool-less Claude Code chat carries a cached system prompt of about this size per message.
const CHAT_CACHE_TOKENS = 6_600;

interface DemoSpec {
  tier: Tier;
  prompt: string;
  answer: string;
  reason: string;
  generation: TokenUsage;
  classifier: TokenUsage;
}

/** Alternating light → medium → heavy (Haiku / Sonnet / Opus), seven of each. */
const DEMO_SPECS: DemoSpec[] = [
  {
    tier: "light",
    prompt: "Explain why leaves change color in autumn in three simple sentences.",
    answer: "Leaves change color when **chlorophyll breaks down**, revealing yellow and orange pigments.\n\n- Shorter days slow chlorophyll production.\n- Cooler weather helps autumn colors emerge.",
    reason: "A short factual explanation fits a light model.",
    generation: { inputTokens: 42, outputTokens: 98 },
    classifier: { inputTokens: 180, outputTokens: 28 },
  },
  {
    tier: "medium",
    prompt: "Summarize the tradeoffs between heat pumps and high-efficiency furnaces for a cold climate home.",
    answer: "Heat pumps excel on efficiency and emissions when winters are mild-to-moderate; cold-climate models still work but capacity drops as temperatures fall.\n\n- **Furnaces** deliver reliable peak heat and may cost less upfront in very cold zones.\n- **Hybrid setups** (heat pump + furnace backup) often balance comfort, bills, and carbon.",
    reason: "Comparative product advice needs a bit more reasoning than a light model.",
    generation: { inputTokens: 310, outputTokens: 420 },
    classifier: { inputTokens: 210, outputTokens: 32 },
  },
  {
    tier: "heavy",
    prompt: "Design a fault-tolerant architecture for a global carbon accounting platform. Compare consistency, regional failover, and auditability under conflicting updates.",
    answer: "## Goals\nReconcile multi-region ledgers without losing audit trails.\n\n### Consistency\nPrefer **causal CRDTs** or versioned event sourcing so conflicting emission corrections remain replayable.\n\n### Failover\nActive-active regions with quorum writes on the control plane; read replicas for dashboards.\n\n### Auditability\nImmutable append-only logs, signed correction events, and deterministic rebuild from the event stream.",
    reason: "System design with multi-axis tradeoffs warrants the heavy model.",
    generation: { inputTokens: 1280, outputTokens: 1860 },
    classifier: { inputTokens: 260, outputTokens: 40 },
  },
  {
    tier: "light",
    prompt: "What does Scope 2 electricity mean in one paragraph?",
    answer: "**Scope 2** covers indirect greenhouse gas emissions from purchased electricity, steam, heating, or cooling. Organizations report location-based and, often, market-based figures using grid factors or contractual instruments like RECs.",
    reason: "A short definition is a light classification.",
    generation: { inputTokens: 28, outputTokens: 86 },
    classifier: { inputTokens: 160, outputTokens: 24 },
  },
  {
    tier: "medium",
    prompt: "Write a TypeScript function that groups an array of objects by a given key and note its time complexity.",
    answer: "```ts\nfunction groupBy<T extends Record<string, unknown>>(items: T[], key: keyof T): Record<string, T[]> {\n  return items.reduce<Record<string, T[]>>((acc, item) => {\n    const bucket = String(item[key] ?? \"unknown\");\n    (acc[bucket] ??= []).push(item);\n    return acc;\n  }, {});\n}\n```\nTime complexity is **O(n)** for n items; space is O(n).",
    reason: "Coding with explanation fits the medium model.",
    generation: { inputTokens: 480, outputTokens: 520 },
    classifier: { inputTokens: 200, outputTokens: 30 },
  },
  {
    tier: "heavy",
    prompt: "Propose a research plan to estimate embodied carbon for LLM inference hardware across three data-center regions.",
    answer: "1. **Inventory** GPUs/accelerators, PDUs, and networking BOM per rack.\n2. **Allocate** manufacturing GWP with lifetime throughput (tokens served).\n3. **Regionalize** grid and water factors; sensitivity on utilization and refresh cycles.\n4. **Publish** uncertainty bands and excluded scopes (end-user devices, training).",
    reason: "Research planning with methodology choices needs deeper analysis.",
    generation: { inputTokens: 960, outputTokens: 1420 },
    classifier: { inputTokens: 240, outputTokens: 36 },
  },
  {
    tier: "light",
    prompt: "List three ways to cut office printing waste.",
    answer: "- Default to duplex and grayscale.\n- Prefer shared digital review before print.\n- Track per-floor print volumes and set soft caps.",
    reason: "A brief checklist is light-model territory.",
    generation: { inputTokens: 22, outputTokens: 64 },
    classifier: { inputTokens: 150, outputTokens: 22 },
  },
  {
    tier: "medium",
    prompt: "Draft a polite email asking facilities to pilot LED retrofits in one wing.",
    answer: "Subject: Pilot LED retrofit in Wing B?\n\nHi Facilities team — could we trial LED fixtures in Wing B this quarter? We expect lower energy use and better lighting quality, and I’d be glad to help gather before/after meter reads. Happy to align with your maintenance calendar.",
    reason: "Short professional writing with tone control fits the medium model.",
    generation: { inputTokens: 220, outputTokens: 180 },
    classifier: { inputTokens: 190, outputTokens: 28 },
  },
  {
    tier: "heavy",
    prompt: "Compare LCA boundaries for reporting inference-only vs full-stack AI product emissions to an enterprise ESG lead.",
    answer: "Inference-only boundaries keep the narrative tight (tokens → energy → GWP/water) but understate upstream manufacturing and training.\n\nFull-stack reporting adds **training amortized**, hardware embodied carbon, and sometimes client devices — more complete, harder to attribute, and easier to double-count without clear exclusions.\n\nRecommend stating both: an operational inference KPI plus a separately labeled embodied/training annex.",
    reason: "ESG boundary judgment calls for heavy-model nuance.",
    generation: { inputTokens: 1100, outputTokens: 980 },
    classifier: { inputTokens: 250, outputTokens: 38 },
  },
  {
    tier: "light",
    prompt: "Convert 2.5 kWh to Wh.",
    answer: "2.5 kWh = **2,500 Wh**.",
    reason: "Trivial unit conversion routes to the light model.",
    generation: { inputTokens: 18, outputTokens: 16 },
    classifier: { inputTokens: 140, outputTokens: 20 },
  },
  {
    tier: "medium",
    prompt: "Explain demand response in energy markets for a product manager new to the space.",
    answer: "Demand response pays flexible loads to **reduce or shift electricity use** when the grid is stressed.\n\n- Utilities or aggregators send signals (price or direct control).\n- Participants shed HVAC, charging, or batch compute.\n- Value comes from avoiding peaker plants and congestion — not from generating power.",
    reason: "Domain explainer with structure fits the medium model.",
    generation: { inputTokens: 260, outputTokens: 340 },
    classifier: { inputTokens: 200, outputTokens: 30 },
  },
  {
    tier: "heavy",
    prompt: "Outline a multi-model routing policy that balances cost, latency, and quality SLOs for an internal AI platform.",
    answer: "Classify each request by complexity and risk.\n\n| Tier | When | SLO notes |\n| --- | --- | --- |\n| Haiku | FAQ, formatting | p95 < 1.5s |\n| Sonnet | Coding, summaries | quality review sample 5% |\n| Opus | Architecture, legal-ish | human escalate path |\n\nAdd classifiers with fallbacks, shadow-score Opus on a sample, and cap Opus share by budget.",
    reason: "Platform policy design spans cost, latency, and governance.",
    generation: { inputTokens: 1400, outputTokens: 1600 },
    classifier: { inputTokens: 270, outputTokens: 42 },
  },
  {
    tier: "light",
    prompt: "Name the three GHG Protocol scopes.",
    answer: "1. **Scope 1** — direct emissions\n2. **Scope 2** — purchased energy\n3. **Scope 3** — value-chain indirect",
    reason: "Simple recall question for the light model.",
    generation: { inputTokens: 20, outputTokens: 48 },
    classifier: { inputTokens: 155, outputTokens: 22 },
  },
  {
    tier: "medium",
    prompt: "Suggest a weekly checklist for a sustainability ops intern monitoring cloud spend and carbon dashboards.",
    answer: "- Monday: review spend anomalies vs baseline.\n- Midweek: check model-mix drift (Opus share).\n- Friday: export weekly GWP/water deltas and flag any methodology version changes.\n- Always: note outages so partial weeks aren’t misread as savings.",
    reason: "Operational checklist with light judgment fits the medium model.",
    generation: { inputTokens: 290, outputTokens: 260 },
    classifier: { inputTokens: 195, outputTokens: 28 },
  },
  {
    tier: "heavy",
    prompt: "Critique using tree-minutes as a public-facing carbon equivalency for AI inference savings.",
    answer: "Tree-minutes are **memorable but fragile**: sequestration rates vary by species, age, and climate; they imply permanence AI ops don’t have.\n\nBetter public metrics pair **g CO₂e and Wh** with one carefully caveated equivalency, or skip trees when the audience is technical. Keep tree-minutes as an optional illustration, not the primary KPI.",
    reason: "Metric critique with communication risk needs careful reasoning.",
    generation: { inputTokens: 720, outputTokens: 640 },
    classifier: { inputTokens: 230, outputTokens: 34 },
  },
  {
    tier: "light",
    prompt: "Is recycling always lower carbon than buying new? One sentence.",
    answer: "Often yes for metals and glass, but **not always** — collection, transport, and contamination can erase gains, so check the material and local system.",
    reason: "Short nuanced FAQ still fits the light model.",
    generation: { inputTokens: 30, outputTokens: 52 },
    classifier: { inputTokens: 165, outputTokens: 24 },
  },
  {
    tier: "medium",
    prompt: "Write a SQL query that ranks departments by month-over-month energy kWh reduction.",
    answer: "```sql\nWITH monthly AS (\n  SELECT department, date_trunc('month', day) AS month, sum(kwh) AS kwh\n  FROM energy_readings\n  GROUP BY 1, 2\n)\nSELECT department, month, kwh,\n       kwh - lag(kwh) OVER (PARTITION BY department ORDER BY month) AS mom_delta\nFROM monthly\nORDER BY mom_delta ASC NULLS LAST;\n```",
    reason: "SQL with window functions is a medium coding task.",
    generation: { inputTokens: 240, outputTokens: 280 },
    classifier: { inputTokens: 185, outputTokens: 28 },
  },
  {
    tier: "heavy",
    prompt: "How should a bank disclose AI inference emissions under a TCFD-aligned climate report without overclaiming?",
    answer: "Disclose **methodology version**, included scopes (inference vs training), and uncertainty.\n\nUse intensity metrics (g CO₂e per 1k requests) alongside totals; separate market-based electricity claims. Avoid implying equal answer quality between routed and always-Opus baselines. Point readers to exclusions (devices, network) so the narrative stays decision-useful rather than absolute.",
    reason: "Regulated disclosure language calls for the heavy model.",
    generation: { inputTokens: 1180, outputTokens: 1100 },
    classifier: { inputTokens: 255, outputTokens: 40 },
  },
  {
    tier: "light",
    prompt: "Spell out the acronym ESG.",
    answer: "**E**nvironmental, **S**ocial, and **G**overnance.",
    reason: "Trivial expansion for the light model.",
    generation: { inputTokens: 14, outputTokens: 18 },
    classifier: { inputTokens: 130, outputTokens: 18 },
  },
  {
    tier: "medium",
    prompt: "Compare batch vs real-time inference for overnight sustainability report generation.",
    answer: "**Batch** overnight jobs maximize utilization and can run on cheaper capacity; latency is irrelevant.\n\n**Real-time** suits interactive chat but burns more idle GPU time and harder-to-predict peaks.\n\nFor report packs, batch with a morning SLA usually wins on cost and carbon.",
    reason: "Product/ops comparison fits the medium model.",
    generation: { inputTokens: 340, outputTokens: 300 },
    classifier: { inputTokens: 205, outputTokens: 30 },
  },
  {
    tier: "heavy",
    prompt: "Draft an RFC for retiring always-Opus defaults in favor of tiered routing across 12 internal tools.",
    answer: "## Motivation\nAlways-Opus defaults inflate spend and environmental load without measured quality gains.\n\n## Proposal\n1. Shared classifier service with per-tool allowlists.\n2. Gradual rollout: shadow mode → canary → default.\n3. Quality gates: human eval + automatic regression on golden prompts.\n4. Kill switch back to Opus per tool.\n\n## Risks\nMisroutes on regulated content; mitigate with forced-Opus tags and audit logs.",
    reason: "Org-wide RFC with rollout and risk needs heavy-model depth.",
    generation: { inputTokens: 1520, outputTokens: 1720 },
    classifier: { inputTokens: 280, outputTokens: 44 },
  },
];

export interface DemoTurn { id: string; prompt: string; answer: string; result: RouteResult }

export function buildDemoTurns(seed = Date.now().toString(36)): DemoTurn[] {
  const at = new Date().toISOString();
  return DEMO_SPECS.map((spec, index) => {
    const id = `demo-${seed}-${String(index + 1).padStart(2, "0")}`;
    const models: ModelUsage[] = [{ model: MODELS[spec.tier].id, inputTokens: spec.generation.inputTokens, outputTokens: spec.generation.outputTokens, cacheReadInputTokens: CHAT_CACHE_TOKENS, cacheCreationInputTokens: 0 }];
    const generation = totalModelTokens(models);
    const routing = { tier: spec.tier, reason: spec.reason, model: MODELS[spec.tier].id, modelName: MODELS[spec.tier].name, classifierModel: CLASSIFIER_MODEL, classifierFallback: false, baselineModel: BASELINE_MODEL.id };
    const result: RouteResult = {
      id, createdAt: at, completedAt: at, routing, durationMs: 0, modelMismatch: false,
      usage: { classifier: spec.classifier, generation, models, total: { inputTokens: generation.inputTokens + spec.classifier.inputTokens, outputTokens: generation.outputTokens + spec.classifier.outputTokens } },
      impact: calculateObservedImpact(models, spec.classifier),
    };
    return { id, prompt: spec.prompt, answer: spec.answer, result };
  });
}
