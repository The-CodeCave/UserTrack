# UserTrack Architecture

## TL;DR
Next.js 16 (App Router, RSC) on Railway → Convex Cloud (DB + functions + cron + Better Auth component). Provider adapters pull user counts every 4h into immutable snapshots; a materialized `saasMetrics` row per SaaS powers the leaderboard, charts and OG images.

```
Browser ──► Next.js (Railway)
              ├─ RSC pages: fetchQuery(api.public.*)  ──► Convex queries
              ├─ /api/auth/[...all] ─────────────────► Convex HTTP (Better Auth)
              ├─ /s/[slug]/opengraph-image (next/og) ─► Convex query
              └─ Client: ConvexBetterAuthProvider (live queries)

Convex
  ├─ Better Auth component  (users, sessions, accounts)
  ├─ profiles, saas, integrations, snapshots, dailyMetrics, saasMetrics, syncRuns
  ├─ crons.ts: every 4h → sync.runAll → per-SaaS sync action
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
| `profiles` | display name, username, avatar, bio, links | `by_userId`, `by_username` |
| `saas` | product listing, owner, slug, trust status, visibility | `by_slug`, `by_ownerId`, `by_published` |
| `integrations` | one per SaaS: provider, config, **secret**, status, lastError | `by_saasId` |
| `snapshots` | **append-only** `{saasId, totalUsers, capturedAt, trust, syncRunId}` | `by_saas_time` |
| `dailyMetrics` | one row per SaaS per UTC day (last total of the day, new that day) | `by_saas_day` |
| `saasMetrics` | materialized: total, new24h/7d/30d, growth30dPct, sparkline, lastSyncedAt, rank | `by_saasId`, `by_new30d`, `by_growth30d` |
| `syncRuns` | audit log per sync attempt | `by_saasId` |

## Sync engine
1. `crons.ts` → `internal.sync.runAll` every 4 hours.
2. `runAll` lists active integrations and schedules `internal.sync.syncOne(saasId)` with jitter.
3. `syncOne` (action) resolves the provider adapter, calls `fetchTotalUsers(config, secret)`, then calls `internal.snapshots.record` (mutation) which:
   - inserts an immutable snapshot,
   - upserts today's `dailyMetrics`,
   - recomputes `saasMetrics` from indexed lookups (30d-ago snapshot, 7d, 24h),
   - updates `integrations.status/lastError`, and `saas.trust`.
4. Ranks are assigned by `internal.leaderboard.rerank` after each cron sweep (single ordered scan).

## Trust model
| Level | Meaning | Ranked? |
|---|---|---|
| `verified` | Auto-synced from Clerk / Supabase, or from a JSON endpoint whose host matches the SaaS website host | Yes |
| `unverified` | Manual snapshot entry, or endpoint on a foreign host | Listed only in the "All sources" toggle, badged |
| `pending` | Integration saved but no successful sync yet | No |

Provenance is stored per snapshot (`source`, `trust`, `syncRunId`), so the trust level can change over time without rewriting history.

## Charts
Recharts 3. `api.public.series({slug, range})` returns pre-bucketed points: 24H/7D use raw snapshots, 30D+ use `dailyMetrics`. Charts render white strokes with a pink highlight area and a blueprint grid.

## OG images
`src/app/s/[slug]/opengraph-image.tsx` uses `next/og` ImageResponse, pulls `api.public.saasBySlug`, draws name, total users, +30d, trust badge and a sparkline polyline. Same for `/u/[username]` and `/leaderboard`.

## Environments
See `docs/DEPLOYMENT.md`.
