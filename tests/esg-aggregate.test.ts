import { describe, expect, it } from "vitest";
import {
  add, decompose, EMPTY, fiscalYearOf, gwp, longContextTeams, materiality, mjToMwh, mlToM3, monthOf, parsePeriod,
  present, ratios, rollup, segmentOf, sum, toTonnes, whToMwh,
} from "@/lib/esg/aggregate";
import { sampleRecords } from "@/lib/esg/sample";
import { classify, parseRecord } from "@/lib/esg/validate";
import type { EsgRecord } from "@/lib/esg/types";

function record(over: { tokens_in?: number; tokens_out?: number; cost?: number; usage?: number; embodied?: number; team?: string; model?: string; ts?: string } = {}): EsgRecord {
  return classify(parseRecord({
    request_id: `r-${Math.random()}`, ts_utc: over.ts ?? "2026-05-10T12:00:00Z",
    org: { user_id: "u", team_id: over.team ?? "t", cost_center: "c", manager_id: "m" },
    call: { provider: "anthropic", model: over.model ?? "claude-haiku-4-5", model_is_proprietary: true, region: "US", latency_s: 1, tokens_in: over.tokens_in ?? 100, tokens_out: over.tokens_out ?? 100 },
    cost: { currency: "USD", amount: over.cost ?? 0.01, source: "provider_price_list" },
    ecologits: { version: "0.9.0", factor_version: "f1", ml_energy_benchmark_date: "2025-10", grid_mix_vintage: "OWID 2025", hardware_lifetime_years: 3,
      energy_wh: 1, gwp_usage_g: over.usage ?? 0.99, gwp_embodied_g: over.embodied ?? 0.01, adpe_kgsbeq: 0, pe_mj: 0.01, water_ml_onsite: 1, water_ml_offsite: 2, pue: 1.1, wue_onsite_l_per_kwh: 0.2, grid_intensity_source: "OWID" },
  }), []);
}

const close = (a: number | null, b: number | null) => expect(Math.abs((a ?? NaN) - (b ?? NaN))).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(b ?? 0)));
const SAMPLE = sampleRecords();

describe("unit conversions (presentation boundary only)", () => {
  it("converts grams, Wh, MJ and mL", () => {
    expect(toTonnes(2_500_000)).toBe(2.5);
    expect(whToMwh(3_000_000)).toBe(3);
    expect(mjToMwh(3600)).toBe(1); // 1 kWh = 3.6 MJ, so 3,600 MJ = 1 MWh
    expect(mlToM3(1_000_000)).toBe(1);
  });
  it("keeps water on-site and off-site separate until display", () => {
    const p = present(sum([record(), record()]));
    expect(p.m3_water_onsite).toBe(2 / 1e6);
    expect(p.m3_water_offsite).toBe(4 / 1e6);
    expect(p.m3_water).toBe(6 / 1e6);
  });
});

describe("ratio metrics are sum over sum, never averaged", () => {
  it("weights a large request by its tokens", () => {
    const small = record({ tokens_out: 1, usage: 1, embodied: 0 });
    const big = record({ tokens_out: 10_000, usage: 1, embodied: 0 });
    const ci = ratios(sum([small, big])).ci_tok!;
    expect(ci).toBeCloseTo(1000 * 2 / 10_001, 12);
    const averaged = (ratios(sum([small])).ci_tok! + ratios(sum([big])).ci_tok!) / 2;
    expect(ci).not.toBeCloseTo(averaged, 3);
  });
  it.each(["request", "day", "month", "fy"] as const)("holds at %s grain on the sample", (grain) => {
    const key = (r: EsgRecord) => grain === "request" ? r.request_id : grain === "day" ? r.ts_utc.slice(0, 10) : grain === "month" ? monthOf(r.ts_utc) : fiscalYearOf(r.ts_utc, 1);
    for (const [k, m] of rollup(SAMPLE.slice(0, 3000), key)) {
      const members = SAMPLE.slice(0, 3000).filter((r) => key(r) === k);
      close(ratios(m).ci_tok, 1000 * members.reduce((s, r) => s + r.ecologits.gwp_usage_g + r.ecologits.gwp_embodied_g, 0) / members.reduce((s, r) => s + r.call.tokens_out, 0));
    }
  });
  it("returns null, not NaN or Infinity, for zero denominators", () => {
    expect(ratios(EMPTY)).toMatchObject({ tpd: null, ci_tok: null, cpd: null, tpg: null });
  });
});

describe("bridging identity CPD = (CI_tok / 1000) × TPD", () => {
  const levels: [string, (r: EsgRecord) => string][] = [
    ["request", (r) => r.request_id], ["team × provider × model × region × day", (r) => `${r.org.team_id}|${segmentOf(r)}|${r.ts_utc.slice(0, 10)}`],
    ["month", (r) => monthOf(r.ts_utc)], ["fiscal year", (r) => fiscalYearOf(r.ts_utc, 4)], ["team", (r) => r.org.team_id], ["model", (r) => r.call.model],
  ];
  it.each(levels)("holds at %s level", (_name, key) => {
    for (const m of rollup(SAMPLE, key).values()) {
      const r = ratios(m);
      close(r.cpd, (r.ci_tok! / 1000) * r.tpd!);
    }
  });
  it("holds for randomized records", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let trial = 0; trial < 200; trial++) {
      const records = Array.from({ length: 1 + Math.floor(rand() * 20) }, () => record({ tokens_out: 1 + Math.floor(rand() * 5000), cost: 1e-6 + rand(), usage: rand() * 10, embodied: rand() }));
      const r = ratios(sum(records));
      close(r.cpd, (r.ci_tok! / 1000) * r.tpd!);
    }
  });
});

