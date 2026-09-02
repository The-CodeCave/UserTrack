# UserTrack Architecture

## TL;DR
Next.js 16 on Railway renders public pages, share images, badges, the JSON API and the MCP server from Convex functions. Convex holds the data, runs Better Auth, the provider sync engine, ranking/trending, daily milestone + benchmark + trust jobs, the weekly digest, and the token-authenticated gateway. A domain layer (`convex/domain/*`) holds the project/integration/metrics rules once; the dashboard, the REST API and MCP are thin adapters over it. Provider adapters live behind one interface and only ever run server-side. Snapshots are append-only; everything the UI ranks by is materialized on the `saas` row.

```
Browser ──► Next.js (Railway)
              ├─ RSC pages ─ fetchQuery(api.public.*) ──────────► Convex queries
              ├─ /api/v1/* (DTO + rate limit) · /api/badge/*.svg ─► Convex queries
              ├─ /mcp (Streamable HTTP, stateless) ─ tools ─► Convex gateway (token hash + UT_GATEWAY_SECRET)
              ├─ /api/auth/[...all] ─────────────────────────────► Convex HTTP (Better Auth)
              ├─ opengraph-image + /s/[slug]/share/[kind]/card ──► next/og (vendored Geist)
              └─ client: ConvexBetterAuthProvider (live queries, follow/connect mutations)

Convex
  ├─ Better Auth component (users, sessions)
  ├─ tables: profiles, saas, integrations, snapshots, dailyMetrics, syncRuns, milestones, events,
  │          follows, fraudFlags, benchmarkAggregates, digests, developerTokens, apiUsage, auditLogs
  ├─ domain/: projects · integrations · metrics (shared rules) ◄── saas.ts / integrations.ts / gateway.ts
  ├─ crons: sync every 4h (staggered) · rerank+trending +20min · daily sweep 03:30 UTC · digest Mon 08:00 UTC
  └─ providers/: clerk | supabase | firebase | auth0 | posthog | plausible | ga4 | stripe | endpoint | manual
```

## Auth
Better Auth (email + password) runs inside Convex via `@convex-dev/better-auth`. Next.js proxies `/api/auth/*`; `src/proxy.ts` guards `/app/*`. App data references users by Better Auth `userId` on `profiles.userId`. The digest sender looks up emails with `authComponent.getAnyUserById`.

## Data model
| Table | Purpose | Indexes |
|---|---|---|
| `profiles` | founder identity, links (website/X/GitHub/LinkedIn), `digestOptIn`, `followerCount` | `by_userId`, `by_username`, search `displayName` |
| `saas` | listing + category + visibility + **all derived metrics**: totals, new 24h/7d/30d (+ previous windows), growth %, ranks (+ prev/best), trending scores 24h/7d/30d + rank, activation, retention (estimated), traffic/revenue (+ `showTraffic`/`showRevenue`), `trustScore`/`trustState`, `followerCount`, `streakDays` | `by_slug`, `by_owner`, `by_public_trust_new30d`, `by_public_new30d`, `by_public_category`, search `name` + `description` |
| `integrations` | one per SaaS **per role** (`users` · `activation` · `traffic` · `revenue`); `config` holds secrets and is only read by `internal.integrations.getForSync`; status, trust, last success/failure, consecutive failures, `connectedAt`, `backfilledAt` | `by_saas`, `by_saas_role` |
| `snapshots` | append-only `{totalUsers, capturedAt, source, trust, syncRunId, backfilled?}` | `by_saas_time` |
| `dailyMetrics` | one row per SaaS per UTC day: `totalUsers`, `newUsers`, optional `activatedUsers`, `newActivated`, `visitors`, `sessions`, `payingUsers`, `mrr`, `activeUsers30d` | `by_saas_day` |
| `syncRuns` | audit log per attempt: role, provider, duration, attempt, status, error | `by_saas_time` |
| `milestones` | persisted achievements, unique `key` per SaaS, title + shareable copy | `by_saas_key`, `by_saas_time`, `by_time` |
| `events` | chart annotations: growth/activation spikes, reconnects, source changes (one per kind per day) | `by_saas_time`, `by_saas_kind_day` |
| `follows` | profile → saas/profile | `by_follower`, `by_target`, `by_follower_target` |
| `fraudFlags` | internal anomaly model (kind, severity, detail, resolvedAt); never rendered verbatim publicly | `by_saas`, `by_saas_open` |
| `benchmarkAggregates` | deciles per `(groupKey, metric)`; individual values are never stored | `by_group_metric` |
| `digests` | weekly payload per profile, `sentAt`/`sendError` | `by_profile_week`, `by_week` |
| `developerTokens` | API keys (`type: "api"`) and MCP tokens (`type: "mcp"`): `name`, display `prefix` (`ut_mcp_a8f3`), SHA-256 `hash` of the secret, `scopes[]`, `origin` (settings / onboarding), `createdAt`, `lastUsedAt` (touched at most once a minute), `revokedAt`, `expiresAt` | `by_hash`, `by_profile` |
| `apiUsage` | bucketed counters: one row per token × UTC day × category (endpoint or tool name); summed for the daily quota and the usage dashboard | `by_token_day` |
| `auditLogs` | token-authenticated writes, token lifecycle events and onboarding funnel events (`event:*`): `action`, `saasId?`, `ok`, short `detail`; never configs or secrets | `by_token_time`, `by_profile_time` |

