# Historical data

**TL;DR** — UserTrack treats history as the product. Every verified number is appended, never rewritten: 4-hour user snapshots, per-stage snapshots, daily rollups, daily ranking + trending positions, weekly benchmark standings and frozen monthly rankings. Charts downsample for long ranges and draw gaps as gaps. Providers that can read history backfill it idempotently with full provenance — on the first sync back to the first signup (5-year cap) for sources that answer one aggregate query, one year for sources that need a request per day.

Source: `convex/schema.ts`, `convex/sync.ts`, `convex/leaderboard.ts`, `convex/daily.ts`, `convex/lib/history.ts`, `convex/public.ts` (`history`, `rankHistory`, `rankingSnapshot`).

## What is stored, at which granularity

| Table | Row | Written by | Cadence | Rewritten? |
|---|---|---|---|---|
| `snapshots` | `{ saasId, totalUsers, capturedAt, source, trust, syncRunId?, backfilled? }` | `sync.recordSuccess` (users role), `sync.recordHistory` (backfill) | every 4 h per users source; one per backfilled day | **never** |
| `stageSnapshots` | `{ saasId, stage: activated \| trial \| converted, value, capturedAt, source, integrationId, trust, mode? }` | `sync.recordSuccess` | every 4 h per activation / conversion source | **never** |
| `dailyMetrics` | one row per SaaS per UTC day: totals + flows for every stage, `visitors`, `rank`, `backfilled?` | `sync.upsertDaily`, `daily.run` (rank) | patched during the day, closed afterwards | today's row only |
| `rankHistory` | `{ saasId, kind: leaderboard \| trending, window, day, rank, score?, at }` | `leaderboard.rerank` | every rerank (6×/day) → one row per day, last position wins | today's row only |
| `benchmarkHistory` | `{ saasId, week, day, standings[{ groupKey, metric, value, percentile, median, sampleSize }] }` | `daily.benchmarks` | daily → one row per ISO week | current week only |
| `benchmarkAggregates` | deciles per `(groupKey, metric)` | `daily.benchmarks` | daily | yes (current cohort state; standings keep the history) |
| `rankingSnapshots` | `{ period: YYYY-MM, board, category?, rows[…], sampleSize, computedAt }` | `daily.snapshotRankings` on the 1st | monthly | never (unless `force`) |
| `backfills` | `{ integrationId, provider, role, fromDay, toDay, status, pointsWritten, trigger, startedAt, finishedAt, error? }` | `sync.runBackfill` | per import | status only |
| `milestones`, `events` | achievements and discovery events, keyed for dedupe | sync / rerank / daily | on occurrence | never |

Provenance on every metric row: `source` (provider), `trust` (verification level at capture time), `integrationId` / `syncRunId` where it exists, `backfilled: true` for imported days. A row captured while a source was `unverified` stays `unverified` forever; verification never applies retroactively.

## Retention

Nothing in the tables above is deleted because it is old. The only pruning in the system is `native.pruneEvents` (raw SDK lifecycle events older than 30 days — those are inputs, not metrics; the snapshots derived from them are kept). Deleting a project (`saas.remove`) deletes its own rows only.

When storage optimisation becomes necessary the plan is: keep every daily row and every `rankHistory` / `benchmarkHistory` row; aggregate 4-hour `snapshots` older than two years into one row per day (the daily row already exists); never destroy milestones, events or verified daily history.

## Time granularity and downsampling (`convex/lib/history.ts`)

| Chart range | Resolution | Source |
|---|---|---|
| `24h`, `7d` | raw 4-hour snapshots | `snapshots` |
| `30d`, `90d` | daily | `dailyMetrics` |
| `1y` | weekly (last total of the ISO week, new users summed) | `dailyMetrics` |
| `all` | weekly, monthly once the project has more than two years of history | `dailyMetrics` |

`downsample(rows, resolution)` is a pure function: last total per bucket, flows summed, activated / converted carried as "last known". It never creates a point for a bucket without rows. The underlying daily and 4-hour rows are untouched by downsampling.

Public API: `GET /api/v1/saas/{slug}/history?range=` returns `{ range, resolution, points, gaps, reconstructedUntil? }`; the internal query is `public.history`. `public.series` (legacy) returns the same points.

