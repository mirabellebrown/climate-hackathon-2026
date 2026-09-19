import type { IsoEsgMappingRow } from "./types";

/**
 * ISO/IEC TR 20226 → ESG disclosure crosswalk.
 * Shared by API `/disclosure/mapping` and UI tooltips — keep in sync here only.
 */
export const ISO_ESG_MAPPING: readonly IsoEsgMappingRow[] = [
  {
    id: "gwp_operational",
    internal_metric: "GWP operational",
    iso_clause: "11.5.4",
    plain_english: "Operational carbon (grams of CO₂e from running the model to answer)",
    populates: "ESRS E1-6 Para 40(c) Scope 3 Cat 1; GRI 305-3; IFRS S2 para 29(a)(i); SASB TC-SI-110a.1",
    tier: "Average-data, location-based",
    posture: "Report",
  },
  {
    id: "gwp_embodied",
    internal_metric: "GWP embodied",
    iso_clause: "11.5.5",
    plain_english: "Embodied carbon (grams of CO₂e from hardware manufacturing, if separately reported)",
    populates: "Same lines, if material (>1% of Scope 3)",
    tier: "Average-data",
    posture: "Report with 3-year-lifetime caveat",
  },
  {
    id: "energy_total",
    internal_metric: "Energy total",
    iso_clause: "11.2.2",
    plain_english: "Electricity used for inference (watt-hours)",
    populates: "GRI 302-2",
    tier: "Average-data",
    posture: "Report",
  },
  {
    id: "ci_tok",
    internal_metric: "Carbon intensity per token",
    iso_clause: "11.5.2, 11.2.12",
    plain_english: "Carbon intensity: grams of CO₂e per 1,000 output tokens",
    populates: "ESRS E1-6 Para 47; GRI 305-4",
    tier: "Average-data",
    posture: "Report",
  },
  {
    id: "water_wcf",
    internal_metric: "Water (WCF)",
    iso_clause: "11.2.9",
    plain_english: "Water consumption for cooling and electricity (millilitres)",
    populates: "ESRS E3-3 and E3-5; GRI 303-3",
    tier: "Low to moderate",
    posture: "Report, E3 not E1, embodied water excluded",
  },
  {
    id: "primary_energy",
    internal_metric: "Primary energy (PE)",
    iso_clause: "Step 2 factors",
    plain_english: "Primary energy demand (megajoules; ÷ 3.6 → kWh)",
    populates: "GRI 302-2 (MJ / 3.6 = kWh)",
    tier: "Average-data",
    posture: "Report, do not double-count with GWP",
  },
  {
    id: "adpe",
    internal_metric: "ADPe",
    iso_clause: "Step 2 factors",
    plain_english: "Abiotic resource depletion (internal tracking only)",
    populates: "Nothing today",
    tier: "Average-data",
    posture: "Internal only",
    internal_only: true,
  },
  {
    id: "pue_wue",
    internal_metric: "PUE, WUE",
    iso_clause: "11.2.7, 11.2.9",
    plain_english: "Data-centre efficiency parameters (power and water usage effectiveness)",
    populates: "Methodology narrative",
    tier: "Supplier-specific / hybrid",
    posture: "Report as parameters",
  },
] as const;

/** Metrics we cannot calculate from EcoLogits midpoints — absent from UI. */
export const NOT_CALCULABLE = [
  "APU energy (11.2.5)",
  "Renewable Energy Factor (11.2.8)",
  "Energy-Precision Ratio (11.3.2)",
  "Supply chain metrics (11.4)",
] as const;
