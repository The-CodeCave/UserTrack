# Trending Score v2

Momentum, not size. The score answers "which products are growing unusually right now?" and is fully explainable: every factor is public (`public.trendingExplain`, the ⓘ tooltip on trending cards, `usertrack_get_trending.own.factors`). Source: `convex/lib/trending.ts`, `convex/leaderboard.ts`.

## Formula

```
score = 100 · volume · growth · acceleration · trust · activation · freshness · history      (rounded to 0.1)
```

| Factor | Definition | Range | Why |
|---|---|---|---|
| `volume` | `log10(1 + new)^1.5` | 0 … | Absolute traction. Log-dampened so 100k-user products don't own the board, exponent 1.5 so they still beat a 60 → 100 product (see A22 in `docs/ASSUMPTIONS.md`) |
| `growth` | `1 + min(new / max(base, 50), 2)` | 1 … 3 | Relative growth; the 50-user floor stops 1 → 5 products from tripling their score |
| `acceleration` | `1 + 0.5 · clamp((new − prev) / max(prev, 10), −0.5, 2)` | 0.75 … 2 | This window vs the previous one; the 10-user floor keeps `0 → 3` from counting as infinite acceleration |
| `trust` | `0.5 + 0.5 · clamp(trustScore, 0, 100) / 100` (default score 60) | 0.5 … 1 | Low-confidence sources are discounted, never boosted |
| `activation` | `1 + 0.25 · activationRatePct / 100`, `1` when there is no activation source | 1 … 1.25 | Small lift for products whose users actually activate |
| `freshness` | `1` while the last successful sync is ≤ 24 h old, linear down to `0.5` at 72 h, `0` after | 0 … 1 | A stale source is not evidence of anything |
| `history` | `0.6 + 0.4 · min(1, trackedDays / 14)`; `1` when `firstSnapshotAt` is unknown | 0.6 … 1 | Full weight needs two weeks of continuous history; backfilled days count |

Constants (`convex/lib/trending.ts`): `TRENDING_MIN_NEW_USERS = 5`, `TRENDING_FRESH_MS = 24 h`, `TRENDING_STALE_MS = 72 h`, `TRENDING_FULL_HISTORY_DAYS = 14`.

Inputs per window (`trendingInputs` in `leaderboard.ts`): `new = newUsersXd`, `prev = newUsersPrevXd ?? 0`, `base = totalUsers − new`, `trustScore`, `activationRatePct`, `lastSyncedAt`, `firstSnapshotAt`, `underReview = trustState === "review"`.

## No signal (score = 0)

`signal` is false, and the score is exactly `0`, when any of these hold:

- fewer than **5 new users** in the window;
- `freshness = 0` — no successful sync for more than 72 hours;
- the product is **under review** (an open high-severity anomaly flag).

A product with score 0 is absent from the trending board and has no trending rank for that window. Products that are not public, not `verified`, or demo rows are never ranked at all (`rankable`), although their scores are still computed for the owner dashboard.

## Worked examples (7-day window)

| | A · small, accelerating | B · large, steady | C · tiny, brand new | D · A with a stale source |
|---|---|---|---|---|
| total / new / prev | 600 / 90 / 40 | 120,000 / 4,000 / 3,800 | 100 / 40 / 5 | 600 / 90 / 40 |
| trust · activation · last sync · tracked | 80 · 45 % · 2 h · 30 d | 92 · none · 1 h · 200 d | 60 (default) · none · 1 h · 3 d | 80 · 45 % · **48 h** · 30 d |
| volume | log10(91)^1.5 = 2.742 | log10(4001)^1.5 = 6.837 | log10(41)^1.5 = 2.048 | 2.742 |
| growth | 1 + 90/510 = 1.176 | 1 + 4000/116000 = 1.034 | 1 + 40/50 = 1.800 | 1.176 |
| acceleration | 1 + 0.5·1.25 = 1.625 | 1 + 0.5·0.053 = 1.026 | 1 + 0.5·min(3.5, 2) = 2.000 | 1.625 |
| trust | 0.90 | 0.96 | 0.80 | 0.90 |
| activation | 1.1125 | 1 | 1 | 1.1125 |
| freshness | 1 | 1 | 1 | 1 − 0.5·(24/48) = 0.75 |
| history | 1 | 1 | 0.6 + 0.4·(3/14) = 0.686 | 1 |
| **score** | **≈ 525** | **≈ 697** | **≈ 404** | **≈ 394** |

Reading: the large product keeps the lead through volume; the small product with real acceleration and activation is close behind; the tiny product scores well on relative growth but is held back by the trust default and short history; and 48 hours without a sync costs a quarter of the score. At 72 hours D drops to 0.

## Windows, ranks and movement

`leaderboard.rerank` (cron `20 */4 * * *`, i.e. 20 minutes after each sync cycle; also scheduled on publish and delete) computes, for every public SaaS, `trendingScore24h`, `trendingScore7d`, `trendingScore30d` and, for rankable products with a positive score, one rank per window:

| Window | Rank field | Previous |
|---|---|---|
| 24h | `trendingRank24h` | `prevTrendingRank24h` |
| 7d (default board, milestones, share cards, badges) | `trendingRank` | `prevTrendingRank` |
| 30d | `trendingRank30d` | `prevTrendingRank30d` |

`prev*` is only rewritten when the rank changes, so movement (`up` / `down` / `same` / `new`, `delta = prev − rank`) survives cycles with no change. The 30-day leaderboard rank (`rank`, by `newUsers30d`) is computed in the same job.

## Determinism

Ordering is a total order: `score desc → newUsers30d desc → totalUsers desc → slug asc`. Two products with identical inputs get stable, reproducible ranks across reruns, and a rerun with unchanged data writes no rank changes. Scores are rounded to one decimal before sorting.

## Where it is used

- **Boards** (`public.board`, `/trending`, `/leaderboard?board=trending`, `GET /api/v1/trending`): products with `score > 0` for the chosen window, sorted by score with the same tiebreaks; each row carries `movement` and a one-line `explain` ("2.1× prev period · +12% relative · 61% activate · short history").
- **Discovery** (`public.discover`): "Trending now" = top 5 on 7d; "Biggest movers" = largest 7-day rank improvements (`prevTrendingRank − trendingRank`).
- **Milestones**: entering the 7-day top 10 writes the `trending_top10` milestone (once).
- **Benchmarks**: `trendingScore7d` is one of the five benchmarked metrics.
- **Share and embed**: the `trending` share card and `type=trending` badge show `trendingRank` (7d).
- **MCP**: `usertrack_get_trending` returns the board, the formula string and the caller's own `factors`.

## Anti-gaming properties

- Net deltas: fake accounts that are deleted later subtract from `new` (see `docs/METRICS.md`).
- The 5-user floor and the 50-user relative-growth floor neutralise micro products; the acceleration clamp caps any single window at 2×.
- Trust only discounts; anomaly heuristics (impossible growth, sudden drops, reconnect churn, source switching) lower the score and, at high severity, remove the product from every board.
- Stale or self-reported sources score 0 / are not rankable; demo rows are excluded.
- Every factor is public, so a rank can always be explained without exposing raw internals.

## Tuning

All constants live at the top of `convex/lib/trending.ts` and are covered by `convex/lib/growth.test.ts`. Change the volume exponent to shift the balance between size and momentum, the floors (50 / 10) to change how small products behave, the freshness thresholds to match the sync cadence (4 h today), and `TRENDING_FULL_HISTORY_DAYS` to require more or less history. `rerank` recomputes every window from scratch, so a constant change takes effect on the next cycle (`npx convex run leaderboard:rerank` to apply immediately).