describe("rollups", () => {
  it("equal the sum of their request records for every measure", () => {
    const byMonth = rollup(SAMPLE, (r) => monthOf(r.ts_utc));
    const total = sum(SAMPLE);
    const merged = [...byMonth.values()].reduce((acc, m) => { for (const k of Object.keys(acc) as (keyof typeof acc)[]) acc[k] += m[k]; return acc; }, { ...EMPTY });
    for (const key of Object.keys(total) as (keyof typeof total)[]) close(merged[key], total[key]);
  });
  it("keep usage and embodied GWP as separate sums", () => {
    const m = sum([record({ usage: 3, embodied: 1 })]);
    expect(m.gwp_usage_g).toBe(3);
    expect(m.gwp_embodied_g).toBe(1);
    expect(gwp(m)).toBe(4);
  });
  it("are deterministic for identical inputs and factor version", () => {
    expect(JSON.stringify(present(sum(sampleRecords())))).toBe(JSON.stringify(present(sum(sampleRecords()))));
    expect(JSON.stringify(sampleRecords().slice(0, 50))).toBe(JSON.stringify(sampleRecords().slice(0, 50)));
  });
});

describe("materiality and long-context flags", () => {
  it("flags embodied only when it exceeds 1% of Scope 3", () => {
    expect(materiality(sum([record({ usage: 99, embodied: 1 })])).material).toBe(false); // exactly 1%
    expect(materiality(sum([record({ usage: 98.99, embodied: 1.01 })])).material).toBe(true);
  });
  it("warns only when sum(tokens_in) / sum(tokens_out) exceeds 5", () => {
    expect(longContextTeams([record({ team: "a", tokens_in: 500, tokens_out: 100 })])).toEqual([]);
    expect(longContextTeams([record({ team: "a", tokens_in: 501, tokens_out: 100 })])).toEqual([{ team: "a", ratio: 5.01 }]);
    // Ratio of sums, not mean of per-request ratios.
    expect(longContextTeams([record({ team: "a", tokens_in: 1000, tokens_out: 10 }), record({ team: "a", tokens_in: 100, tokens_out: 1000 })])).toEqual([]);
  });
  it("fires for the sample's engineering team", () => {
    expect(longContextTeams(SAMPLE).map((row) => row.team)).toEqual(["engineering"]);
  });
});

describe("volume / mix / intensity decomposition", () => {
  it("sums exactly to the observed change", () => {
    const base = SAMPLE.filter((r) => monthOf(r.ts_utc) === "2026-04");
    const now = SAMPLE.filter((r) => monthOf(r.ts_utc) === "2026-08");
    const d = decompose(rollup(now, segmentOf), rollup(base, segmentOf));
    close(d.volume + d.mix + d.intensity, d.total);
    close(d.total, toTonnes(gwp(sum(now)) - gwp(sum(base))));
    expect(d.volume).toBeGreaterThan(0); // the sample grows over time
  });
  it("attributes pure volume growth to volume", () => {
    const one = [record({ tokens_out: 100, usage: 1, embodied: 0 })];
    const d = decompose(rollup([...one, ...one], segmentOf), rollup(one, segmentOf));
    close(d.volume, toTonnes(1));
    close(d.mix, 0); close(d.intensity, 0);
  });
  it("attributes a model switch at constant per-model intensity to mix", () => {
    const dirty = record({ model: "a", tokens_out: 100, usage: 10, embodied: 0 });
    const clean = record({ model: "b", tokens_out: 100, usage: 1, embodied: 0 });
    const d = decompose(rollup([clean], segmentOf), rollup([dirty], segmentOf));
    close(d.volume, 0);
    close(d.mix, toTonnes(-9));
    close(d.intensity, 0);
  });
  it("attributes a per-token improvement to intensity", () => {
    const d = decompose(rollup([record({ tokens_out: 100, usage: 1, embodied: 0 })], segmentOf), rollup([record({ tokens_out: 100, usage: 2, embodied: 0 })], segmentOf));
    close(d.intensity, toTonnes(-1));
    close(d.volume, 0); close(d.mix, 0);
  });
});

describe("periods", () => {
  it("parses months and fiscal years named for their end year", () => {
    expect(parsePeriod("2026-08")).toMatchObject({ start: "2026-08-01T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" });
    expect(parsePeriod("FY2027", 4)).toMatchObject({ start: "2026-04-01T00:00:00.000Z", end: "2027-04-01T00:00:00.000Z" });
    expect(fiscalYearOf("2026-05-01T00:00:00Z", 4)).toBe("FY2027");
    expect(fiscalYearOf("2026-03-31T23:00:00Z", 4)).toBe("FY2026");
    expect(() => parsePeriod("2026-13")).toThrow();
  });
});

it("add() never mutates the empty accumulator", () => {
  add(EMPTY, record());
  expect(EMPTY.request_count).toBe(0);
});
