import { describe, expect, it } from "vitest";
import {
  DEFAULT_REQUESTS_PER_PERSON_PER_DAY,
  DEFAULT_TEAM_SIZE,
  DEMO_PER_REQUEST,
  MAX_TEAM_SIZE,
  teamYearProjection,
} from "@/lib/team-year-sim";
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

  it("supports the 100k × 50/day enterprise default without clamping", () => {
    expect(DEFAULT_TEAM_SIZE).toBe(100_000);
    expect(DEFAULT_REQUESTS_PER_PERSON_PER_DAY).toBe(50);
    expect(MAX_TEAM_SIZE).toBeGreaterThanOrEqual(100_000);

    const projection = teamYearProjection(parseSession(null), {
      teamSize: DEFAULT_TEAM_SIZE,
      requestsPerPersonPerDay: DEFAULT_REQUESTS_PER_PERSON_PER_DAY,
      days: 365,
    });
    expect(projection.teamSize).toBe(100_000);
    expect(projection.requestsPerPersonPerDay).toBe(50);
    expect(projection.annualRequests).toBe(100_000 * 50 * 365);
    expect(projection.routedUsd).toBeCloseTo(DEMO_PER_REQUEST.routedUsd * projection.annualRequests, 4);
    expect(projection.alwaysProUsd).toBeCloseTo(DEMO_PER_REQUEST.alwaysProUsd * projection.annualRequests, 4);
    expect(projection.savedUsd).toBeGreaterThan(0);
  });
});
