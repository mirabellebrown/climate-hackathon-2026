import { FACTORS } from "@/lib/factors";

/** Prototype: one browser session = one team. */
export const DEFAULT_TEAM_ID = "browser-session";

/** EcoLogits HTTP API package lineage we pin against for disclosure. */
export const ECOLOGITS_VERSION = "ecologits-api-v1beta-2026-09";

/** Grid / factor lineage for Average-data estimates (location-based, world mix WOR). */
export const ESG_FACTOR_VERSION = FACTORS.version;

export const ESG_PROVIDER = "google_genai";
export const ESG_REGION = "WOR";

/** Prefill understatement flag when mean(tokens_in)/mean(tokens_out) exceeds this. */
export const PREFILL_RATIO_WARN = 5;
