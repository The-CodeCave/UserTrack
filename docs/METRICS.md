# Metrics

How a provider count becomes the numbers on a growth page. Source: `convex/sync.ts`, `convex/lib/metrics.ts`, `convex/domain/funnel.ts`, `convex/lib/retention.ts`, `convex/lib/milestones.ts`, `convex/lib/spikes.ts`, `convex/lib/trust.ts`.

## Storage layers

```
provider.fetch ──► snapshots (append-only, users role only: totalUsers, capturedAt, source, trust, backfilled?)
                ──► dailyMetrics (one row per SaaS per UTC day: totalUsers, newUsers, activatedUsers, newActivated,
                                  visitors, sessions, payingUsers, mrr, activeUsers30d, rank)
                ──► saas (materialized: everything the UI and boards read)
```

- **Snapshots** are the source of truth for user totals. Nothing ever rewrites them.
- **dailyMetrics** is the rollup for charts ≥ 30 days, the funnel, milestones, benchmarks and compare. `totalUsers` is the last snapshot of the day; `newUsers = totalUsers − previous day's totalUsers` (falls back to the previous snapshot, and to zero on the very first row).
- **saas** carries derived fields rewritten by `recomputeDerived` after every users snapshot and after a backfill.

## Window math (`recomputeDerived`)

For each users snapshot the engine loads the latest and first snapshot plus the newest snapshot at or before `now − 1, 2, 7, 14, 30, 60 days` (`snapshotAt`, one indexed read each).

| Field | Formula |
|---|---|
| `newUsersXd` | `total − baseline(Xd).totalUsers` when a snapshot ≥ X days old exists; otherwise the provider-reported gross count for that window if present; otherwise `total − first.totalUsers` |
| `growth30dPct`, `growth7dPct` | `(total − base) / base × 100`, base = baseline or first snapshot, rounded to 0.1; `0` when base ≤ 0 |
| `newUsersPrevXd` | `max(0, snapshot(now−X).total − snapshot(now−2X).total)`, first snapshot as floor (`previousWindowDelta`) |
| `activationRatePct` | `activatedUsers / total × 100`, rounded to 0.1 (`pct`) |
| `firstSnapshotAt` | timestamp of the oldest snapshot (backfilled rows count) |

24-hour growth on boards is computed on the fly as `new24h / (total − new24h)`.

**Net vs gross.** Snapshot deltas are *net* (deleted or merged accounts subtract), uniform across providers and hard to game: deleting fake accounts costs the gain back. Provider-reported *gross* signups (`createdUsers` capability) are only used while the snapshot history is shorter than the window, so a freshly connected Clerk or Supabase product shows real 30-day numbers immediately. Once history covers the window, net deltas win. A negative `newUsers` is possible in net mode; the funnel and share copy clamp at zero.

## Backfill

- On the first successful sync of a users/activation source (`backfilledAt` unset) the engine calls `fetchHistory(…, 30)`; traffic sources are refreshed every run with `days = 7`.
- `recordHistory`: `newUsers` series are turned into totals by walking backwards from the current total (today excluded); `totalUsers` series are used as-is. Only days strictly before the first live snapshot are written: one `snapshots` row at day end with `backfilled: true` and one `dailyMetrics` row each. The live day's `newUsers` is then patched against the last backfilled total and `recomputeDerived` runs, which is what gives `growth30dPct` a real baseline on day one.
- `activatedUsers` history writes `activatedUsers` + `newActivated` per day; `visitors` history writes `visitors`.
- Backfilled data never overwrites a day that already has live data.

## Activation model

An activated user is one who reached the first meaningful value in the product, not just an account. It is an optional second source (`role: "activation"`).

| | |
|---|---|
| Sources | PostHog event (`count(distinct person_id)`), Supabase or PostgreSQL table with one row per activated user (+ timestamp) or a custom `$1` SELECT, JSON endpoint (`activatedUsers`, `activated24h/7d/30d`) |
| Stored on `saas` | `activatedUsers`, `activated24h`, `activated7d`, `activated30d` (read from the source, not derived), `activationRatePct` (recomputed on every users **and** activation sync) |
| Daily | `dailyMetrics.activatedUsers`, `newActivated = activated − previous day's activated` |
| History | 30-day cumulative series on connect (PostHog, Postgres/Supabase with a timestamp) |
| Derived signals | `activated` threshold milestones (never on the first activation sync), `activation_spike` events, `activation_exceeds_users` flag when activated > 1.05 × users, +5 trust when present |

**Not supported: time-to-activation / median activation delay.** UserTrack only ever receives aggregate counts (`count(*)`, `count(distinct person_id)`, `{ activatedUsers: n }`). A median delay needs per-user pairs of `(signed_up_at, activated_at)`, which would require reading individual rows or events; that contradicts the aggregate-only contract every provider and the endpoint template are built on, and two independent cumulative series cannot be joined into per-user latencies. The dashboard's activation section says so explicitly rather than showing an estimate.

## Funnel (`convex/domain/funnel.ts`)

Visitors → Signups → Activated → Paying over `7d | 30d | 90d`, always from `dailyMetrics` (at most `2 × days` indexed rows), never from raw snapshots.

