# UserTrack Architecture

## TL;DR
Next.js 16 on Railway renders public pages, share images, badges and the JSON API from Convex queries. Convex holds the data, runs Better Auth, the provider sync engine, ranking/trending, daily milestone + benchmark + trust jobs, and the weekly digest. Provider adapters live behind one interface and only ever run server-side. Snapshots are append-only; everything the UI ranks by is materialized on the `saas` row.

```
Browser ──► Next.js (Railway)
              ├─ RSC pages ─ fetchQuery(api.public.*) ──────────► Convex queries
              ├─ /api/v1/* (DTO + rate limit) · /api/badge/*.svg ─► Convex queries
              ├─ /api/auth/[...all] ─────────────────────────────► Convex HTTP (Better Auth)
              ├─ opengraph-image + /s/[slug]/share/[kind]/card ──► next/og (vendored Geist)
              └─ client: ConvexBetterAuthProvider (live queries, follow/connect mutations)

Convex
  ├─ Better Auth component (users, sessions)
  ├─ tables: profiles, saas, integrations, snapshots, dailyMetrics, syncRuns, milestones, events,
  │          follows, fraudFlags, benchmarkAggregates, digests,
  │          emailPreferences, emailEvents, emailRecipients, monthlyReports
  ├─ crons: sync every 4h (staggered) · rerank+trending +20min · daily sweep 03:30 UTC · digest Mon 08:00 UTC
  │         · monthly report 1st 05:00 UTC · per-entity scheduled reminders (24h)
  ├─ email/: send (Resend) · templates · prefs · lifecycle · growth · reports · webhook  ──► api.resend.com
  ├─ HTTP: /api/auth/* (Better Auth) · /webhooks/resend (Svix-verified) · /email/unsubscribe (one-click)
  └─ providers/: clerk | supabase | firebase | auth0 | posthog | plausible | ga4 | stripe | endpoint | manual
```

## Auth
Better Auth (email + password, Google) runs inside Convex via `@convex-dev/better-auth`. Next.js proxies `/api/auth/*`; `src/proxy.ts` guards `/app/*`. App data references users by Better Auth `userId` on `profiles.userId`. Email hooks: `emailAndPassword.sendResetPassword` and `emailVerification.sendVerificationEmail` (`sendOnSignUp: true`, 24h tokens) schedule `internal.email.send.deliverTransactional`; a `user.onCreate` trigger sends the plain welcome to already-verified (Google) users and schedules the 24h profile reminder. The email system reaches auth users only through `convex/email/users.ts` (`findAuthUser`).

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
| `emailPreferences` | per Better Auth `userId`: `productNudges`, `growthMilestones`, `rankingMilestones`, `growthAlerts`, `monthlyReport`, `weeklyDigest`, `followedSaasUpdates`, `timezone`; missing row = defaults | `by_userId` |
| `emailEvents` | delivery log **and** dedupe ledger: `emailType`, `category`, `recipient`, unique `dedupeKey`, `status` (queued · sent · delivered · bounced · complained · failed · skipped), `attempts`, `providerMessageId`, `metadata` (template data / skip reason — never auth tokens) | `by_dedupe`, `by_user_time`, `by_saas_type_time`, `by_provider_message`, `by_status_time` |
| `emailRecipients` | address health from webhooks: active · bounced · complained · suppressed | `by_email` |
| `monthlyReports` | one consolidated payload per profile per `period` (`2026-08`), `deliverAt`, `sentAt`, `emailEventId` | `by_profile_period`, `by_period` |

`integrations` additionally carries `healthState` / `unhealthySince` (email state machine) and `dailyMetrics.rank` stores the leaderboard rank at the end of each closed day.

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
`follows.toggle` is idempotent and maintains `followerCount`. `digest.generate` (Monday 08:00 UTC, paged 50 profiles per mutation) builds one payload per profile with `weeklyDigest` enabled (own products, followed movers, milestones, leaderboard movers, trending), stores it in-app (`/app/digest`) and enqueues the `weekly-digest` email only when there is a signal (own movement, followed products or milestones). "Preview this week" rebuilds the caller's digest without emailing.

