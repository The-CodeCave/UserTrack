# Benchmarks

**TL;DR** — "Top 12 % activation among AI SaaS with 1K–10K users." Cohort percentiles are computed daily from stored deciles over verified public products, across category, size, category × size, platform and age cohorts; no individual value of another product is ever stored or shown; cohorts need **10** members; a weekly standings history makes "up from Top 27 % last month" possible. Source: `convex/lib/benchmarks.ts` (pure rules), `convex/domain/benchmarks.ts` (cards, history, public highlight), `convex/daily.ts` (`benchmarks`), `convex/saas.ts` (`benchmarks`), `convex/public.ts` (`benchmarkHighlight`, `benchmarkHistory`).

## Cohorts (`cohortsFor`)

Every rankable product (public, `verified`, not demo, not under review) belongs to these cohorts, in this order of preference:

| Key | Members | Label example |
|---|---|---|
| `cat:<slug>` | same category | "AI SaaS" |
| `cat:<slug>\|size:<bucket>` | same category **and** size bucket | "AI SaaS with 1K – 10K users" |
| `size:<bucket>` | same total-user bucket | "products with 1K – 10K users" |
| `platform:<web\|mobile\|hybrid>` | same project type (`web` when unset) | "mobile apps" |
| `age:<bucket>` | same **product age**, only when the founder entered a founding month (`saas.foundedAt`) | "products founded 1–2 years ago" |
| `tracked:<bucket>` | same **tracking age** (`firstSnapshotAt`), used only when no founding date exists | "products tracked on UserTrack for 6–12 months" |
| `all` | every rankable product | "all SaaS on UserTrack" |

Product age and tracking age are two separate cohort families with separate labels; they are never mixed, so a cohort's meaning is always one definition (`describeCohort(key)` returns the sentence used in tooltips and the API).

Size buckets (`SIZE_BUCKETS`, also the board `size` filter): `0-100`, `100-1k`, `1k-10k`, `10k-100k`, `100k+`. The brief's finer buckets (101–500, 501–1k, 1k–5k, …) were evaluated and not adopted yet: with today's public set they would only split cohorts below the sample floor and they would break existing filter URLs and share cards; revisit when a bucket exceeds ~200 members (`docs/ASSUMPTIONS.md`).

Age buckets (`AGE_BUCKETS`): `lt3m` (< 90 days), `3-6m`, `6-12m`, `1-2y`, `2y+`.

## Metrics (`BENCHMARK_METRICS`)

| Metric | Definition | Requires |
|---|---|---|
| `growth30dPct`, `growth7dPct` | user growth % in the window | — |
| `newUsers30d` | new users, 30 days | — |
| `acceleration30dPct` | `(new30d − prev30d) / prev30d`, previous window ≥ 10 users | 60 days of history |
| `activationRatePct` | activated ÷ users | activation source |
| `trendingScore7d` | `docs/TRENDING.md` | — |
| `signupToConvertedPct`, `activatedToConvertedPct`, `trialToConvertedPct`, `convertedGrowth30dPct` | conversion rates / growth | conversion source; public statements only when the founder published the rate |

Only equivalent definitions are compared (`BENCHMARK_METRIC_BASIS`: every stored metric is an aggregate ratio or count — cohort-verified conversion figures are never mixed in). A product contributes to a `(cohort, metric)` pair only when `benchmarkValue(product, metric)` is a finite number, so activation cohorts contain only products with an activation source.

## Minimum sample (`MIN_SAMPLE = 10`, `MIN_SAMPLE_CONVERSION = 10`)

Below ten members a `(cohort, metric)` aggregate is not computed and an existing one is deleted, so no card, statement, history row or feed event can be derived from it. Ten is the smallest size at which nine interpolated deciles stop being a lookup table of individual values (v0.4–v0.8 used 5 while the public set was tiny; the constant is one line).

## Storage: deciles only + weekly standings

`deciles(values)` returns nine points `p10 … p90` by linear interpolation. `benchmarkAggregates { groupKey, metric, sampleSize, deciles[9], computedAt }` is upserted daily. Raw member values are never written.

`benchmarkHistory { saasId, week, day, standings[{ groupKey, metric, value, percentile, median, sampleSize }] }` — one row per product per ISO week, patched by each daily run, containing only the product's **own** value and percentile plus the cohort median and size. Four weeks later it is the "last month" reference (`previousStandings`).

## Percentiles, bands, insights