All v0.2 fields are optional so the schema migrated in place over v0.1 data. `integrations.role === undefined` is treated as `users`.

## Provider architecture
`convex/providers/types.ts`:
```ts
interface Provider<Config> {
  kind; label; roles: Role[]; capabilities: Capability[];
  validate(config, role) → { ok, config } | { ok: false, error }
  trust(config, saasWebsiteUrl) → "verified" | "unverified" | "pending"
  fetch(config, role) → ProviderMetrics        // normalized: totalUsers, newUsers24h/7d/30d, activeUsers30d,
                                               // activatedUsers(+24h/7d/30d), visitors30d, sessions30d, visitorsPrev30d,
                                               // payingUsers, mrr (cents), currency
  fetchHistory?(config, role, days) → { metric, points[{day, value}] } | null
  publicConfig(config) → masked, secret-free view for the owner UI
}
```
| Provider | Roles | Reads | History |
|---|---|---|---|
| Clerk | users | `/v1/users/count` with `created_at_after`, `last_active_at_since` | 30 daily `created_at_before` counts |
| Supabase | users, activation | admin users count, or PostgREST `count=exact` on a table (+ `created_at` column for ranges) | per-day counts when a created_at column exists |
| Firebase | users | Identity Toolkit `accounts:query` (`recordsCount`) via service-account JWT (WebCrypto RS256) | – |
| Auth0 | users | Management API totals (+ `created_at` search), `/stats/active-users`, `/stats/daily` | daily signups → totals reconstructed backwards |
| PostHog | activation, traffic | HogQL `count(distinct person_id)` for the activation event / `$pageview` | daily activation (cumulative) / visitors |
| Plausible | traffic | `stats/aggregate` (+ previous period) | `stats/timeseries` |
| GA4 | traffic | Data API `runReport` activeUsers + sessions, two date ranges | daily activeUsers |
| Stripe | revenue | active subscriptions paginated → distinct customers, MRR normalized to monthly cents | – |
| JSON endpoint | any | `GET url` → role-specific keys; verified only when host matches the SaaS website | – |
| Manual | users | the typed number | – |

`ProviderError(message, retryable)` distinguishes transient (429/5xx) from configuration errors; only transient failures are retried.

## Sync engine (`convex/sync.ts`)
1. Cron every 4h → `runAll` schedules `runOne(integrationId, attempt=1)` for every integration **spread evenly over 10 minutes**.
2. `runOne` (action) calls `provider.fetch(config, role)`.
   - success → `recordSuccess`: `syncRuns` row, integration status/last success; by role:
     - **users**: append `snapshots` row, upsert today's `dailyMetrics`, `recomputeDerived` (windows from indexed snapshot lookups at now−1/2/7/14/30/60 d; provider-reported window counts fill in while history is shorter than the window), threshold milestones (never on the first snapshot), spike detection (≥3× trailing 14-day average and ≥20), anomaly checks → `fraudFlags`.
     - **activation**: activated fields + rate, daily rows, activated milestones, activation spikes, `activation_exceeds_users` flag.
     - **traffic**: rolling 30-day visitors/sessions (+ previous period); traffic history refreshed for the last 7 days on every run.
     - **revenue**: paying users, MRR, currency.
     Then `refreshTrust`.
   - first success (or every traffic run) → `provider.fetchHistory` → `recordHistory`: backfilled snapshots (`backfilled: true`) and daily rows only for days **before** the first live snapshot; derived metrics recomputed.
   - failure → `recordFailure`: run log, `consecutiveFailures`, retry after 10/20 minutes (max 3 attempts) if retryable; 6 consecutive users-role failures demote the SaaS to `pending`.
3. `integrations.connect` replaces the integration for that role, records a `reconnect` event (users role), marks the SaaS `pending` and triggers an immediate sync. `syncNow` has a 60 s cooldown.

