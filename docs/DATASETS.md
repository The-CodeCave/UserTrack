# Public datasets + SEO pages

**TL;DR** — UserTrack's public data is available as indexable pages (live boards, category pages, monthly ranking archives) and as structured dataset endpoints (JSON + CSV) under `/api/v1/datasets/*`. Only public, owner-published projections are ever exposed; private projects and gated metrics never appear. Code: `src/app/(public)/**`, `src/app/api/v1/datasets/**`, `src/lib/api/datasets.ts`, `convex/public.ts`, `convex/daily.ts` (`snapshotRankings`).

## Pages

| Route | Content | Board / rule |
|---|---|---|
| `/discover` (+ `?category=`) | sections + feed (`docs/DISCOVERY.md`) | — |
| `/trending`, `/leaderboard` | live boards with filters | trending / any board |
| `/fastest-growing-saas`, `/fastest-growing-ai-saas`, `/fastest-growing-developer-tools` | growth % boards | `fastest` (+ category) |
| `/fastest-growing-mobile-apps`, `/best-converting-mobile-apps` | platform pages | `fastest` / `best-conversion` + `platform=mobile` |
| `/best-activation-rate-saas`, `/best-conversion`, `/most-new-users`, `/new-saas` | metric boards | `activation-rate` / `best-conversion` / `most-new` / `new-rising` |
| `/hidden-gems`, `/biggest-movers` | rule-based boards | `hidden-gems` / `movers` |
| `/categories`, `/categories/<slug>` | category leaderboards | any board, category locked |
| `/rankings`, `/rankings/<year>/<month>/<category>` | frozen monthly rankings | `rankingSnapshots` |
| `/s/<slug>`, `/u/<username>` | product / founder pages with related products, rank history, benchmark statement | — |

Every page: server-rendered, `title` / `description` / canonical (base path without filter params), Open Graph image, intro paragraph, the ranking, a methodology panel (`#methodology`), "Last updated", JSON-LD (`ItemList` on boards, `SoftwareApplication` on product pages, `Person` on founder pages), and internal links. Redirects: `/trending-saas` → `/trending`, `/new-and-rising` → `/new-saas`. Sitemap: `src/app/sitemap.ts` (fixed pages, categories with rows, public products, public founders, frozen rankings). Robots: everything public allowed; `/app`, `/api/auth`, sign-in/up and `/email/` disallowed.

Thin pages are avoided by construction: a monthly ranking page exists only when the frozen board had ≥ 3 rankable products (`MIN_SNAPSHOT_ROWS`), category pages link only categories with rows, and empty boards render an explicit empty state rather than an index-worthy page.

## Dataset endpoints

Base: `/api/v1/datasets`. Same envelope, rate limits and optional API keys as the rest of the API (`docs/API.md`): anonymous 60 req/min per IP, keyed 1,000 req/day + 120/min burst. CSV downloads share the same buckets.

| Endpoint | Rows | Notes |
|---|---|---|
| `GET /datasets/trending` | trending board | `window` 24h / 7d / 30d (default 7d) |
| `GET /datasets/fastest-growing` | `fastest` board | `window` (default 30d) |
| `GET /datasets/new-and-rising` | `new-rising` | 7d |
| `GET /datasets/hidden-gems` | `hidden-gems` | rules in `meta.methodology` |
| `GET /datasets/movers` | `movers` | `rank7dAgo`, `rankDelta7d` per row |
| `GET /datasets/categories/{slug}` | category board | `board` param (default `most-new`) |
| `GET /datasets/rankings/history` | frozen month | `period=YYYY-MM`, `board`, `category`; without `period` lists available periods |

Common params: `category`, `platform` (web / mobile / hybrid), `limit` (1–100, default 50), `cursor` (opaque; `meta.nextCursor` when more rows), `format=json|csv`. Responses carry `meta.dataset`, `meta.window`, `meta.updatedAt` (newest successful sync among listed rows), `meta.methodology` (page anchor).

CSV: `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="usertrack-<dataset>-<date>.csv"`, header row `position,slug,name,category,projectType,totalUsers,newUsers24h,newUsers7d,newUsers30d,growth7dPct,growth30dPct,activationRatePct,trendingRank,trendingScore7d,rank,rank7dAgo,rankDelta7d,trust,verified,lastSyncedAt,url`. Fields with commas, quotes or newlines are quoted.

Datasets are computed from the same `sortBoard` projection as the pages (max 100 rows per window today — the public set is small; a materialized board table is the planned next step once it exceeds a few thousand products).

## Data safety

- Rows go through `publicSaas` → `stripPrivate` → `saasDto`: owner ids, integration configs, internal ids, `isPublic`, visibility settings and every metric the owner has not published are removed (`docs/ARCHITECTURE.md` → visibility, `src/lib/api/dto.test.ts` forbidden-key test).
- Private projects are never listed; demo rows are flagged `demo: true`.
- Benchmark history is exposed only when the owner keeps the "Benchmark statement" visibility on, and only top-quarter positions (`docs/BENCHMARKS.md`).
- Watchlists are private (`GET /api/v1/following` requires the owner's API key).

## Monthly ranking snapshots

`daily.snapshotRankings` runs on the 1st (03:30 UTC + 40 s) for the previous month: boards `most-new`, `fastest`, `trending` (30-day windows), for "all" and every category with ≥ 3 rankable products, ≤ 100 rows each, stored in `rankingSnapshots` with `sampleSize` and `computedAt`. Idempotent per `(period, board, category)`; `force: true` rewrites. Pages and the datasets API read them by key. Manual: `npx convex run --prod daily:snapshotRankings '{"period":"2026-08"}'`.

## Tests

`src/lib/api/datasets.test.ts` (CSV escaping, cursor, param validation), route tests under `src/app/api/**` where present, `convex/history.test.ts` (snapshot freeze / idempotency / floor).
