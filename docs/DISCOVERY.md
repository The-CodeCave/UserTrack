# Discovery

**TL;DR** — `/discover` (optionally per category), the boards (`/trending`, `/leaderboard`, `/fastest-growing-saas`, `/new-saas`, `/hidden-gems`, `/biggest-movers`, category and platform pages) and the activity feed are computed from verified snapshots and **stored** events only. Every rule below is deterministic, documented and returned with the section so the UI can explain it. Code: `convex/lib/boardRules.ts` (`BOARD_RULES`, `sortBoard`), `convex/public.ts` (`boardRows`, `discover`, `feedItems`), `convex/leaderboard.ts`, `convex/daily.ts`, `convex/domain/events.ts`. Boards are read through the index that carries their sort order and stop at the page size (`docs/ARCHITECTURE.md` → Public caching); the rules below are unchanged.

## Eligibility

- **Public set**: `saas.isPublic`.
- **Verified**: `trust === "verified"` and not under review (`trustState !== "review"`). Boards default to verified only (`?all=1` shows self-reported sources, labelled).
- **Rankable** (ranks, trending ranks, cohorts, movers, hidden gems, feed): verified, public, not a demo row.
- Demo listings appear on boards (labelled "Demo") so an empty instance is demonstrable, but never in Hidden gems, Biggest movers, Recently verified, the feed, milestones, events or webhooks.

## Sections and rules

| Section / board | Rule | Order |
|---|---|---|
| Trending now (`trending`) | Trending Score > 0 (`docs/TRENDING.md`), window 24h / 7d / 30d | score |
| Fastest growing (`fastest`) | ≥ 10 new users in the window | growth % in the window |
| Most new users (`most-new`), Most users (`most-users`) | — | new users / total |
| New & rising (`new-rising`, `NEW_RISING_RULES`) | first stored snapshot ≤ **30 days** ago (backfilled days count) and ≥ **5** new users this week | 7-day new users |
| Hidden gems (`hidden-gems`, `HIDDEN_GEM_RULES`) | < **1,000** users, ≥ **10** new users and ≥ **10 %** growth this week, ≥ **7** days of verified history, trust score ≥ **60**, not a demo | 7-day growth % |
| Biggest movers (`movers`) | `rankDelta7d > 0` — climbed on the 30-day leaderboard versus the position stored **7 days ago** (`rankHistory`, `docs/HISTORY.md`) | places climbed, then rank |
| Recently verified | `verifiedAt` desc | — |
| Popular mobile apps | `most-new` filtered to `projectType = mobile` | 30-day new users |
| Top developer tools / Top AI | `most-new` per category | 30-day new users |
| Activation / conversion boards | see `docs/FUNNEL.md`; conversion boards list only published rates | rate |

Filters on every board: window, category, size bucket, platform (web / mobile / hybrid), verified-only. `public.boardMeta` gives the "last updated" stamp (newest successful sync among the listed rows). Boards are field sorts over one indexed read of the public set; ranks, trending scores and 7-day movement are precomputed by `leaderboard.rerank` every 4 hours.

## Biggest movers vs. "movement"

Two different things, deliberately:

- **Movement chips** on trending rows compare with the position at the previous 4-hour refresh (`prevTrendingRank`) — "what changed since the last cycle".
- **Biggest movers** compare with the stored position 7 days ago (`rank7dAgo`, from `rankHistory`). A product without a row a week ago has no movement yet and cannot be a mover. Nothing is reconstructed from the current cycle.

## Activity feed (`feedItems`)

A merge of two stored, deduplicated logs, filtered to verified non-demo products (optionally one category), newest first:

| Feed item | Table / kind | Dedupe key | Written when |
|---|---|---|---|
| milestone | `milestones` (`users:10000`, `top10`, `top100`, `best_day`, `streak`, `trending_top10`, …) | `milestone:{saasId}:{key}` | thresholds crossed, rank entries, records (`convex/lib/milestones.ts`) |
| spike / activation spike | `events.spike`, `events.activation_spike` | `{kind}:{saasId}:{day}` | ≥ 3× the trailing 14-day average, ≥ 20 (`lib/spikes.ts`) |
| launched | `events.launched` | once per product | first publish |
| verified | `events.verified` | once per product | first verified sync |
| rank jump | `events.rank_jump` | `rank_jump:{saasId}:{day}`, cooldown 7 days | climbed ≥ **10** places into the **top 50** in 7 days (`RANK_JUMP`) |
| traction | `events.traction` | once per product | ≤ 30 days on UserTrack and ≥ **100** new users this week (`TRACTION_RULES`) |
| benchmark | `events.benchmark` | `benchmark:{saasId}:{YYYY-MM}` | top **10 %** of a category cohort this month, owner has benchmarks public (`BENCHMARK_FEED_PERCENTILE`) |

`reconnect`, `source_changed` and `traffic_spike` events exist for chart annotations and are excluded from the feed. Nothing is created at read time, so the same feed can be served to the API (`GET /api/v1/discover`), the watchlist and the public page without drift.

## Category discovery

Fixed taxonomy in `src/lib/categories.ts` (15 slugs: ai, developer-tools, analytics, marketing, sales, productivity, fintech, no-code, design, ecommerce, education, health, social, infrastructure, other). `/discover?category=<slug>` narrows every section and the feed; `/categories/<slug>` is the category leaderboard with all boards; `/fastest-growing-ai-saas` and `/fastest-growing-developer-tools` are the high-intent variants. Search (`public.search`) returns products, founders and matching categories.

## Discovery cards

Logo, name, category, total users, recent new users and growth %, trending rank pill, 30-day sparkline (cumulative users from `dailyMetrics`), verification badge, follow chip. Row cards on boards add the board's primary metric, movement and — for movers — `#78 → #31`.

## Public pages and SEO

Every discovery page renders server-side with title, description, canonical URL, Open Graph image, an intro, the ranking, a methodology panel, a "last updated" stamp, JSON-LD `ItemList` and internal links (categories, related boards, project and founder pages). Monthly archives live under `/rankings/<year>/<month>/<category>` from frozen `rankingSnapshots` (`docs/DATASETS.md`). Sitemap and robots cover all of them; `/app`, auth and email pages stay excluded.

## Tests

`convex/discovery.test.ts` (feed merge, dedupe, category filter, demo / unverified exclusion, once-only events, deterministic trending ranks, hidden gems), `convex/history.test.ts` (rank history → movers → rank jump → feed; benchmark events; monthly snapshots), `convex/boards.test.ts`.