- `percentileOf(value, deciles)` → `5 … 95` in steps of 5 (≤ p10 → 5, ≥ p90 → 95, interpolated inside the band, rounded to 5). Coarse on purpose: no false precision, harder to reverse-engineer neighbours.
- `topBand(p)` → "Top 5 %" (≥ 95), "Top 10 %" (≥ 90), "Top 20 %" (≥ 80), "Top 25 %" (≥ 75), else none — the wording used publicly and on share cards.
- `medianMultiple(value, median)` → `value / p50` to one decimal, `null` without a positive median.
- `benchmarkInsight` — "Your activation rate is ahead of 90 % of AI SaaS. Top 10 %." / "… 1.8× the median." / "… behind 70 % of …".
- `percentileChangeInsight` — "Your activation rate improved from the 55th to the 70th percentile since last month." Only for moves of ≥ 10 points.
- `publicBenchmarkStatement` — top quarter only: "Top 25 % 30-day growth in AI SaaS".

## Dashboard (`saas.benchmarks` → `benchmarkCards`)

Owner-only. One card per `(cohort, metric)` with an aggregate: cohort label + short label + dimension + `cohortDefinition`, metric, own value, percentile, `previousPercentile` (+ week) when a standing existed ~4 weeks ago, sample size, median / p10 / p90, median multiple, band, insight and change insight. Cards are de-duplicated per metric in the UI (category × size → category → size → platform → age → all) and sorted by percentile; the last 26 weeks of standings render as a small history strip. Ineligible products (private, unverified, demo) see why; eligible products without a cohort of ten see "not enough data yet".

## Public statement (`publicBenchmarkHighlight`)

Shown on `/s/<slug>`, `GET /api/v1/saas/{slug}/benchmarks` and share cards, only when:

1. the product is public, verified, not demo, not under review, **and the owner keeps the "Benchmark statement" visibility on** (`visibility.benchmarks`, default on, `/app/saas/<id>` → Visibility);
2. the cohort has ≥ 10 members;
3. the percentile is ≥ 75 (`publicBenchmarkStatement`).

Cohorts are tried in `cohortsFor` order and the first cohort with any qualifying statement wins, the highest percentile inside it. The result names the cohort and its size — never members — and carries the previous band when it changed ("Top 10 %, up from Top 25 % last month"). Conversion metrics need the conversion rate to be published as well. Weak positions are invisible.

`public.benchmarkHistory` / `GET /api/v1/saas/{slug}/benchmark-history` expose the weekly standings with the same gating, top-quarter rows only, without values or medians.

## Discovery + sharing

- `daily.benchmarks` writes one `benchmark` discovery event per product per month for its strongest category-cohort standing at ≥ 90 % (`BENCHMARK_FEED_PERCENTILE`), owner opt-out respected (`docs/DISCOVERY.md`).
- `share.benchmarkSweep` still creates monthly share cards at ≥ 90 % for growth and activation (`docs/SHARING.md`).

## API and MCP

| Surface | Returns |
|---|---|
| `GET /api/v1/saas/{slug}/benchmarks` | `{ highlight: { statement, band, percentile, metric, cohort, sampleSize, previousBand? } \| null }` |
| `GET /api/v1/saas/{slug}/benchmark-history` | weekly public standings (gated) |
| MCP `usertrack_get_benchmark` | full private cards incl. `cohortDefinition`, `previousPercentile`, `changeInsight` |
| MCP `usertrack_get_benchmark_history` | full private weekly standings for an owned project |

## Privacy analysis

Stored: nine interpolated deciles + a count per cohort × metric, and each product's own weekly standing. Not stored: any other product's value in any aggregate. Public: at most one sentence per product for top-quarter positions naming a cohort and its size; weekly history only for those positions and only with the owner's consent. Owner view: own percentile in steps of 5, median, p10 / p90 of cohorts with ≥ 10 members. Excluded from every cohort: demo rows, self-reported sources, drafts, products under review.

## Daily job

`crons.ts` → 03:30 UTC `daily.run` → `daily.benchmarks` (0 s): collect rankable products → memberships via `cohortsFor` → per `(cohort, metric)` filter finite values, drop below the floor, else upsert deciles → per product compute standings from the in-memory aggregates → upsert this week's `benchmarkHistory` row → write the monthly `benchmark` feed event. Manual: `npx convex run daily:benchmarks`.

## Tests

`convex/lib/benchmarks.test.ts` (deciles, percentiles, multiples, insights, statements, cohort keys/labels/order, age buckets, acceleration, floor, change insight, bands), `convex/history.test.ts` (aggregates per cohort key, weekly standings idempotency, feed event, cards, public highlight gating, public history projection), `convex/boards.test.ts` (conversion statements need a published rate).