## Email subsystem (`convex/email/`)
```
trigger (auth hook · sync · rerank · daily · cron · scheduler)
   └─ enqueue(ctx, { userId, type, dedupeKey, data })          mutation-side, atomic
        ├─ dedupe: emailEvents.by_dedupe  → duplicate? stop
        ├─ recipient: findAuthUser        → none? skipped
        ├─ preference (non-transactional) → off? skipped (row kept, so the key stays taken)
        ├─ emailRecipients health         → bounced/complained? skipped (except reset/verify)
        └─ insert emailEvents{queued} + scheduler.runAfter(delay, send.deliver)
   send.deliver (action): load event + signed prefs token → renderEmail → Resend (Idempotency-Key = dedupeKey,
                          List-Unsubscribe + One-Click headers) → markSent(providerMessageId) | markFailed(retry ×3: 0 / 5 / 30 min)
   webhook /webhooks/resend (Svix HMAC) → delivered / bounced / complained / failed → event status + emailRecipients
```
- **Categories.** `EMAIL_META` maps every `EmailType` to a category and a preference key (`null` = transactional, never gated): welcome, verify-email, reset-password, source-failed, source-recovered → transactional · profile-reminder, missing-source, source-connected → `productNudges` · user-milestone → `growthMilestones` · rank-milestone → `rankingMilestones` · growth-spike, no-growth → `growthAlerts` · monthly-report · weekly-digest · followed-update.
- **Dedupe keys** are deterministic and documented next to each rule: `welcome:{userId}` · `profile-reminder:{userId}` · `missing-source:{saasId}` · `source-connected:{saasId}` · `source-failed:{integrationId}:{unhealthySince}` · `source-recovered:{integrationId}:{unhealthySince}` · `user-milestone:{saasId}:{threshold}` · `rank-milestone:{saasId}:top{N}` · `growth-spike:{saasId}:{7-day bucket}` · `no-growth:{saasId}:{lastGrowthDay}` · `monthly-report:{userId}:{YYYY-MM}` · `weekly-digest:{userId}:{ISO week}` · `followed-update:{saasId}:{event}:{followerUserId}`. A `skipped` row also takes the key, so a milestone reached while a preference was off is never sent later.
- **Rules** are pure and unit-tested in `convex/lib/emailRules.ts`: threshold crossings (`EMAIL_USER_THRESHOLDS`, only the highest crossing mails), `enteredRankThresholds` (needs `boardSize > t`), `evaluateSpike` (≥14 closed days, 24h ≥ 2.5× the 30-day daily mean, ≥20 users, 7-day cooldown from the last spike email), `isUnhealthy` (≥6 consecutive failures, or ≥3 with no success for 24h), `evaluateNoGrowth` (public, healthy source, ≥50 users, ≥10 new in 30d, 7 closed zero days; key = last day with growth), `projectReport` / `monthlySummary`, `nextLocalHour` (09:00 in the user's IANA zone, UTC fallback).
- **Scheduling.** 24h reminders are per-entity `scheduler.runAfter` calls made at signup / SaaS creation (durable, no scans); the daily sweep writes rank history and runs `noGrowthSweep` (paged); `generateMonthly` runs on the 1st at 05:00 UTC, pages profiles 50 at a time, stores `monthlyReports` and schedules `sendMonthly` at each user's local 09:00; the digest pages the same way. All jobs are idempotent (dedupe keys / `by_profile_period` / `by_profile_week`).
- **Transactional auth mail** bypasses `enqueue`: Better Auth hooks schedule `deliverTransactional` with the one-time URL as an argument; the event row records type/recipient/status only.
- **Preferences & links.** `prefs.mine/update` (authenticated), `prefs.byToken/updateByToken` (HMAC-SHA256 token, 90 days, `EMAIL_TOKEN_SECRET`), `/email/preferences?token=…` (Next.js page, no login), `GET|POST <convex site>/email/unsubscribe?token=…` (RFC 8058 one-click, turns every optional category off). Transactional templates carry no unsubscribe link.
- **Followers.** Milestone ≥1,000 users, Top 10 / 5 / #1 and ≥3× spikes fan out (scheduled mutation) to followers of the product and of its founder who opted into `followedSaasUpdates`; the owner is excluded.
- **Observability.** Every attempt is a row; `console.log("email sent type=… key=… resend=…")` / `console.error` in the deliver action; the settings page can read `send.recentForUser`. Secrets and tokens are never logged.

## Public surface
- **Pages** are dynamic RSC (`force-dynamic`) reading Convex; Convex caches query results.
- **Share cards**: `/s/[slug]/share/[kind]` (`users`, `growth`, `rank`, `trending`, `activation`, `milestone-<id>`) with an `opengraph-image` and a `/card` PNG route sharing one renderer (`src/lib/og/share-card.tsx`).
- **Badges**: `/api/badge/[slug].svg?type=users|growth|trending|verified&theme=dark|light`, `s-maxage=3600`.
- **API**: `src/lib/api/dto.ts` maps rows field-by-field (never spreads), so internal fields (`ownerId`, `trustState`, flags, config) cannot leak. Rate limit: in-process token bucket, 60/min/IP. See `docs/API.md`.
- **SEO**: canonical URLs, OG/Twitter metadata, JSON-LD `SoftwareApplication` on product pages, `sitemap.ts` (products, profiles, categories, boards), `robots.ts` (disallows `/app`, auth).

## Charts
Recharts 3. `public.series` returns snapshots for 24H/7D and daily rows for 30D+ (with optional `activated`/`visitors`). The growth chart draws the total (white) with a pink wash, an optional dashed activated series, annotation markers snapped to the nearest point (▲ milestone, ○ spike, ◇ source change) with tooltips, "New" bar mode, and respects `prefers-reduced-motion`. `/compare` uses a 4-series line chart with an "indexed = 100" mode so products of different sizes are comparable.

## Environments
See `docs/DEPLOYMENT.md`.