## Ranking & trending (`convex/leaderboard.ts`, `convex/lib/trending.ts`)
- **Leaderboard rank**: public + `verified` + not demo + not under review, ordered by `newUsers30d`, tiebreak growth %, total. `prevRank`/`bestRank` tracked for movement and milestones.
- **Trending score** (per window 24h/7d/30d):
  `score = 100 · log10(1+new)^1.5 · (1 + min(new/max(base,50), 2)) · (1 + 0.5·clamp((new−prev)/max(prev,10), −0.5, 2)) · (0.5 + 0.5·trust/100) · (1 + 0.25·activationRate)`; < 5 new users → 0. `trendingRank` is the 7-day order; `prevTrendingRank` gives movement. Recomputed 20 minutes after each sync cycle.
- **Boards** (`public.board`): trending, fastest (≥10 new users), most-users, most-new, most-activated, activation-rate (≥50 users), new-rising (first snapshot ≤30 days). Filters: window, category, size bucket, verified-only. The public set is small, so boards are field sorts over one indexed read; ranks and trending are the precomputed parts.

## Trust model (`convex/lib/trust.ts`, `convex/trust.ts`)
Score = provider base (auth 40 · analytics/endpoint 30 · foreign endpoint 10 · manual 5) + connection age (≤25 over 30 days) + sync continuity (≤20) + activation data (5) − open flags (high 15 / medium 8 / low 3).
State: any high flag → `review`; any flag → `anomaly`; score < 35 → `low_confidence`; else `healthy`.
Public label: `pending` → Pending · `review` → **Data under review** · `unverified` → Self-reported · score < 60 → **Partially verified** · else **Verified**. Under-review products keep their page but lose ranks until flags auto-resolve (7–14 days, daily job). Heuristics: impossible growth (>5× base in ≤24h with ≥500 users, or >max(200, 25% of base)/hour), sudden drop (≥20%), reconnect churn (≥3 reconnects/7d), source switching, activation > users, stale source (no sync 3+ days).

## Milestones, spikes, benchmarks (`convex/daily.ts`)
- Thresholds detected on each snapshot; rank/trending milestones after each rerank; best day/week, streaks (7/30/90) and monthly growth (+25/50/100 %) in the daily sweep. Keys are unique per SaaS so nothing is re-created.
- Spikes and reconnects become `events` and render as chart annotations (`public.annotations`, capped at 8 + 8 per range).
- Benchmarks: daily deciles for `growth30dPct`, `growth7dPct`, `newUsers30d`, `activationRatePct` per group `all`, `cat:<category>`, `size:<bucket>`; groups with < 5 verified non-demo products are dropped. Owner percentile is interpolated and rounded to 5.

## Follow & digest
`follows.toggle` is idempotent and maintains `followerCount`. `digest.generate` (Monday 08:00 UTC) builds one payload per opted-in profile (own products, followed movers, milestones, leaderboard movers, trending), stores it, then `digest.sendAll` emails through Resend if `RESEND_API_KEY` + `DIGEST_FROM_EMAIL` are set — otherwise digests are in-app only (`/app/digest`, "Preview this week" builds one on demand).

## Domain layer, gateway and adapters (v0.3)

```
                     ┌────────────────────── UserTrack Core (Convex) ──────────────────────┐
                     │  convex/domain/projects.ts     create · update · slug · ownership     │
                     │  convex/domain/integrations.ts connect · requestSync · secret-free view│
                     │  convex/domain/metrics.ts      summaries · series · milestones · share │
                     └──────▲──────────────────▲──────────────────────────▲─────────────────┘
                            │                  │                          │
     session (Better Auth)  │        convex/gateway.ts (token hash + gateway secret)
     saas.ts / integrations │                  │                          │
                            │        ┌─────────┴──────────┐    ┌──────────┴──────────┐
                     Dashboard      REST API /api/v1        MCP /mcp (15 tools)
                     /app/*         src/lib/api/*           src/lib/mcp/*
```

