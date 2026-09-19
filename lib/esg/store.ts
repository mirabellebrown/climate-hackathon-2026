import "server-only";
import { DEFAULT_TEAM_ID, ECOLOGITS_VERSION, ESG_FACTOR_VERSION, ESG_PROVIDER, ESG_REGION } from "./constants";
import type { EsgRequestRecord } from "./types";

const globalStore = globalThis as typeof globalThis & {
  __greenrouteEsgRecords?: EsgRequestRecord[];
};

function bucket(): EsgRequestRecord[] {
  if (!globalStore.__greenrouteEsgRecords) {
    globalStore.__greenrouteEsgRecords = seedDemoRecords();
  }
  return globalStore.__greenrouteEsgRecords;
}

/** Demo rows so `/reports/esg` and APIs are usable before live traffic. */
function seedDemoRecords(): EsgRequestRecord[] {
  const base = new Date();
  const day = (offset: number) => new Date(base.getTime() - offset * 86_400_000).toISOString();
  const note = [
    "Demo seed: undivided GWP in gwp_usage_g; embodied null.",
    "Demo seed: WCF as water_ml_onsite; offsite null.",
  ];
  const mk = (
    partial: Omit<EsgRequestRecord, "ecologits_version" | "factor_version" | "audit_tier" | "audit_notes" | "environmental_source" | "team_id" | "provider" | "region" | "pe_mj" | "adpe_kgsbeq" | "gwp_embodied_g" | "water_ml_offsite" | "latency_s"> & {
      gwp_embodied_g?: number | null;
    },
  ): EsgRequestRecord => ({
    provider: ESG_PROVIDER,
    region: ESG_REGION,
    team_id: DEFAULT_TEAM_ID,
    pe_mj: null,
    adpe_kgsbeq: null,
    gwp_embodied_g: partial.gwp_embodied_g ?? null,
    water_ml_offsite: null,
    latency_s: 1.2,
    ecologits_version: ECOLOGITS_VERSION,
    factor_version: ESG_FACTOR_VERSION,
    audit_tier: "average-data",
    audit_notes: note,
    environmental_source: "ecologits",
    ...partial,
  });

  return [
    mk({
      id: "demo_flash_lite_1",
      created_at: day(2),
      model: "gemini-3.5-flash-lite",
      gwp_usage_g: 0.12,
      energy_wh: 0.45,
      water_ml_onsite: 800,
      tokens_in: 800,
      tokens_out: 400,
      cost_usd: 0.00124,
    }),
    mk({
      id: "demo_flash_1",
      created_at: day(1),
      model: "gemini-3.6-flash",
      gwp_usage_g: 0.48,
      energy_wh: 1.6,
      water_ml_onsite: 2_800,
      tokens_in: 1_200,
      tokens_out: 900,
      cost_usd: 0.004275,
    }),
    mk({
      id: "demo_pro_1",
      created_at: day(0),
      model: "gemini-3.1-pro-preview",
      gwp_usage_g: 2.1,
      energy_wh: 6.5,
      water_ml_onsite: 11_000,
      tokens_in: 2_000,
      tokens_out: 1_500,
      cost_usd: 0.022,
    }),
    mk({
      id: "demo_flash_lite_2",
      created_at: day(0),
      model: "gemini-3.5-flash-lite",
      gwp_usage_g: 0.09,
      energy_wh: 0.32,
      water_ml_onsite: 600,
      tokens_in: 500,
      tokens_out: 350,
      cost_usd: 0.001025,
    }),
  ];
}

export function listEsgRecords(): EsgRequestRecord[] {
  return [...bucket()];
}

export function appendEsgRecord(record: EsgRequestRecord): void {
  const store = bucket();
  if (store.some((r) => r.id === record.id)) return;
  store.push(record);
}

export function appendEsgRecords(records: EsgRequestRecord[]): number {
  let added = 0;
  for (const record of records) {
    const before = bucket().length;
    appendEsgRecord(record);
    if (bucket().length > before) added += 1;
  }
  return added;
}

export function clearEsgRecords(): void {
  globalStore.__greenrouteEsgRecords = [];
}

export function resetEsgDemoSeed(): void {
  globalStore.__greenrouteEsgRecords = seedDemoRecords();
}
