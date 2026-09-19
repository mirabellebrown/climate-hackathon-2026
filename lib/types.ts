export type Tier = "light" | "medium" | "heavy";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface Footprint {
  energyWh: number;
  co2eGrams: number;
  waterLiters: number;
  gasolineGallons: number;
  treeYears: number;
  treeMinutes: number;
}

export interface CostBreakdown {
  generation: number;
  classifier: number;
  routed: number;
  baseline: number;
  savings: number;
  percent: number | null;
}

export interface Impact {
  generation: Footprint;
  classifier: Footprint;
  routed: Footprint;
  baseline: Footprint;
  savings: Footprint & { percent: number | null };
  cost: CostBreakdown;
  environmentalSource: "ecologits" | "fallback";
  methodologyVersion: string;
}

export interface Classification {
  tier: Tier;
  reason: string;
  model: string;
  usage: TokenUsage;
  usedFallback: boolean;
}

export interface Routing {
    tier: Tier;
    reason: string;
    model: string;
    modelName: string;
    classifierModel: string;
    classifierFallback: boolean;
    baselineModel: string;
}

export interface ModelUsage extends TokenUsage {
  model: string;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface RoutingDecision {
  id: string;
  createdAt: string;
  routing: Routing;
  usage: { classifier: TokenUsage };
  classifierImpact: Footprint;
  methodologyVersion: string;
}

export interface RouteUsage {
  classifier: TokenUsage;
  /** Measured tokens from the Gemini model that actually answered. */
  generation: TokenUsage;
  /** Counterfactual Gemini Pro tokens for the same prompt. No second API call: same counts as generation. */
  baseline: TokenUsage;
  total: TokenUsage;
}

export interface RouteResult {
  answer: string;
  routing: Routing;
  usage: RouteUsage;
  impact: Impact;
  truncated: boolean;
}

export interface ObservedRouteResult {
  id: string;
  createdAt: string;
  completedAt: string;
  routing: Routing;
  usage: { classifier: TokenUsage; generation: TokenUsage; total: TokenUsage; models: ModelUsage[] };
  impact: Impact;
  durationMs: number;
  modelMismatch: boolean;
}

export interface Activity {
  id: string;
  createdAt: string;
  routing: Routing;
  status: "routed" | "completed" | "failed";
  result?: ObservedRouteResult;
  error?: string;
}

export interface DashboardState {
  configured: boolean;
  activities: Activity[];
}

export interface RouteError {
  error: { code: string; message: string; stage: "request" | "configuration" | "classification" | "generation" };
}