- **Windows.** `current` = rows with `day > today − days`, `previous` = the `days` rows before that. `coverageDays = current.length`.
- **Flow vs stock.** Visitors, signups and activated are *flows* (sums of `visitors`, `newUsers`, `newActivated` inside the window). Paying is a *stock* (the last `payingUsers` value in the window).
- **Fallbacks.** When fewer than `min(days, 2)` daily rows exist, signups fall back to `saas.newUsers7d` / `newUsers30d` (90d uses the 30-day figure) and previous windows to `newUsersPrev7d/30d`. Activated falls back to `activated7d/30d`, then `activatedUsers`; visitors to `visitors30d` / `visitorsPrev30d` for the 30-day timeframe only; paying to `saas.payingUsers`.
- **Stages present.** Signups always. Activated only with an activation source. Visitors only with a traffic source *and* `showTraffic` (public) — the owner view passes `includeTraffic: true`. Paying likewise with `showRevenue`.
- **Conversion.** `conversionPct = stage / previous stage × 100` (rounded to 0.1, capped at 999 %), and `previousConversionPct` from the previous window. `changePct = (now − prev) / prev × 100`, undefined when `prev ≤ 0`.
- **Provenance.** Every stage carries `source { provider, label, verification }` from the integration that feeds it (only integrations with a successful sync or status `ok`), using the source-level verification rule in `docs/PROVIDERS.md`. The funnel-level `verification` is `verified` only when **every** stage is `verified`; all `self_reported` → `self_reported`; any mix → `mixed`; no sources → `none`. A funnel with one self-reported stage is therefore never labelled "Verified funnel".

Surfaces: `public.funnel` / `saas.funnel` (Convex), `GET /api/v1/saas/{slug}/funnel`, MCP `usertrack_get_funnel` (adds `missingStages` and a hint to connect activation).

## Retention estimate (`convex/lib/retention.ts`)

Only when a users provider reports `activeUsers30d` (Clerk `last_active_at_since`, Auth0 `/stats/active-users`, endpoint).

```
cohort   = totalUsers − max(0, newUsers30d)        (users that existed 30 days ago)
retained = clamp(activeUsers30d − newUsers30d, 0, cohort)   (new users are active by definition)
churned  = cohort − retained
ratePct  = retained / cohort × 100 (0.1)
```

`null` (nothing shown) when the cohort is under 20 users. `retentionSource` is always `"estimated"`; true cohorts would need per-user activity data that no connected provider exposes as an aggregate.

## Milestones (`convex/lib/milestones.ts`)

Persisted once per `(saasId, key)`; keys are stable so a milestone is never re-created.

| Kind | Trigger | Key |
|---|---|---|
| `users`, `activated` | total crosses 10 · 100 · 500 · 1K · 5K · 10K · 50K · 100K · 250K · 500K · 1M between two syncs (the first snapshot is a baseline, never a crossing) | `users:<t>` / `activated:<t>` |
| `top10`, `top100` | leaderboard rank enters ≤ 10 / ≤ 100 (after rerank) | `top10`, `top100` |
| `rank` | new best rank ≤ 3 | `rank:<n>` |
| `trending_top10` | 7-day trending rank enters ≤ 10 | `trending_top10` |
| `best_day` | closed day with ≥ 25 new users that beats the previous record (≥ 3 daily rows) | `best_day:<day>\|<n>` |
| `best_week` | best 7-day sum ≥ 100 that beats the previous record (≥ 14 closed days) | `best_week:<day>\|<n>` |
| `streak` | 7 / 30 / 90 consecutive closed days with new users > 0 | `streak:<len>` |
| `monthly_growth` | `growth30dPct` ≥ 25 / 50 / 100 with ≥ 30 daily rows | `monthly_growth:<g>` |

Threshold milestones run on each sync, rank milestones after each rerank, the rest in the daily sweep (`daily.run`), which also stores `streakDays` and the previous day's rank in `dailyMetrics.rank`.

## Spikes (`convex/lib/spikes.ts`)

`detectSpike(history, today, minAbs = 20, multiple = 3)`: the trailing 14 closed days must contain ≥ 5 values; a day is a spike when `today ≥ 20` and `today / average ≥ 3`. Written as `events` of kind `spike` (users) or `activation_spike`, at most one per kind per day (`by_saas_kind_day`), with `value` and `multiple` (0.1 precision). They feed chart annotations, the discovery feed and the `spike-<id>` share card. The spike *email* uses a stricter rule (2.5 × the 30-day mean, 14 days of history, 7-day cooldown; see `docs/ARCHITECTURE.md`).

## Trust score (summary)

`trustScore` = provider base (auth providers and read-only databases 40 · analytics / endpoint on own domain 30 · foreign endpoint 10 · manual 5) + connection age (≤ 25 over 30 days) + sync continuity (≤ 20) + activation data (5) − open flags (high 15 / medium 8 / low 3). State: any high flag → `review` (unranked, "Data under review"); any flag → `anomaly`; score < 35 → `low_confidence`; else `healthy`. Heuristics, public labels and the daily review live in `docs/ARCHITECTURE.md`. The trending score multiplies by `0.5 + 0.5 · trustScore/100`, so low confidence discounts but never boosts.
