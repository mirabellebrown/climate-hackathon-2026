# AI Environmental Reporting (ISO/ESG) — GreenRoute

## Step 1 — Look before you build

GreenRoute is a Next.js 16 App Router app (Gemini classify → route → generate) with paid-tier USD in `lib/impact.ts` (`costUsd` / `compareCost` over **input and output** tokens) and EcoLogits environmental midpoints in `lib/ecologits.ts`. EcoLogits `POST /v1beta/estimations` returns `impacts.energy` (kWh), `impacts.gwp` (kgCO2eq), and `impacts.wcf` (L); we convert midpoints to `Footprint.energyWh`, `Footprint.co2eGrams`, and `Footprint.waterLiters` (Wh, g, L). ISO intensity metrics use **output tokens** (`tokens_out`); cost is priced on input+output, so we carry `tokens_per_dollar_output` (T/C on output tokens) and `tokens_per_dollar_total` ((Tin+Tout)/C) as distinct fields—never average ratios. Prototype org model: one browser session = one team (`team_id: browser-session`), managers use `/dashboard` and `/reports/esg` on that same localStorage-backed session; no multi-user DB.

## Storage units

Per-request ESG records store grams, watt-hours, and millilitres. Convert to tCO2e / MWh / m³ only at display and export. Usage and embodied GWP stay separate; onsite and offsite water stay separate. EcoLogits currently returns undivided GWP and WCF—those land in `gwp_usage_g` and `water_ml_onsite` with `gwp_embodied_g` / `water_ml_offsite` / `pe_mj` / `adpe_kgsbeq` left null (labelled data gaps, never invented).
