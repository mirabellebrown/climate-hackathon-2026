# Impact methodology

Version: `2026-09-19-v1`, in `lib/factors.ts` and `lib/impact.ts`.

These are **order-of-magnitude inference estimates**, not measurements. Tokens come from Gemini usage metadata and Claude Code’s reported `modelUsage`; environmental factors are assumptions. No carbon neutrality, offsets, or trees-planted claims.

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

For each model m that Claude Code reports in modelUsage:
  I_m = inputTokens + cacheReadInputTokens + cacheCreationInputTokens
  O_m = outputTokens
generationWh = Σ energyWh(I_m, O_m, scale of m's family)
classifierWh = energyWh(Gemini input, Gemini output, 0.25)
routedWh = generationWh + classifierWh

baselineWh = energyWh(Σ I_m, Σ O_m, 2)
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

**What counts as a run.** A `canopy` run is one `claude -p` invocation. Claude Code can make several model calls in it: tool-use turns, subagents, or background tasks on another model. Canopy uses the per-model `modelUsage` totals that Claude Code prints in its JSON result. Each model is priced by the family Claude Code actually reported (Haiku, Sonnet or Opus). A model with no factor, such as a new family, is rejected, never guessed. The dashboard flags runs where the reported models differ from the selection.

**Cache tokens.** Claude Code sends a large, cached system prompt with every request, about 28–38k tokens in our checks with Claude Code 2.1.270. Canopy counts cache reads and cache writes at the **full input rate**. That is a conservative choice: serving a cache hit likely costs less energy than fresh prefill, but no published factor quantifies it. As a result, short prompts are dominated by this fixed overhead. A one-line Haiku answer is about 2.5 Wh here, most of it cached context. Treat per-run figures as upper-bound estimates. Web chat runs Claude Code with tools and MCP disabled, which cuts this overhead to about 7k tokens per message. A short Haiku reply is then about 0.75 Wh. The relative comparison with Opus is unaffected, because the baseline uses the same tokens.

**Baseline.** The baseline uses the **same token counts** at Opus factors, with no classifier and no second run. Opus is assumed to do similar-length work. Answer quality, length, tool use and reasoning are not compared experimentally.

**Classifier.** Gemini input includes system/schema overhead reported by the API. Output includes candidate and reported thinking tokens; the 3.1 primary runs with minimal thinking and the 2.5 fallback with thinking disabled. A primary-model 404 can trigger the pinned fallback. Missing or invalid usage from either provider produces an error, never an invented zero.

**Failures.** Failed, cancelled, dry-run, or unreported runs are shown but excluded from totals, even though they may have used resources. Runs that never report back are marked failed after an hour. This is not a billing ledger. The server keeps numeric activity in memory only. The browser stores counts, energy sums, counted routing IDs and the factor version, never prompts or answers.

Training, hardware manufacturing, user devices, networking and app hosting are excluded. The factors omit variation in hardware, batching, serving efficiency, cache economics, grid, time, location and water use. No confidence interval is claimed. The classifier can also make routing mistakes. These figures support exploring tradeoffs, not regulatory reporting or lifecycle assessment.
