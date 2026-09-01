# UserTrack Architecture

## TL;DR
Next.js 16 (App Router, RSC) on Railway → Convex Cloud (DB + functions + cron + Better Auth component). Provider adapters pull user counts every 4h into immutable snapshots; derived metrics are materialized directly on the `saas` row (total, new 24h/7d/30d, growth %, rank) to power the leaderboard, charts and OG images without recomputing history.

```
Browser ──► Next.js (Railway)
              ├─ RSC pages: fetchQuery(api.public.*)  ──► Convex queries
              ├─ /api/auth/[...all] ─────────────────► Convex HTTP (Better Auth)
              ├─ /s/[slug]/opengraph-image (next/og, vendored Geist woff) ─► Convex query
              └─ Client: ConvexBetterAuthProvider (live queries)

Convex
  ├─ Better Auth component  (users, sessions, accounts)
  ├─ profiles, saas, integrations, snapshots, dailyMetrics, syncRuns
  ├─ crons.ts: every 4h → sync.runAll → sync.runOne per integration; rerank 10 min later
  └─ providers/: clerk | supabase | endpoint | manual  (Provider interface)
```

## Auth
- **Better Auth** (email + password) runs *inside Convex* via `@convex-dev/better-auth`. Auth tables live in the component; Next.js proxies `/api/auth/*` to Convex's HTTP router.
- Server components use `fetchAuthQuery` / `isAuthenticated` from `src/lib/auth-server.ts`; client uses `authClient` + `ConvexBetterAuthProvider`.
- `proxy.ts` redirects unauthenticated users away from `/app/*` and authenticated users away from `/sign-in`.
- App data references users by Better Auth `userId` (string) stored on `profiles.userId`.

## Data model (Convex)
| Table | Purpose | Key indexes |
|---|---|---|
| `profiles` | display name, username, avatar, bio, links, `onboardingCompleted` | `by_userId`, `by_username` |
| `saas` | listing + owner + slug + trust + visibility **+ derived metrics** (`totalUsers`, `newUsers24h/7d/30d`, `growth30dPct`, `rank`, `lastSyncedAt`, `firstSnapshotAt`, `isDemo`) | `by_slug`, `by_owner`, `by_public_trust_new30d`, `by_public_new30d` |
| `integrations` | one per SaaS: provider, `config` (incl. secrets, never returned to clients), status, trust, lastError | `by_saas` |
| `snapshots` | **append-only** `{saasId, totalUsers, capturedAt, source, trust, syncRunId}` | `by_saas_time` |
| `dailyMetrics` | one row per SaaS per UTC day (last total of the day, new that day) — feeds 30D+ charts and sparklines | `by_saas_day` |
| `syncRuns` | audit log per sync attempt (ok / error + message) | `by_saas_time` |

Secrets: `integrations.config` is read only by `internal.integrations.getForSync` (called from the sync action). Public/owner queries expose provider kind + status only.

## Sync engine
1. `crons.ts` → `internal.sync.runAll` every 4 hours; `internal.leaderboard.rerank` at minute 10 of the same cycle.
2. `runAll` lists integrations and schedules `internal.sync.runOne(integrationId)` for each (parallel actions).
3. `runOne` (action) loads the provider adapter (`convex/providers/*`), calls `fetchTotalUsers(config)`, then:
   - success → `internal.sync.recordSnapshot`: insert `syncRuns` + immutable `snapshots` row, upsert today's `dailyMetrics`, recompute the derived fields on `saas` from indexed lookups (snapshot at/before now−24h/7d/30d, else first snapshot), set `trust` from the provider.
   - failure → `internal.sync.recordFailure`: log the run, mark the integration `error`; six consecutive failures demote the SaaS to `pending`.
4. Owners can trigger `integrations.syncNow` (60s cooldown). Connecting a source runs a first sync immediately.
5. `rerank` orders public + verified (+ non-demo) SaaS by `newUsers30d` desc, tiebreak `growth30dPct`, `totalUsers`, and writes `rank`; everything else gets `rank = undefined`. Also scheduled on publish/unpublish.

## Trust model
| Level | Meaning | Ranked? |
|---|---|---|
| `verified` | Auto-synced from Clerk / Supabase, or from a JSON endpoint whose host matches the SaaS website host | Yes |
| `unverified` | Manual snapshot entry, or endpoint on a foreign host | Listed only in the "All sources" toggle, badged |
| `pending` | Integration saved but no successful sync yet | No |

Provenance is stored per snapshot (`source`, `trust`, `syncRunId`), so the trust level can change over time without rewriting history.

## Charts
Recharts 3. `api.public.series({slug, range})` returns pre-bucketed points: 24H/7D use raw snapshots, 30D+ use `dailyMetrics`. Single-series charts: 2px white line, pink area wash and end-dot, hairline grid; "New" mode switches to pink bars (≤ 24px, 4px rounded caps). Crosshair tooltip on hover; empty state after < 2 points.

## OG images
`src/app/(public)/s/[slug]/opengraph-image.tsx` uses `next/og` `ImageResponse` with the shared blueprint frame in `src/lib/og/frame.tsx` and vendored Geist woff fonts (`public/fonts`, loaded via `fs` so rendering never hits the network). Shows name, trust badge, total users, +30d, growth % and a 30-day sparkline. `/u/[username]` and `/leaderboard` have their own images. Next appends a content hash to the image URL; always read it from the page's `og:image` meta tag.

## Environments
See `docs/DEPLOYMENT.md`.
