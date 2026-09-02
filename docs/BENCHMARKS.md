# Benchmarks

"Your 30-day growth is ahead of 82% of products your size." Cohort percentiles computed daily from stored deciles; no individual product value is ever persisted or exposed. Source: `convex/lib/benchmarks.ts`, `convex/daily.ts`, `convex/saas.ts` (`benchmarks`), `convex/public.ts` (`benchmarkHighlight`).

## Cohorts

Every rankable product (public, `verified`, not demo, not under review) is a member of three cohorts:

| Cohort key | Members |
|---|---|
| `all` | every rankable product |
| `cat:<slug>` | same category (15 fixed slugs in `src/lib/categories.ts`); products without a category are only in `all` and their size cohort |
| `size:<bucket>` | same total-user bucket |

Size buckets (`SIZE_BUCKETS` in `convex/lib/metrics.ts`, also the leaderboard `size` filter):

| Key | Label | Range (total users) |
|---|---|---|
| `0-100` | < 100 | 0 ≤ n < 100 |
| `100-1k` | 100 – 1K | 100 ≤ n < 1,000 |
| `1k-10k` | 1K – 10K | 1,000 ≤ n < 10,000 |
| `10k-100k` | 10K – 100K | 10,000 ≤ n < 100,000 |
| `100k+` | 100K+ | n ≥ 100,000 |

## Metrics

`BENCHMARK_METRICS = growth30dPct · newUsers30d · activationRatePct · growth7dPct · trendingScore7d`. A product contributes to a `(cohort, metric)` pair only when the value is a finite number, so the activation cohorts contain only products with an activation source.

### Conversion metrics (v0.5)

`signupToConvertedPct`, `activatedToConvertedPct`, `trialToConvertedPct` and `convertedGrowth30dPct` are benchmarked with the same cohorts and the same `MIN_SAMPLE`. Only **aggregate** definitions are compared (`BENCHMARK_METRIC_BASIS`): a cohort-verified conversion rate is never mixed into an aggregate decile set, and the public "Top X %" statement is emitted for a conversion metric only when the founder published `visibility.conversionRate`. Example insights: "Your signup-to-converted rate is 1.6× the median for SaaS with 1K–10K users." · "Your converted-user growth is in the top 10 % this month." Values are only present for products with a conversion source, so cohorts for these metrics are smaller and appear later.

## Minimum sample (`MIN_SAMPLE = 5`)

Below five members a `(cohort, metric)` aggregate is not computed, and an existing one is deleted. With two or three members a "median" is one specific competitor's number; five is the smallest size at which nine interpolated deciles stop being a lookup table of individual values. The constant is one line and the plan is to raise it to 10 once the public set is large enough that category cohorts still exist (see `docs/ASSUMPTIONS.md`).

## Storage: deciles only

`deciles(values)` sorts the values and returns nine points `p10 … p90` by linear interpolation at `pos = k/10 × (n − 1)`. `benchmarkAggregates` rows are `{ groupKey, metric, sampleSize, deciles[9], computedAt }`, indexed by `(groupKey, metric)`. Raw values are never written anywhere.

## Percentile of a product

`percentileOf(value, deciles)`:

- `value ≤ p10` → **5**; `value ≥ p90` → **95**.
- Otherwise find the decile band `[p(i), p(i+1)]` that contains it, interpolate `10·(i+1) + 10·frac`, and round to the nearest **5**.

The result is always in `5 … 95` in steps of 5. Rounding is deliberate: it avoids false precision and makes reverse-engineering neighbours harder. `medianMultiple(value, median)` = `value / p50` rounded to 0.1, `null` when the median is not positive.

## Insight sentences (`benchmarkInsight`)

For the owner dashboard and MCP:

| Percentile | Sentence |
|---|---|
| ≥ 80 | "Your `<metric>` is ahead of `P`% of `<cohort>`. Top `100 − P`%." |
| 50 – 75 with multiple ≥ 1.2 | "Your `<metric>` is ahead of `P`% of `<cohort>`. `M`× the median." |
| 50 – 75 otherwise | "Your `<metric>` is ahead of `P`% of `<cohort>`." |
| < 50 | "Your `<metric>` is behind `100 − P`% of `<cohort>`." (+ multiple when ≥ 1.2, which cannot happen below the median) |