## Gaps are honest

`findGaps(points, minDays)` reports stretches without stored rows (longer than 3 days at daily resolution, 14 at weekly, 45 at monthly, 1 at raw). The growth chart shades them and breaks the line instead of drawing through them; the API returns them as `gaps: [{ from, to, days }]`. Nothing is interpolated — a disconnected integration produces no rows, and that absence is preserved.

The founder aggregate chart (`lib/founder.ts`) is the one place values are forward-filled, because summing across projects would otherwise dip whenever one project misses a day; that behaviour is per project and documented there.

## Backfill

Providers that expose history (`docs/PROVIDERS.md`: Clerk, Supabase, Auth0, Firebase, PostHog, Plausible, GA4, PostgreSQL, native SDK sources) import it through one path, `sync.runBackfill`:

1. `sync.startBackfill` writes a `backfills` row (`running`, `fromDay`, `toDay`, `trigger: first_sync | rolling | manual`).
2. `fetchHistory` reads the provider up to its **reach** (`Provider.historyLimit`, `historyLimit(kind, config)` in `convex/providers/index.ts`):

   | Reach | Providers | First sync | Why |
   |---|---|---|---|
   | `full` — 1,826 days (5 years) | PostgreSQL, Supabase (database mode), Firebase (createdAt scan ≤ 100k accounts) | everything back to the first signup | one `GROUP BY day` query / one scan, cost independent of the range |
   | `bounded` — 365 days | Clerk, Supabase (API mode), Auth0 | one year | one request per day (Clerk, Supabase API) or a stats endpoint we do not want to stretch (Auth0) |
   | `bounded` — 90 days | native SDK (`@usertrack/node`, `@usertrack/better-auth`) | 90 days | protocol v1 caps `days` at `MAX_HISTORY_DAYS = 90` (`packages/protocol`); raising it is a protocol change |
   | default — 30 days | PostHog, Plausible, GA4 (traffic; PostHog activation) | 30 days, then 7 rolling days on every run | unchanged rolling window |

   Full-reach providers return signups per UTC day (`metric: newUsers`); `fillDaily` (`convex/providers/types.ts`) zero-fills days without signups but **starts the series at the first signup** when nothing exists before the window, so a product founded in 2023 does not get two years of flat zero before day one. When users exist before the window (older than the cap, or a manual 30-day re-run), the series starts at the window start instead.
3. Signup series become end-of-day totals once, in the action (`reconstructTotals`, `convex/lib/history.ts`): walking back from the live total, today's signups are subtracted but not emitted (the live snapshot owns today), and the total ahead of the first point is the baseline for its `newUsers`. (Before v1.0.1 the reconstruction skipped today, so every reconstructed day was one day late and the live day's `newUsers` was yesterday's.)
4. `sync.recordHistory` writes **365-day chunks** (one mutation each — up to ~730 lookups + ~730 writes, inside Convex transaction limits). It writes only days before the first *live* snapshot, skips any day that already has a backfilled snapshot (idempotent), marks rows `backfilled: true` (snapshot **and** daily row) with the integration's trust level, and returns the last total so the next chunk's deltas stay exact across the boundary. `sync.finishHistory` then gives the live day its real `newUsers` baseline and recomputes the derived window metrics once. The `backfills` row receives the sum of all chunks in `pointsWritten`.
5. `backfilledAt` is stamped on the integration **only after a successful import**, so a transient provider error keeps the backfill pending for the next sync (v0.8 stamped it regardless).
6. Failures end in `status: error` with the message; empty answers in `status: empty`.

**Reconstructed days never trigger anything.** No milestone, spike, feed event, mail, share or webhook is emitted by the import (those hooks live in `recordSuccess`, the live path). The daily sweep (`daily.run`) excludes `backfilled` daily rows from `dailyMilestones` (best day / best week / streak / monthly growth), so a 500-signup launch day in 2023 is not posted as "biggest day ever" the morning after connecting; the streak chip still counts reconstructed days because a streak is a present fact about consecutive signup days. `firstSnapshotAt` moves back to the first reconstructed day, which makes "tracking since", the `tracked:` cohorts and the early-traction rule reflect the product's own history — an old product connecting today is not "early traction". Covered by `convex/history.test.ts`.

