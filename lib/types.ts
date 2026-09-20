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

export interface Impact {
  generation: Footprint;
  classifier: Footprint;
  routed: Footprint;
  baseline: Footprint;
  savings: Footprint & { percent: number | null };
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

export interface RouteResult {
  id: string;
  createdAt: string;
  completedAt: string;
  routing: Routing;
  usage: { classifier: TokenUsage; generation: TokenUsage; total: TokenUsage; models: ModelUsage[] };
  impact: Impact;
  durationMs: number;
  modelMismatch: boolean;
}

export interface ChatReply {
  answer: string;
  sessionId: string | null;
  /** Which vendor answered: "Claude" or "Gemini". */
  vendor?: string;
  result: RouteResult;
}

export interface Activity {
  id: string;
  createdAt: string;
  routing: Routing;
  status: "routed" | "completed" | "failed";
  result?: RouteResult;
  error?: string;
}

export interface DashboardState {
  configured: boolean;
  mode: "local" | "hosted";
  serverKeys: { gemini: boolean; anthropic: boolean };
  activities: Activity[];
}

export interface RouteError {
  error: { code: string; message: string; stage: "request" | "configuration" | "classification" | "generation" };
}
