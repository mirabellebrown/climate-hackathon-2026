import { describe, expect, it } from "vitest";
import { buildDemoTurns, DEMO_TURN_COUNT } from "@/lib/demo-seed";
import { parseConversation } from "@/lib/conversation";
import { FACTORS } from "@/lib/factors";
import { addRoute, parseSession } from "@/lib/session";
import { validRouteResult } from "@/lib/conversation";

describe("demo seed", () => {
  it("builds ~21 alternating-tier RouteResults that parse into session + conversation", () => {
    const turns = buildDemoTurns();
    expect(turns).toHaveLength(DEMO_TURN_COUNT);
    expect(DEMO_TURN_COUNT).toBe(21);

    const tiers = turns.map((turn) => turn.result.routing.tier);
    expect(tiers.filter((tier) => tier === "light")).toHaveLength(7);
    expect(tiers.filter((tier) => tier === "medium")).toHaveLength(7);
    expect(tiers.filter((tier) => tier === "heavy")).toHaveLength(7);
    for (let index = 0; index < tiers.length; index += 1) {
      expect(tiers[index]).toBe((["light", "medium", "heavy"] as const)[index % 3]);
    }

    expect(turns.every((turn) => validRouteResult(turn.result))).toBe(true);

    let session = parseSession(null);
    for (const turn of turns) session = addRoute(session, turn.prompt, turn.result);
    expect(session.requests).toBe(21);
    expect(session.entries).toHaveLength(21);
    expect(session.routedUsd).toBeLessThan(session.baselineUsd);

    const parsed = parseConversation(JSON.stringify({
      version: FACTORS.version,
      turns,
      lastResult: turns.at(-1)?.result ?? null,
    }));
    expect(parsed.turns).toHaveLength(21);
    expect(parsed.turns.every((turn) => turn.result)).toBe(true);
  });
});
