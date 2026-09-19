# Impact methodology

Version: `2026-09-19-v1`, in `lib/factors.ts` and `lib/impact.ts`.

These are **order-of-magnitude inference estimates**, not measurements. Tokens come from provider usage metadata; environmental factors are assumptions. No carbon neutrality, offsets, or trees-planted claims.

## Factors and provenance

The energy anchor is [Jegham et al. (2025), “How Hungry is AI?”](https://arxiv.org/abs/2505.09598), as fitted in the [claude-carbon methodology](https://github.com/gwittebolle/claude-carbon/blob/main/METHODOLOGY.md). Its Sonnet factors derive from modeled Claude 3.7 inference, not direct telemetry of the current models. We freeze these rounded prototype coefficients:

- Sonnet input: **0.000135 Wh/token**.
- Sonnet output: **0.00288 Wh/token**, about 21.3× input.
- Scales: Haiku **0.5**, Sonnet **1**, Opus **2**, Flash Lite **0.25**. Haiku/Opus are extrapolations; Flash Lite is a project assumption. All are unverified for the pinned current models.
- Carbon: **0.287 g CO₂e/Wh** (287 g/kWh). The same static intensity is applied to both providers; their actual grids/locations are unknown.
- Water: **1.8 L/kWh**, a project-selected assumption for cooling and electricity combined. This is **not** the current claude-carbon water factor, which lists 0.18 L/kWh on-site and 5.11 L/kWh off-site. We neither add these to 1.8 nor claim the coefficient is measured for either provider.
- Gasoline: **8,887 g CO₂/US gallon**, from [EPA equivalencies](https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references).
- Trees: **60,000 g CO₂/urban tree-year**, from the same EPA reference. That annual average assumes trees growing over ten years; a newly planted seedling does not immediately absorb this amount. A year is **525,600 minutes** here.

Upstream sources may change. Changes to frozen factors should bump the methodology version, separating incompatible browser totals.

## Equations

For input tokens `I`, output tokens `O`, multiplier `s`:

```text
energyWh(I, O, s) = (I × 0.000135 + O × 0.00288) × s

generationWh = energyWh(Claude input, Claude output, chosen scale)
classifierWh = energyWh(Gemini input, Gemini output, 0.25)
routedWh = generationWh + classifierWh

baselineWh = energyWh(Claude input, Claude output, 2)
savedWh = baselineWh − routedWh
savedPercent = 100 × savedWh / baselineWh
```

A zero baseline gives a `null` percentage, displayed as a dash. Negative savings mean extra impact. Energy, emissions, and water percentages coincide because the conversion factors are linear and shared.

```text
co2eGrams = energyWh × 0.287
waterLiters = energyWh / 1000 × 1.8
gasolineGallons = co2eGrams / 8887
treeYears = co2eGrams / 60000
treeMinutes = treeYears × 525600
```

The UI displays water in mL, both tree-year fractions and tree-minutes, and scientific notation for very small nonzero values. Fuel/trees are illustrative CO₂-mass equivalents to estimated CO₂e, not consumption or physical compensation. Intermediate values are not rounded. No additional PUE multiplier is applied.

## Worked example and regression gate

Sonnet with **1,000 input + 1,000 output** tokens:

```text
generation = 0.135 + 2.88 = 3.015 Wh
generation emissions = 0.865305 g CO₂e
generation water = 0.005427 L = 5.427 mL
```

This is within 1% of the source's **2.989 Wh** reference. For a classifier with **200 input + 40 output** tokens:

```text
classifier = (0.027 + 0.1152) × 0.25 = 0.03555 Wh
routed = 3.05055 Wh
Opus counterfactual = 6.03 Wh
savings = 2.97945 Wh ≈ 49.4104%
```

With those same token counts routed to Opus: **6.06555 Wh** routed and **−0.03555 Wh** saved, approximately **0.5896% extra impact**. `tests/impact.test.ts` checks these values, conversions, signed savings, invalid counts and zero baselines.

## Accounting boundaries

The baseline uses the **same generation token counts**, with no classifier or second request. Opus is assumed to produce a similar-length answer. Different answer quality, length, tokenization and reasoning behavior are not experimentally compared.

Gemini input includes system/schema overhead reported by the API. Output includes candidate and reported thinking tokens; 2.5 thinking is disabled. A primary 404 can trigger the pinned Flash Lite fallback; only successful usage is available. Claude input/output counts include any cache input fields. V1 requests no caching and gives no energy discount to cache tokens. Missing/invalid usage produces an error, never an invented zero.

Session totals cover completed requests, including classifier cost and negative savings. Failed/disconnected attempts may use resources without a complete response and are excluded: this is not a billing ledger. Both SDKs have retries disabled. No prompt/answer database exists; local storage holds request count, routed/baseline energy sums and factor version.

Training, hardware manufacturing, user devices, networking and app hosting are excluded. The factors omit variation in hardware, batching, serving efficiency, grid/time/location, long-context decoding and water use. No confidence interval is claimed. The classifier can also make routing mistakes. These figures support exploring tradeoffs, not regulatory reporting or lifecycle assessment.
