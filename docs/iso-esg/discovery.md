# ISO/IEC TR 20226 → ESG reporting: Phase 0 discovery

Branch `feat/iso-esg-reporting`, from `main` at `ccafde9`. Written 2026-09-19, before any code.

## Stack

| Item | Found |
| --- | --- |
| Language / framework | TypeScript 6, Next.js 16.3 App Router, React 19.3, Node ≥ 22 |
| Database / ORM | **None.** State is in memory (`lib/activity.ts`) plus browser `localStorage` |
| Tests | Vitest 5 (unit, API, launcher), Playwright 1.63 (browser, run with system Chrome) |
| Charting | **None.** Existing charts are hand-built HTML/CSS bars (`components/impact-panel.tsx`) |
| Styling | Tailwind 4 import plus hand-written CSS tokens in `app/globals.css` (cream/forest palette, Georgia serif headings). **No dark mode.** |
| Other | `lucide-react` icons, `react-markdown`, `@google/genai` (classifier) |

## EcoLogits ingestion path

**Does not exist.** Canopy never runs EcoLogits. Its impact figures come from its own frozen factors (`lib/factors.ts`, Jegham et al. via claude-carbon), a different methodology. There are no fields for GWP usage/embodied, ADPe, PE or water split. Canopy estimates water as a single prototype 1.8 L/kWh.

**Consequence.** The spec forbids new estimation science, and Canopy's Jegham factors are not EcoLogits output. So the ESG module **must not convert Canopy's own runs into ESG records**. Doing so would fabricate EcoLogits values. Instead:

- The canonical record (spec §3) becomes the **single ingestion target**: `POST /api/v1/esg/records` accepts records produced by an EcoLogits integration (SDK wrapper, gateway, or batch job) owned elsewhere.
- A **clearly labeled sample dataset** makes the section viewable before any real ingestion. Every view and export shows a "Sample data" banner while it's active. It is not presented as anyone's real figures.
- Wiring EcoLogits (the Python package `ecologits` isn't installed here) into Canopy's launcher and chat is a separate, later task.

### Available EcoLogits source: the public EcoLogits API

Found via [marmelab/ecologits-vscode](https://github.com/marmelab/ecologits-vscode), which reports Claude Code session impacts this way. We probed the API live on 2026-09-19:

- `POST https://api.ecologits.ai/v1beta/estimations` takes `{provider, model_name, output_token_count, request_latency?, electricity_mix_zone?}`. The zone is ISO-3166-1 **alpha-3**, and defaults to `WOR`, the world average. API version `0.0.2beta`.
- The response has **min/max ranges**, not point estimates. Totals and a `usage`/`embodied` split cover `gwp` (kgCO2eq), `adpe` (kgSbeq) and `pe` (MJ). `energy` (kWh) and `wcf` (L) are usage only. A `warnings` array includes `model-arch-not-released` for proprietary models, which maps to `estimate_confidence: low`.
- **Water arrives as one WCF total.** There's no on-site/off-site split, which the spec's schema requires. There's also no PUE, WUE, library-version or benchmark-date field.
- **Model coverage.** `claude-haiku-4-5` is registered. `claude-sonnet-5` and `claude-opus-5`, Canopy's medium and heavy routes, return `model-not-registered`. Runs on unregistered models must be reported as a labeled gap, never mapped to a different model.

The core module is therefore built against the canonical record plus a labeled sample dataset. A Canopy→EcoLogits API adapter is a follow-up that must resolve the water split and version gaps explicitly.

## Token and cost layer

**There is no tokens-per-dollar metric in the repo.** Canopy tracks tokens (input incl. cache, output) but never cost. Claude Code's JSON does report `costUSD` per model; it isn't stored today.

Decision: TPD is introduced here from the canonical record's `cost.amount` (USD) and **`call.tokens_out`**. Following the spec's rule, both `tokens_in` and `tokens_out` are carried and named explicitly. Every ISO intensity uses `tokens_out`, and TPD is labeled "output tokens per dollar". No currency conversion: v1 accepts `USD` only and rejects other currencies at ingestion rather than guessing rates. Rounding happens only at display and export.

## Identity and org model

**None.** Canopy is a single-user local tool with no auth, users, teams or cost centers. The canonical record carries `org.{user_id, team_id, cost_center, manager_id}` as supplied by the upstream integration. "Manager scope" here means filtering by `team_id` (or the whole org). With no second hierarchy to reuse, none is invented. Access control must come from the host platform before any multi-user deployment.

## Existing dashboards and design primitives

Reused: the page shell, header, `panel-heading`, `eyebrow`, tier-badge pill shape, footer, and the cream/forest surfaces and ink tokens. Charts follow the dataviz skill's reference palette. Its categorical slots 1–3 (blue, orange, aqua) were validated against Canopy's surface `#fffefa` (light) and `#1a1a19` (dark), all-pairs. CVD and normal-vision floors PASS. Light-mode aqua contrast is a WARN, relieved by direct labels plus the table view. Provider colors are fixed by entity, not rank. The ESG section adds its own scoped dark-mode tokens, since the app has none.

## Adaptations to the spec (and why)

| Spec says | Here | Reason |
| --- | --- | --- |
| `iso_esg_registry.yaml`, `exclusions.yaml` | `lib/esg/registry.json`, `lib/esg/exclusions.json` | No YAML parser dependency; the JSON is still versioned data read by API and UI |
| Materialized rollups | Deterministic rollups computed from the immutable record log per request | No database; volumes are small. Rollups are pure functions of (records, factor version), so they're recomputable and reproducible, which is the property the spec needs |
| Factor-set versioning | Each record keeps the `ecologits.factor_version` that produced it, plus benchmark and grid vintages. Nothing is ever rewritten. Every response lists the factor versions in scope, and the trend annotates the month a version changes | EcoLogits values can't be recomputed without re-running EcoLogits, so a lineage is the set of records produced under one factor set. Published figures stay reproducible from the immutable log |
| Stack-specific storage | Append-only JSONL at `.canopy/esg/` (already git-ignored) | Consistent with the no-database v1 |
| Cost currencies | USD only | No FX source; conversion would be invented |
| Additive index decomposition | Sequential shift-share (baseline intensities for mix, current shares for intensity), exact with no residual | "Standard additive" method that sums exactly to the observed change, including new models with no baseline |
| Export PDF/XLSX | `pdf-lib` and `exceljs` | Pure JS, server-side, no native deps |
