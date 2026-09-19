import { describe, expect, it } from "vitest";
import {
  gToTco2e,
  litersToMl,
  mlToM3,
  mjToMwh,
  whToMwh,
} from "@/lib/esg/conversions";
import {
  cpdFromIdentity,
  metricsFromTotals,
  sumRecords,
} from "@/lib/esg/metrics";
import { adaptImpactToRecord } from "@/lib/esg/adapt";
import { breakdownByGrain, buildMeta, efficiencyFrontier, summaryKpis } from "@/lib/esg/rollup";
import { ESG_EXCLUSIONS } from "@/lib/esg/exclusions";
import { ISO_ESG_MAPPING } from "@/lib/esg/mapping";
import { FACTORS } from "@/lib/factors";
import type { Impact } from "@/lib/types";
import type { EsgRequestRecord } from "@/lib/esg/types";

function footprint(energyWh: number, co2eGrams: number, waterLiters: number) {
  return {
    energyWh,
    co2eGrams,
    waterLiters,
    gasolineGallons: co2eGrams / 8887,
    treeYears: co2eGrams / 60_000,
    treeMinutes: (co2eGrams / 60_000) * 525_600,
  };
}

function sampleImpact(overrides?: Partial<Impact>): Impact {
  const fp = footprint(2, 0.5, 0.003);
  return {
    generation: fp,
    classifier: footprint(0.1, 0.02, 0.0001),
    routed: footprint(2.1, 0.52, 0.0031),
    baseline: footprint(8, 2, 0.01),
    savings: { ...footprint(5.9, 1.48, 0.0069), percent: 70 },
    cost: { generation: 0.004, classifier: 0.0002, routed: 0.0042, baseline: 0.02, savings: 0.0158, percent: 79 },
    environmentalSource: "ecologits",
    methodologyVersion: FACTORS.version,
    ...overrides,
  };
}

function record(partial: Partial<EsgRequestRecord> & Pick<EsgRequestRecord, "id" | "model" | "tokens_out" | "cost_usd" | "gwp_usage_g">): EsgRequestRecord {
  return {
    created_at: "2026-09-15T12:00:00.000Z",
    gwp_embodied_g: null,
    energy_wh: 1,
    pe_mj: null,
    adpe_kgsbeq: null,
    water_ml_onsite: 1000,
    water_ml_offsite: null,
    tokens_in: 100,
    latency_s: 1,
    provider: "google_genai",
    region: "WOR",
    team_id: "browser-session",
    ecologits_version: "ecologits-api-v1beta-2026-09",
    factor_version: FACTORS.version,
    audit_tier: "average-data",
    audit_notes: [],
    environmental_source: "ecologits",
    ...partial,
  };
}

describe("ESG unit conversions", () => {
  it("converts g / Wh / mL only at display boundaries", () => {
    expect(gToTco2e(1_000_000)).toBe(1);
    expect(whToMwh(1_000_000)).toBe(1);
    expect(mlToM3(1_000_000)).toBe(1);
    expect(litersToMl(2.5)).toBe(2500);
    expect(mjToMwh(3600)).toBe(1);
  });
});

describe("ESG sum-over-sum metrics", () => {
  it("computes ratios from summed numerators and denominators", () => {
    const totals = sumRecords([
      record({ id: "a", model: "m1", tokens_out: 1000, cost_usd: 2, gwp_usage_g: 4, energy_wh: 10, water_ml_onsite: 2000, tokens_in: 500 }),
      record({ id: "b", model: "m1", tokens_out: 3000, cost_usd: 6, gwp_usage_g: 12, energy_wh: 30, water_ml_onsite: 6000, tokens_in: 1500 }),
    ]);
    expect(totals.tokens_out).toBe(4000);
    expect(totals.cost_usd).toBe(8);
    expect(totals.gwp_total_g).toBe(16);
    const m = metricsFromTotals(totals);
    expect(m.tpd_output).toBeCloseTo(4000 / 8);
    expect(m.tpd_total).toBeCloseTo(6000 / 8);
    expect(m.ci_tok).toBeCloseTo(1000 * 16 / 4000);
    expect(m.ei_tok).toBeCloseTo(1000 * 40 / 4000);
    expect(m.wi_tok).toBeCloseTo(1000 * 8000 / 4000);
    expect(m.cpd).toBeCloseTo(16 / 8);
  });

  it("never averages per-request ratios", () => {
    const a = record({ id: "a", model: "m", tokens_out: 100, cost_usd: 1, gwp_usage_g: 10 });
    const b = record({ id: "b", model: "m", tokens_out: 900, cost_usd: 1, gwp_usage_g: 10 });
    const m = metricsFromTotals(sumRecords([a, b]));
    const avgOfRatios = ((10 / 100) + (10 / 900)) / 2;
    expect(m.cpd).toBeCloseTo(20 / 2);
    expect(m.cpd).not.toBeCloseTo(avgOfRatios);
  });

  it("holds CPD = (CI_tok / 1000) * TPD at request and rollup grains", () => {
    const records = [
      record({ id: "a", model: "flash", tokens_out: 500, cost_usd: 0.01, gwp_usage_g: 0.2, tokens_in: 200 }),
      record({ id: "b", model: "pro", tokens_out: 2000, cost_usd: 0.05, gwp_usage_g: 1.5, tokens_in: 800 }),
    ];
    for (const grain of [records, records.slice(0, 1), records.slice(1)]) {
      const m = metricsFromTotals(sumRecords(grain));
      expect(m.ci_tok).not.toBeNull();
      expect(m.tpd_output).not.toBeNull();
      expect(m.cpd).not.toBeNull();
      expect(m.cpd!).toBeCloseTo(cpdFromIdentity(m.ci_tok!, m.tpd_output!), 10);
    }
    for (const row of breakdownByGrain(records)) {
      expect(row.metrics.cpd!).toBeCloseTo(
        cpdFromIdentity(row.metrics.ci_tok!, row.metrics.tpd_output!),
        10,
      );
    }
  });
});

