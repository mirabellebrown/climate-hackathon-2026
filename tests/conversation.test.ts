import { describe, expect, it } from "vitest";
import { latestResult, parseConversation } from "@/lib/conversation";
import { calculateImpact, compareUsage } from "@/lib/impact";
import { FACTORS } from "@/lib/factors";
import { MODELS } from "@/lib/config";
import type { RouteResult } from "@/lib/types";

function route(prompt: string, tier: "light" | "medium" | "heavy"): RouteResult {
  const generation = { inputTokens: 100, outputTokens: 80 };
  const classifier = { inputTokens: 20, outputTokens: 10 };
  return {
    answer: `Answer for ${prompt}`,
    routing: {
      tier, reason: "test", model: MODELS[tier].id, modelName: MODELS[tier].name,
      classifierModel: MODELS.light.id, classifierFallback: false, baselineModel: MODELS.heavy.id,
    },
    usage: compareUsage(generation, classifier),
    impact: calculateImpact(tier, generation, classifier),
    truncated: false,
  };
}

describe("conversation persistence", () => {
  it("restores turns and the latest successful result", () => {
    const first = route("Why do leaves change color?", "light");
    const second = route("Design a global carbon ledger.", "heavy");
    const parsed = parseConversation(JSON.stringify({
      version: FACTORS.version,
      lastResult: second,
      turns: [
        { id: "1", prompt: "Why do leaves change color?", result: first },
        { id: "2", prompt: "Design a global carbon ledger.", result: second },
      ],
    }));
    expect(parsed.turns).toHaveLength(2);
    expect(parsed.turns[0].prompt).toBe("Why do leaves change color?");
    expect(parsed.lastResult?.routing.modelName).toBe("Gemini Pro");
    expect(latestResult(parsed.turns)?.answer).toContain("Design a global carbon ledger");
  });
  it("keeps lastResult when a new conversation has no turns yet", () => {
    const last = route("Earlier question", "medium");
    const parsed = parseConversation(JSON.stringify({ version: FACTORS.version, turns: [], lastResult: last }));
    expect(parsed.turns).toHaveLength(0);
    expect(parsed.lastResult?.routing.modelName).toBe("Gemini Flash");
  });
  it("drops corrupt or version-mismatched conversations", () => {
    expect(parseConversation(JSON.stringify({ version: "old", turns: [{ id: "1", prompt: "hi", result: route("hi", "light") }] }))).toEqual({ turns: [], lastResult: null });
    expect(parseConversation("bad json")).toEqual({ turns: [], lastResult: null });
    expect(parseConversation(null)).toEqual({ turns: [], lastResult: null });
  });
});
