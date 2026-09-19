# Impact methodology

Version: `2026-09-19-v2`, in `lib/factors.ts`, `lib/impact.ts`, and `lib/ecologits.ts`.

These are **order-of-magnitude inference estimates**, not measurements. Tokens come from provider usage metadata. Environmental figures come from [Code Carbon](https://codecarbon.io/)’s [EcoLogits](https://ecologits.ai/) HTTP API when available. API cost uses published Gemini paid-tier prices. No carbon neutrality, offsets, or trees-planted claims.

## API cost

USD is calculated from [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing) for the paid tier, prompts ≤ 200k tokens. Thinking tokens are billed as output. The classifier uses Flash Lite rates unless the 404 fallback model ran.

| Model | Input / 1M | Output / 1M |
| --- | --- | --- |
| Gemini 3.5 Flash Lite | $0.30 | $2.50 |
| Gemini 3.6 Flash | $0.75 | $3.75 |
| Gemini 3.1 Pro | $2.00 | $12.00 |
| Gemini 3.1 Flash Lite (classifier fallback only) | $0.25 | $1.50 |

```text
costUsd(model, I, O) = (I × inputRate + O × outputRate) / 1,000,000

generationUsd = costUsd(chosen model, answer input, answer output)
classifierUsd = costUsd(classifier model, classifier input, classifier output)
routedUsd = generationUsd + classifierUsd
baselineUsd = costUsd(Gemini Pro, answer input, answer output)
savedUsd = baselineUsd − routedUsd
savedCostPercent = 100 × savedUsd / baselineUsd
```

When answer token counts match, the remaining difference is the price of the large model versus the small one — the same comparison as Opus versus Haiku. The impact panel leads with this cost percentage.

## EcoLogits environmental estimates

We POST to `https://api.ecologits.ai/v1beta/estimations` with `provider: google_genai`, the Gemini model id, measured **output** tokens, optional request latency in seconds, and electricity mix zone `WOR` (world average). If EcoLogits has not listed a pinned id yet, we send the closest catalog name: `gemini-3.5-flash-lite` → `gemini-flash-lite-latest`, `gemini-3.6-flash` → `gemini-3.5-flash`. `gemini-3.1-pro-preview` is listed as-is. EcoLogits returns min/max intervals for energy (kWh), GWP (kgCO2eq), and water consumption (L). Displayed values are the midpoint:

```text
energyWh = 1000 × mean(energy.min, energy.max)
co2eGrams = 1000 × mean(gwp.min, gwp.max)
waterLiters = mean(wcf.min, wcf.max)
```

We request three estimates in parallel: classifier, chosen generation model, and Gemini Pro on the same generation output tokens (no second Pro call). Gasoline and trees still use EPA CO₂-mass equivalencies applied to EcoLogits GWP:

```text
gasolineGallons = co2eGrams / 8887
treeYears = co2eGrams / 60000
treeMinutes = treeYears × 525600
```

EcoLogits does not take input tokens. Architecture for several Gemini models is unpublished, so EcoLogits warns that precision is lower. If any EcoLogits request fails, every environmental figure for that prompt falls back to the homemade energy model below; USD is still computed from prices.

## Fallback energy model

Used only when EcoLogits is unreachable. The energy anchor is [Jegham et al. (2025), “How Hungry is AI?”](https://arxiv.org/abs/2505.09598), as fitted in the [claude-carbon methodology](https://github.com/gwittebolle/claude-carbon/blob/main/METHODOLOGY.md). Its 1× factors derive from modeled Claude 3.7 inference. We apply them to Gemini as a prototype: Flash = 1×, Flash Lite = 0.5×, Pro = 2×. They are not telemetry of Google serving energy.

- Medium (Flash) input: **0.000135 Wh/token**.
- Medium (Flash) output: **0.00288 Wh/token**, about 21.3× input.
- Scales: Flash Lite **0.5**, Flash **1**, Pro **2**, classifier (short Flash Lite JSON call) **0.25**.
- Carbon: **0.287 g CO₂e/Wh** (287 g/kWh).
- Water: **1.8 L/kWh**, a project-selected assumption for cooling and electricity combined.

```text
energyWh(I, O, s) = (I × 0.000135 + O × 0.00288) × s
```

Gasoline and trees use the same EPA factors as the EcoLogits path. Changes to frozen fallback factors or prices should bump the methodology version, separating incompatible browser totals.

## Worked example and regression gate

Gemini Flash Lite with **1,000 input + 1,000 output** tokens and a classifier with **200 input + 40 output**:

```text
generationUsd = 1000 × 0.30 / 1e6 + 1000 × 2.50 / 1e6 = $0.0028
classifierUsd = 200 × 0.30 / 1e6 + 40 × 2.50 / 1e6 = $0.00016
routedUsd = $0.00296
Pro counterfactual = 1000 × 2.00 / 1e6 + 1000 × 12 / 1e6 = $0.014
savedUsd = $0.01104 ≈ 78.8571% cheaper
```

Fallback energy for the same counts (Flash Lite 0.5×, classifier 0.25×, Pro 2×):

```text
generation = 1.5075 Wh
classifier = 0.03555 Wh
routed = 1.54305 Wh
Pro counterfactual = 6.03 Wh
savings ≈ 74.4104%
```

`tests/impact.test.ts` checks fallback energy, paid-tier cost, signed savings, invalid counts and zero baselines. `tests/ecologits.test.ts` mocks the EcoLogits HTTP API.

## Accounting boundaries

The baseline uses the **same generation token counts**, with no classifier or second request. Pro is assumed to produce a similar-length answer. Different answer quality, length, tokenization and reasoning behavior are not experimentally compared.

Gemini input includes system/schema overhead reported by the API. Output includes candidate and reported thinking tokens; Flash Lite thinking is disabled. A primary 404 can trigger the pinned Flash Lite fallback; only successful usage is available. V1 requests no caching and gives no energy or price discount to cache tokens. Missing/invalid usage produces an error, never an invented zero.

Session totals cover completed requests, including classifier cost and negative savings. Failed/disconnected attempts may use resources without a complete response and are excluded: this is not a billing ledger. Retries are disabled. No prompt/answer database exists; local storage holds request count, routed/baseline energy and USD sums, chosen vs Pro token totals, prompt text for the session log, and factor version. Answers are not stored.

Training, hardware manufacturing, user devices, networking and app hosting are excluded. EcoLogits and the fallback omit variation in hardware, batching, serving efficiency, grid/time/location, long-context decoding and water use. No confidence interval is claimed. The classifier can also make routing mistakes. These figures support exploring tradeoffs, not regulatory reporting or lifecycle assessment.
