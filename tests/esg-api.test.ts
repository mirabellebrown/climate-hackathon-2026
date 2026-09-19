import { beforeEach, describe, expect, it } from "vitest";
import { GET as getSummary } from "@/app/api/v1/esg/summary/route";
import { GET as getBreakdown } from "@/app/api/v1/esg/breakdown/route";
import { GET as getFrontier } from "@/app/api/v1/esg/efficiency-frontier/route";
import { GET as getTrend } from "@/app/api/v1/esg/trend/route";
import { GET as getMapping } from "@/app/api/v1/esg/disclosure/mapping/route";
import { GET as getMethodology } from "@/app/api/v1/esg/disclosure/methodology/route";
import { POST as postExport } from "@/app/api/v1/esg/disclosure/export/route";
import { resetEsgDemoSeed } from "@/lib/esg/store";

beforeEach(() => {
  resetEsgDemoSeed();
});

function assertMeta(body: Record<string, unknown>) {
  expect(body.factor_version).toBeTruthy();
  expect(body.ecologits_version).toBeTruthy();
  expect(body.audit_tier).toBeTruthy();
  expect(Array.isArray(body.exclusions)).toBe(true);
  expect((body.exclusions as unknown[]).length).toBe(7);
}

describe("ESG API endpoints", () => {
  it("GET /summary carries exclusions, audit_tier, and KPI totals", async () => {
    const res = await getSummary(new Request("http://localhost/api/v1/esg/summary"));
    expect(res.status).toBe(200);
    const body = await res.json();
    assertMeta(body);
    expect(body.kpis.tco2e_scope3_cat1).toBeTypeOf("number");
    expect(body.totals.gwp_usage_g).toBeTypeOf("number");
    expect(body.totals).toHaveProperty("gwp_embodied_g");
    expect(body.metrics.tpd_output).not.toBeNull();
  });

  it("GET /breakdown carries exclusions and audit_tier", async () => {
    const res = await getBreakdown(new Request("http://localhost/api/v1/esg/breakdown"));
    const body = await res.json();
    assertMeta(body);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBeGreaterThan(0);
  });

  it("GET /efficiency-frontier, /trend, disclosure routes carry meta", async () => {
    for (const [fn, url] of [
      [getFrontier, "http://localhost/api/v1/esg/efficiency-frontier"],
      [getTrend, "http://localhost/api/v1/esg/trend"],
      [getMapping, "http://localhost/api/v1/esg/disclosure/mapping"],
      [getMethodology, "http://localhost/api/v1/esg/disclosure/methodology"],
    ] as const) {
      const res = await fn(new Request(url));
      assertMeta(await res.json());
    }
  });

  it("POST /disclosure/export includes exclusions, methodology, and no invented ADPe disclosure", async () => {
    const res = await postExport(new Request("http://localhost/api/v1/esg/disclosure/export", { method: "POST" }));
    const body = await res.json();
    assertMeta(body);
    expect(body.methodology).toBeTruthy();
    expect(body.mapping.every((row: { id: string }) => row.id !== "adpe")).toBe(true);
  });
});
