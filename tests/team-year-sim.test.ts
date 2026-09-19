import { describe, expect, it } from "vitest";
import { DEMO_PER_REQUEST, teamYearProjection } from "@/lib/team-year-sim";
import { parseSession } from "@/lib/session";

describe("team-year cost simulator", () => {
  it("projects annual spend from demo averages when the session is empty", () => {
    const projection = teamYearProjection(parseSession(null), {
      teamSize: 100,
      requestsPerPersonPerDay: 8,
      days: 365,
    });
    expect(projection.averages.fromSession).toBe(false);
    expect(projection.annualRequests).toBe(100 * 8 * 365);
    expect(projection.routedUsd).toBeCloseTo(DEMO_PER_REQUEST.routedUsd * projection.annualRequests, 8);
    expect(projection.alwaysProUsd).toBeCloseTo(DEMO_PER_REQUEST.alwaysProUsd * projection.annualRequests, 8);
    expect(projection.savedUsd).toBeGreaterThan(0);
  });
});
