import type { EsgExclusion } from "./types";

/**
 * Seven accounting exclusions — always visible on ESG views and exports.
 * Manager-readable one-liners; never invent values for these gaps.
 */
export const ESG_EXCLUSIONS: readonly EsgExclusion[] = [
  {
    id: "training",
    title: "Training-phase emissions",
    statement: "Model training and fine-tuning emissions are not included in these inference estimates.",
  },
  {
    id: "network",
    title: "Network and data transit",
    statement: "Internet transit, CDN, and API gateway energy between your browser and the provider are excluded.",
  },
  {
    id: "end_user_devices",
    title: "End-user devices",
    statement: "Laptops, phones, and office screens used to read answers are outside this boundary.",
  },
  {
    id: "embodied_water",
    title: "Embodied water in hardware",
    statement: "Water used to manufacture chips and servers is excluded; only operational water-consumption figures are shown when available.",
  },
  {
    id: "ewaste",
    title: "End-of-life and e-waste",
    statement: "Hardware disposal and e-waste impacts are not modelled.",
  },
  {
    id: "prefill",
    title: "Input-token (prefill) energy",
    statement: "EcoLogits estimates from output tokens; prompt/prefill energy is unmodelled and can understate real use when prompts are long.",
  },
  {
    id: "market_based_s2",
    title: "Market-based Scope 2",
    statement: "Figures use a location-based (average-grid) mix, not supplier market-based renewable claims.",
  },
] as const;

export const PREFILL_WARNING_MESSAGE =
  "Mean input tokens are more than 5× output tokens. Prefill energy is unmodelled, so energy and carbon figures likely understate actual consumption (large prompts can raise use by several times).";