- **Domain layer** (`convex/domain/`): pure rules over `ctx.db`, no auth. `projects.ts` normalizes input, allocates slugs, resolves a project by id *or* slug and enforces ownership (`requireOwnedProject`), and finds an owned project by canonical domain (`findOwnedByDomain`, via `convex/lib/domain.ts`: lowercase, trailing dots and `www.` stripped) which makes agent retries idempotent. `integrations.ts` connects one source per role (replacing the previous one, recording a `reconnect` event, scheduling the first sync) and requests syncs with a 60 s cooldown per source. `metrics.ts` produces the owner-facing summaries, chart series, milestone lists and share URLs. Failures are typed `DomainError(code, message, retryAfterSec?)` so every interface maps them without string matching.
- **Gateway** (`convex/gateway.ts`): every function takes `auth: { hash, gateway }`. `authenticate` checks `gateway === UT_GATEWAY_SECRET` (proves the call came from the Next.js server), looks the hash up in `developerTokens.by_hash`, rejects the wrong token type, revoked and expired tokens, checks the required scope, and loads the owner profile. `authorize` (one mutation per request) additionally applies the daily quota and increments the `apiUsage` bucket. Writes append to `auditLogs`. Create is idempotent by domain and capped at 10 new projects/hour/token; verify has a 20 s cooldown per project; sync 60 s per source.
- **Token model** (`convex/lib/tokens.ts`, `convex/tokens.ts`): secrets are `ut_api_` / `ut_mcp_` + 40 base62 chars, hashed with a runtime-agnostic SHA-256 (same function in Convex and Node), shown once. Six scopes; API keys always get `metrics:read`, MCP tokens default to all six. Plan limits live in `PLANS.free` so per-plan limits can be added without touching call sites. Max 25 active tokens per account.
- **REST adapter** (`src/lib/api/respond.ts`, `gateway.ts`, `dto.ts`, `openapi.ts`): `withApi(category, handler)` picks the anonymous IP bucket or, when a `ut_api_` key is present, the burst bucket + `gateway.authorize`; sets `X-RateLimit-*` and `Retry-After`; forces `private, no-store` on keyed responses. DTOs copy fields explicitly so nothing internal leaks. The OpenAPI document is generated from code.
- **MCP adapter** (`src/app/mcp/route.ts`, `src/lib/mcp/server.ts`, `tools.ts`, `snippets.ts`): Streamable HTTP, stateless, JSON responses; one `McpServer` + transport per request. Each tool is a typed (zod) wrapper over one gateway function; before running it, the server applies the per-token burst bucket and `gateway.authorize` with the tool's scope. Gateway failures become `isError` tool results with a `hint`. Server instructions carry the 9-step setup workflow; `convex/lib/integrationSetup.ts` turns the provider catalog into executable step lists with code templates.
- **Rate-limit design**: two layers. Per-day quotas are bucketed counters in Convex (`apiUsage`, one row per token/day/category, summed on each call) so they survive deploys and are visible in the dashboard. Burst limits (anonymous 60/min per IP, API key 120/min, MCP 60/min) are in-process token buckets in `src/lib/api/rate-limit.ts` that reset on deploy, which is acceptable for a single Railway replica.
- **Onboarding status** (`convex/onboarding.ts`): the "Set up with AI" page derives progress purely from data that already exists: the onboarding token's `lastUsedAt` (agent connected), the `create_project` audit entry or the newest project created after the token (project created), the `users` integration and its status, a successful `verify_integration` entry, `saas.lastSyncedAt` and `isPublic`. Funnel events (`onboarding_ai_setup_selected`, `mcp_setup_started`, `agent_prompt_copied`, …) are stored as `event:*` rows in `auditLogs` because no analytics stack exists.

## Public surface
- **Pages** are dynamic RSC (`force-dynamic`) reading Convex; Convex caches query results.
- **Share cards**: `/s/[slug]/share/[kind]` (`users`, `growth`, `rank`, `trending`, `activation`, `milestone-<id>`) with an `opengraph-image` and a `/card` PNG route sharing one renderer (`src/lib/og/share-card.tsx`).
- **Badges**: `/api/badge/[slug].svg?type=users|growth|trending|verified&theme=dark|light`, `s-maxage=3600`.
- **API**: `src/lib/api/dto.ts` maps rows field-by-field (never spreads), so internal fields (`ownerId`, `trustState`, flags, config) cannot leak. Anonymous: 60/min/IP; with an API key: 1,000/day + 120/min burst. OpenAPI at `/api/openapi.json`. See `docs/API.md`.
- **MCP**: `/mcp`, bearer `ut_mcp_` tokens, 15 tools scoped to the token owner's projects. See `docs/MCP.md`.
- **SEO**: canonical URLs, OG/Twitter metadata, JSON-LD `SoftwareApplication` on product pages, `sitemap.ts` (products, profiles, categories, boards), `robots.ts` (disallows `/app`, auth).

## Charts
Recharts 3. `public.series` returns snapshots for 24H/7D and daily rows for 30D+ (with optional `activated`/`visitors`). The growth chart draws the total (white) with a pink wash, an optional dashed activated series, annotation markers snapped to the nearest point (▲ milestone, ○ spike, ◇ source change) with tooltips, "New" bar mode, and respects `prefers-reduced-motion`. `/compare` uses a 4-series line chart with an "indexed = 100" mode so products of different sizes are comparable.

## Environments
See `docs/DEPLOYMENT.md`.