describe("ESG record adaptation", () => {
  it("stores EcoLogits undivided GWP in usage and leaves embodied/offsite/PE/ADPe null", () => {
    const rec = adaptImpactToRecord({
      impact: sampleImpact(),
      tokensIn: 100,
      tokensOut: 200,
      model: "gemini-3.6-flash",
    });
    expect(rec.gwp_usage_g).toBeCloseTo(0.52);
    expect(rec.gwp_embodied_g).toBeNull();
    expect(rec.water_ml_onsite).toBeCloseTo(3.1);
    expect(rec.water_ml_offsite).toBeNull();
    expect(rec.pe_mj).toBeNull();
    expect(rec.adpe_kgsbeq).toBeNull();
    expect(rec.audit_notes.length).toBeGreaterThan(0);
  });

  it("does not merge usage and embodied when embodied is present", () => {
    const withEmbodied = record({
      id: "e",
      model: "m",
      tokens_out: 1000,
      cost_usd: 1,
      gwp_usage_g: 10,
      gwp_embodied_g: 2,
    });
    const totals = sumRecords([withEmbodied]);
    expect(totals.gwp_usage_g).toBe(10);
    expect(totals.gwp_embodied_g).toBe(2);
    expect(totals.gwp_total_g).toBe(12);
  });
});

describe("ESG rollups and meta", () => {
  it("rollup totals equal the sum of records", () => {
    const records = [
      record({ id: "1", model: "a", tokens_out: 10, cost_usd: 1, gwp_usage_g: 1, energy_wh: 2, water_ml_onsite: 100 }),
      record({ id: "2", model: "b", tokens_out: 20, cost_usd: 3, gwp_usage_g: 4, energy_wh: 5, water_ml_onsite: 200 }),
    ];
    const totals = sumRecords(records);
    expect(totals.requests).toBe(2);
    expect(totals.energy_wh).toBe(7);
    expect(summaryKpis(totals).tco2e_scope3_cat1).toBeCloseTo(gToTco2e(5));
  });

  it("always attaches exclusions and audit_tier", () => {
    const meta = buildMeta([]);
    expect(meta.exclusions).toHaveLength(7);
    expect(meta.exclusions.map((e) => e.id).sort()).toEqual(
      [...ESG_EXCLUSIONS].map((e) => e.id).sort(),
    );
    expect(meta.audit_tier).toBe("average-data");
    expect(meta.factor_version).toBeTruthy();
    expect(meta.ecologits_version).toBeTruthy();
  });

  it("flags prefill when mean tokens_in / tokens_out > 5", () => {
    const records = [
      record({ id: "1", model: "a", tokens_out: 100, tokens_in: 600, cost_usd: 1, gwp_usage_g: 1 }),
    ];
    expect(buildMeta(records).prefill_warning).toBe(true);
    const ok = [record({ id: "2", model: "a", tokens_out: 100, tokens_in: 200, cost_usd: 1, gwp_usage_g: 1 })];
    expect(buildMeta(ok).prefill_warning).toBe(false);
  });

  it("builds efficiency frontier without dual axes (single x/y pair)", () => {
    const points = efficiencyFrontier([
      record({ id: "1", model: "gemini-3.5-flash-lite", tokens_out: 1000, cost_usd: 2, gwp_usage_g: 1 }),
      record({ id: "2", model: "gemini-3.1-pro-preview", tokens_out: 1000, cost_usd: 10, gwp_usage_g: 5 }),
    ]);
    expect(points).toHaveLength(2);
    expect(points.every((p) => p.usd_per_1m_output != null && p.gwp_per_1m_output != null)).toBe(true);
    expect(points.find((p) => p.model.includes("flash-lite"))?.low_confidence).toBe(true);
  });
});

describe("ISO→ESG mapping config", () => {
  it("ships the required rows and marks ADPe internal-only", () => {
    expect(ISO_ESG_MAPPING.some((r) => r.id === "gwp_operational")).toBe(true);
    expect(ISO_ESG_MAPPING.some((r) => r.id === "ci_tok")).toBe(true);
    const adpe = ISO_ESG_MAPPING.find((r) => r.id === "adpe");
    expect(adpe?.internal_only).toBe(true);
  });
});