Metric labels: `30-day growth`, `7-day growth`, `new users (30d)`, `activation rate`, `trending score`.

## Public statement policy

`publicBenchmarkStatement` returns a sentence only for the **top quarter** (`percentile ≥ 75`): "Top `100 − P`% `<metric>` in `<cohort>`". Below that it returns `null`, so a public page never says where a weaker product stands.

`public.benchmarkHighlight(slug)` picks the statement shown on the product page and in `GET /api/v1/saas/{slug}/benchmarks`:

1. Only for public, verified, non-demo products that are not under review.
2. Cohorts are tried in order **category → size → all**; within the first cohort that yields any statement, the metric with the highest percentile wins (`growth30dPct`, `activationRatePct`, `newUsers30d` are considered).
3. The result names the cohort ("Developer Tools", "products with 1K – 10K users", "all SaaS on UserTrack") and its `sampleSize`, never any member.

## Dashboard cards (`saas.benchmarks`)

Owner-only, private. Returns `{ eligible, minSample, cards[] }` where `eligible = isPublic && verified && !demo`. One card per `(cohort, metric)` that has an aggregate:

| Field | Content |
|---|---|
| `group`, `groupLabel`, `groupShort` | `all` / `cat:<slug>` / `size:<bucket>` and labels |
| `metric`, `metricLabel`, `value` | the product's current value |
| `percentile`, `sampleSize`, `computedAt` | from the stored aggregate |
| `median`, `p10`, `p90`, `medianMultiple` | context for the bar |
| `previousValue` | only for `newUsers30d` (`newUsersPrev30d`) |
| `insight` | sentence from `benchmarkInsight` |

Cohorts below `MIN_SAMPLE` simply have no card; the UI shows a "not enough data" state.

## API and MCP

| Surface | Returns |
|---|---|
| `GET /api/v1/saas/{slug}/benchmarks` | `{ slug, highlight: { statement, metric, cohort, percentile, sampleSize } \| null, note? }` — public statement only |
| MCP `usertrack_get_benchmark` (`metrics:read`, owner's project) | `{ eligible, minCohortSize, cards[] { cohort, metric, metricLabel, value, percentile, median, p10, p90, medianMultiple, sampleSize, insight }, note?, hiddenGemRules }` — full private view |
| Dashboard `/app/saas/[id]` | cards above |
| Public page `/s/[slug]` | the highlight statement |

## Privacy analysis

- What is stored: nine interpolated deciles and a count per cohort and metric, recomputed daily. Not stored: any product's value in any aggregate.
- What is public: at most one sentence per product, only for the top quarter, naming a cohort and its size. Weak positions are invisible.
- What the owner sees: their own percentile (steps of 5), the median and the p10/p90 of cohorts with ≥ 5 members. A member who knows its own value can bound its neighbours to a decile band; with `n = 5` the deciles are interpolations between adjacent sorted members, which is the reason for the planned move to `MIN_SAMPLE = 10`.
- Excluded from every cohort: demo rows, self-reported (manual / foreign endpoint) products, drafts, products under review.

## Hidden gems (discovery, for reference)

Not a benchmark, but the other place cohort-style rules are public. `HIDDEN_GEM_RULES` in `convex/public.ts`: verified, not demo, `totalUsers < 1000`, `newUsers7d ≥ 10`, `growth7dPct ≥ 10`, at least 7 days of history, `trustScore ≥ 60`; sorted by 7-day growth, top 5. The rules are returned with the section (`hiddenGemRules`) so the list is explainable.

## Daily job

`crons.ts` runs the daily sweep at **03:30 UTC** → `daily.run` (milestones, streaks, rank history) → `scheduler.runAfter(0, daily.benchmarks)` → then the trust review (+5 s) and the quiet-product email sweep (+10 s).

`daily.benchmarks`: collect rankable products → build the three cohort memberships per product → for every `(cohort, metric)`: filter finite values; `< MIN_SAMPLE` → delete any existing aggregate; else upsert `{ sampleSize, deciles, computedAt }`. Run it manually with `npx convex run daily:benchmarks` (or `daily:run` for the whole sweep).