Founders can re-run it from the project page ("Backfill history", `integrations.backfill`, users role): **last 30 days** or **entire history** (`days: "all"` → the provider's reach; explicit day counts are clamped to it) and see the last ten runs (`integrations.backfills`). Charts and `GET /api/v1/saas/{slug}/history` expose `reconstructedUntil` (the last reconstructed day) and label those points "reconstructed from signup dates". MCP: `usertrack_sync_project` triggers a sync; a dedicated backfill tool is a roadmap item.

Reconstructed totals count users that still exist: a hard-deleted account is missing from every reconstructed day, so historic totals are systematically a little low unless the source keeps `deleted_at` (Supabase `auth.users` does; see `docs/ASSUMPTIONS.md`).

## Ranking history

`leaderboard.rerank` (every 4 h, 20 minutes after the sync cycle) upserts one `rankHistory` row per rankable product for the 30-day leaderboard and for each trending window (24h / 7d / 30d, with the score). Because the key is `(saasId, kind, window, day)` a day ends with its last position; past days are never touched.

From the stored rows the same job materializes on the `saas` row: `rank7dAgo`, `rankDelta7d`, `trendingRank7dAgo`, `trendingRankDelta7d` (position on the closest stored day within 7–10 days ago) and `bestTrendingRank`. A product without a stored position a week ago simply has no movement yet — nothing is estimated from the previous 4-hour cycle.

Consumers: Biggest Movers (`board: movers`, `/biggest-movers`), the `rank_jump` discovery event (climbed ≥ 10 places into the top 50, once per 7 days), the rank history chart on project pages, `GET /api/v1/saas/{slug}/rank-history`, MCP `usertrack_get_rank_history`, the watchlist feed (`rank_change` items at ±5 places) and the weekly digest.

`dailyMetrics.rank` (end-of-day leaderboard rank, written by the daily sweep) is kept for the monthly report; `rankHistory` is the canonical source.

## Trending history

Stored with the ranking history (`kind: "trending"`, `score`). Per window and day, so "trending rank over time" and "highest trending rank ever" (`bestTrendingRank`) are answerable without recomputation.

## Benchmark history

`daily.benchmarks` computes every cohort's deciles, then every product's standings from the in-memory aggregates and writes/patches the product's `benchmarkHistory` row for the current ISO week. Four weeks later that row is the "last month" reference: cards show the previous percentile and a change sentence ("improved from the 55th to the 70th percentile since last month"). Only the product's own values, percentiles and the cohort median / size are stored — never other members. Details in `docs/BENCHMARKS.md`.

## Cohort history

Signup cohorts (`cohortMetrics`, one row per project per signup month) are rebuilt daily from pseudonymous identity links and keep activation, trial and conversion counts plus D7 / D30 figures per cohort month (`docs/IDENTITY.md`). No PII is stored; subjects are salted hashes.

## Monthly ranking snapshots

On the first day of each month the daily sweep freezes the previous month's boards (`most-new`, `fastest`, `trending` — 30-day windows) for all categories with at least three rankable products into `rankingSnapshots`. They power `/rankings/<year>/<month>/<category>` and `GET /api/v1/datasets/rankings/history`. Re-running for the same period is a no-op (`force: true` rewrites). Manual run: `npx convex run daily:snapshotRankings '{"period":"2026-08"}'`.

## Data quality flags on history

Each stored row keeps the quality it had when captured: `trust` (`verified` / `unverified` / `pending`), `source`, `backfilled`. Public projections label products, not rows, through `publicTrustLabel` (`docs/METRICS.md`); the API exposes `trust` per row where rows are returned (datasets, ranking snapshots) and `reconstructedUntil` on history responses.

## Performance notes

- History queries are indexed ranges (`by_saas_time`, `by_saas_day`, `by_saas_kind_window_day`, `by_saas_week`) followed by pure downsampling; the `all` range reads every daily row of one project once and returns ≤ ~110 weekly / monthly points.
- `rerank` performs one indexed read + one write per product per board for history, plus one lookup for the 7-day position. `daily.benchmarks` reads aggregates once per (cohort, metric) and computes standings in memory.
- Monthly snapshots are read by primary key; the archive index reads at most 500 rows.
