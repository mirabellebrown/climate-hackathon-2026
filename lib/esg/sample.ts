import { classify } from "./validate";
import type { EsgRecord, Provider } from "./types";

// SAMPLE DATA ONLY. Illustrative per-request records shaped like EcoLogits output so the section
// can be explored before a real integration posts records. The values are not EcoLogits results
// and not any organization's figures; every view and export labels them as sample data.

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SampleModel { provider: Provider; model: string; proprietary: boolean; region: string; whPerTok: number; priceIn: number; priceOut: number; pue: number; wue: number; offsiteLPerKwh: number; grid: number; latencyPerTok: number }
const MODELS: SampleModel[] = [
  { provider: "anthropic", model: "claude-haiku-4-5", proprietary: true, region: "US", whPerTok: 0.0009, priceIn: 1, priceOut: 5, pue: 1.14, wue: 0.18, offsiteLPerKwh: 3.1, grid: 380, latencyPerTok: 0.006 },
  { provider: "anthropic", model: "claude-sonnet-5", proprietary: true, region: "US", whPerTok: 0.0026, priceIn: 3, priceOut: 15, pue: 1.14, wue: 0.18, offsiteLPerKwh: 3.1, grid: 380, latencyPerTok: 0.012 },
  { provider: "openai", model: "gpt-4o-mini", proprietary: true, region: "US", whPerTok: 0.0007, priceIn: 0.15, priceOut: 0.6, pue: 1.2, wue: 0.3, offsiteLPerKwh: 3.1, grid: 380, latencyPerTok: 0.005 },
  { provider: "openai", model: "gpt-4.1", proprietary: true, region: "US", whPerTok: 0.003, priceIn: 2, priceOut: 8, pue: 1.2, wue: 0.3, offsiteLPerKwh: 3.1, grid: 380, latencyPerTok: 0.013 },
  { provider: "google", model: "gemini-2.5-flash", proprietary: true, region: "FR", whPerTok: 0.0008, priceIn: 0.3, priceOut: 2.5, pue: 1.09, wue: 0.2, offsiteLPerKwh: 1.7, grid: 55, latencyPerTok: 0.005 },
  { provider: "google", model: "gemma-3-27b", proprietary: false, region: "FI", whPerTok: 0.0012, priceIn: 0.1, priceOut: 0.4, pue: 1.09, wue: 0.2, offsiteLPerKwh: 1.2, grid: 80, latencyPerTok: 0.008 },
];

// Team usage profiles: input/output ratio and model mix before and after a mid-period shift.
const TEAMS = [
  { team: "support", manager: "mgr-avery", costCenter: "CC-210", ratio: 1.6, outMean: 350, perDay: 14, early: [4, 0, 4, 0, 1, 1], late: [6, 0, 1, 0, 2, 1] },
  { team: "engineering", manager: "mgr-jordan", costCenter: "CC-340", ratio: 8.5, outMean: 700, perDay: 10, early: [1, 3, 0, 4, 0, 0], late: [2, 4, 0, 1, 1, 0] },
  { team: "research", manager: "mgr-riley", costCenter: "CC-120", ratio: 3.2, outMean: 900, perDay: 5, early: [0, 2, 0, 1, 2, 3], late: [0, 2, 0, 1, 3, 3] },
];

const FACTOR_SETS = [
  { until: "2026-06-01", version: "0.8.1", factor: "ecologits-0.8.1|mlenergy-2025-05|owid-2024|lifetime-3y", mlDate: "2025-05", grid: "OWID 2024", scale: 1 },
  { until: "9999-12-31", version: "0.9.0", factor: "ecologits-0.9.0|mlenergy-2025-10|owid-2025|lifetime-3y", mlDate: "2025-10", grid: "OWID 2025", scale: 0.92 },
];

function pick(weights: number[], r: number) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let index = 0; index < weights.length; index++) { x -= weights[index]; if (x <= 0) return index; }
  return weights.length - 1;
}

export const SAMPLE_START = "2026-03-01";
export const SAMPLE_END = "2026-09-01";

export function sampleRecords(): EsgRecord[] {
  const random = mulberry32(20260919);
  const records: EsgRecord[] = [];
  let seq = 0;
  for (let day = new Date(`${SAMPLE_START}T00:00:00Z`); day.toISOString() < `${SAMPLE_END}T00:00:00.000Z`; day = new Date(day.getTime() + 86_400_000)) {
    const progress = (day.getTime() - Date.parse(SAMPLE_START)) / (Date.parse(SAMPLE_END) - Date.parse(SAMPLE_START));
    const iso = day.toISOString().slice(0, 10);
    const factors = FACTOR_SETS.find((set) => iso < set.until)!;
    for (const team of TEAMS) {
      const count = Math.round(team.perDay * (1 + progress * 0.6) * (0.8 + random() * 0.4));
      for (let index = 0; index < count; index++) {
        const weights = team.early.map((early, slot) => early + (team.late[slot] - early) * progress);
        const spec = MODELS[pick(weights, random())];
        const tokensOut = Math.max(20, Math.round(team.outMean * (0.4 + random() * 1.2)));
        const tokensIn = Math.round(tokensOut * team.ratio * (0.6 + random() * 0.8));
        const energy = tokensOut * spec.whPerTok * factors.scale;
        const usage = energy / 1000 * spec.grid;
        const latency = tokensOut * spec.latencyPerTok;
        const embodied = usage * (0.08 + random() * 0.05);
        const ts = new Date(day.getTime() + Math.floor(random() * 86_400_000)).toISOString();
        records.push(classify({
          request_id: `sample-${String(++seq).padStart(6, "0")}`,
          ts_utc: ts,
          org: { user_id: `user-${team.team}-${1 + Math.floor(random() * 6)}`, team_id: team.team, cost_center: team.costCenter, manager_id: team.manager },
          call: { provider: spec.provider, model: spec.model, model_is_proprietary: spec.proprietary, region: spec.region, latency_s: latency, tokens_in: tokensIn, tokens_out: tokensOut },
          cost: { currency: "USD", amount: (tokensIn * spec.priceIn + tokensOut * spec.priceOut) / 1e6, source: "provider_price_list" },
          ecologits: {
            version: factors.version, factor_version: factors.factor, ml_energy_benchmark_date: factors.mlDate, grid_mix_vintage: factors.grid, hardware_lifetime_years: 3,
            energy_wh: energy, gwp_usage_g: usage, gwp_embodied_g: embodied, adpe_kgsbeq: energy * 2.1e-8, pe_mj: energy * 0.0036 * 2.4 + embodied * 0.012,
            water_ml_onsite: energy * spec.wue, water_ml_offsite: energy * spec.offsiteLPerKwh, pue: spec.pue, wue_onsite_l_per_kwh: spec.wue,
            grid_intensity_source: `${factors.grid} national average (${spec.region})`, estimate_confidence: spec.proprietary ? "low" : "moderate",
          },
          supplier_override: { applied: false, source: "", fields: [] },
        }, []));
      }
    }
  }
  return records.sort((a, b) => a.ts_utc.localeCompare(b.ts_utc));
}
