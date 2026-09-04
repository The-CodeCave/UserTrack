# Deployment

Two deployables for the product: the **Next.js app on Railway** and the **Convex backend** (functions, DB, crons, auth
component). A third, fully independent deployable — the **interim waitlist** (`apps/waitlist/`) — holds `usertrack.dev`
until launch: its own Convex project and its own Railway service, never built or deployed by the commands below.

## Topology
```
Browser ──► Railway (Next.js 16, node)  ──► Convex prod (handsome-warthog-21)
                 │  /api/auth/*  proxies to Convex HTTP router (Better Auth)
                 └─ OG images rendered with next/og
Convex crons ──► provider APIs (Clerk / Supabase / Firebase / Auth0 / PostHog / Plausible / GA4 / Stripe / endpoint)
             ──► Node runtime action (convex/node/postgres.ts, `pg` via convex.json node.externalPackages) ──► PostgreSQL / Supabase DB (TCP, read-only)
  every 4h sync (staggered) · +20min rerank+trending · 03:30 UTC daily sweep (+ quiet-product check, + retention sweep) · Mon 08:00 UTC digest
  all jobs page their table (convex/jobs.ts) and log to `jobRuns`; cron names are stable
Railway health check ──► GET /api/health (no Convex read) · /api/health?deep=1 adds one Convex read + the jobRuns summary
Next.js (server · edge · browser) ──► Sentry EU (https://*.ingest.de.sentry.io), only when a DSN is set
  · 1st 05:00 UTC monthly report (delivered 09:00 local) · per-user/per-SaaS scheduled reminders (24h)
Convex actions ──► Resend API (mail.usertrack.dev) · Resend webhooks ──► Convex HTTP /webhooks/resend

Interim phase, separate stack (apps/waitlist/ — own pnpm workspace, own lockfile, own node_modules):
Browser ──► Railway `usertrack-waitlist` (Vite/React static, `serve -s dist`) ──► Convex `glad-lynx-143` (waitlist table only)
       └─ same Rybbit site as the main app, so `waitlist_join` and the launched funnel share one dashboard
DNS: usertrack.dev ─(phase A)─► usertrack-waitlist  ──switch at launch──►  usertrack   (HUMAN_TODO.md → step 12)
```

## Environments
| Where | Var | Value |
|---|---|---|
| Railway service `usertrack` | `NEXT_PUBLIC_CONVEX_URL` | `https://<prod>.convex.cloud` |
| | `NEXT_PUBLIC_CONVEX_SITE_URL` | `https://<prod>.convex.site` |
| | `NEXT_PUBLIC_SITE_URL` | `https://usertrack-production.up.railway.app` |
| | `UT_GATEWAY_SECRET` | `openssl rand -hex 32` — **same value on Convex prod**; every gateway / embed / native-event call carries it and the Convex side rejects calls when it is missing or different (fail closed) |
| | `UT_TRUST_CF_HEADERS` | `1` **only while Cloudflare proxies the app** (orange cloud). Then `cf-connecting-ip` / `true-client-ip` key the rate limits instead of the last `x-forwarded-for` hop, which would otherwise be Cloudflare's address for every visitor. Unset/`0` = ignored (they are forgeable when the origin is reachable directly) |
| | `NEXT_PUBLIC_RYBBIT_SITE_ID` | `753f44fa9c50`. Since FIX-1 the site id is only implied for a production build whose `NEXT_PUBLIC_SITE_URL` starts with `https://usertrack.dev`; set it explicitly here so analytics never depends on that inference. Empty string disables the script and every Next.js server event |
| Convex prod (`npx convex env set --prod`) | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| | `UT_GATEWAY_SECRET` | same value as on Railway (fail closed: unset = every gateway call rejected) |
| | `SITE_URL` | same as `NEXT_PUBLIC_SITE_URL` (Better Auth `baseURL` + trusted origin, digest links) |
| | `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | Google OAuth client; redirect URI `<SITE_URL>/api/auth/callback/google` (see `HUMAN_TODO.md`) |
| | `GITHUB_CLIENT_ID` · `GITHUB_CLIENT_SECRET` | GitHub OAuth App; callback `<SITE_URL>/api/auth/callback/github` (see `HUMAN_TODO.md`). Missing → "Continue with GitHub" disabled |
| | `TRUSTMRR_API_KEY` | operator key from https://trustmrr.com/dashboard-dev (`tmrr_…`) for "Import from TrustMRR" (forms + MCP). Missing → button "Not configured", MCP `not_configured`. Dev only: `fixture` serves the built-in example offline (see `HUMAN_TODO.md`) |
| | `X_CLIENT_ID` · `X_CLIENT_SECRET` | also "Continue with X" (Better Auth provider `twitter`, callback `<SITE_URL>/api/auth/callback/twitter` on the same X app as Connect X). Missing → button disabled |
| | `RESEND_API_KEY` | **Required**: email+password accounts must verify their address before they can sign in, and the verification mail goes through Resend. Without it every email is logged as `failed: email not configured` and password sign-ups are locked out (see `HUMAN_TODO.md`) |
| | `EMAIL_FROM` · `EMAIL_REPLY_TO` | set: `UserTrack <noreply@mail.usertrack.dev>` · `hello@usertrack.dev` |
| | `EMAIL_TOKEN_SECRET` | set (random) — signs preference / unsubscribe links |
| Railway service `usertrack` (optional) | `NEXT_PUBLIC_SENTRY_DSN` | Sentry EU DSN. **Unset → the SDK is never initialised and never downloaded.** Set it on Railway (build + runtime) so both the browser and the server report (see `HUMAN_TODO.md`) |
| | `SENTRY_ORG` · `SENTRY_PROJECT` · `SENTRY_AUTH_TOKEN` | Only needed where source maps should be uploaded (CI). Without the token the build never talks to Sentry |
| | `NEXT_PUBLIC_APP_VERSION` | Optional release name for `/api/health` and Sentry; falls back to `RAILWAY_GIT_COMMIT_SHA` (7 chars), then `dev` |
| Convex prod | `RESEND_WEBHOOK_SECRET` | Svix secret of the Resend webhook → `https://handsome-warthog-21.eu-west-1.convex.site/webhooks/resend` (see `HUMAN_TODO.md`) |

Local dev uses `.env.local` (created by `npx convex dev`) plus the dev deployment's env (`npx convex env set …` without `--prod`).

## Ship a release
For the **v1.0 launch** specifically, follow `HUMAN_TODO.md` → *Launch checklist* (13 ordered steps incl. the pending
`migrations:nativeV1` and the domain phases) and `docs/RELEASE-v1.0.md` (schema delta, rollback). The generic loop is:
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm packages:build && pnpm packages:test && pnpm build   # VERIFY
npx convex deploy --yes                                   # backend first (schema, functions, crons)
railway up --service usertrack --ci                       # then the app
```
`railway.toml` pins the builder (Railpack), `pnpm build` / `pnpm start`, and a health check on `/api/health` (OPS-3: static, no Convex read — a Convex outage must not restart a healthy app). Since OPS-2 the public pages are prerendered, so `pnpm build` reads Convex: `NEXT_PUBLIC_CONVEX_URL` must point at a reachable deployment during the build (`pnpm railway:build` does this by construction).

Convex is deployed from a logged-in machine (`npx convex login`). CI can instead set `CONVEX_DEPLOY_KEY` and run `pnpm railway:build` (`convex deploy --cmd 'pnpm build'`).

## The interim waitlist (`apps/waitlist/`)
Deployed and rolled back on its own, from its own directory — nothing here touches the main app:
```bash
cd apps/waitlist && pnpm install          # own lockfile; `packages: []` in its pnpm-workspace.yaml stops the root workspace
npx convex deploy --yes                   # Convex project `usertrack-waitlist` (prod glad-lynx-143), not the product deployment
railway up --service usertrack-waitlist --ci
```
The repo root ignores it by construction: `tsconfig.json` and `eslint.config.mjs` exclude `apps`, `vitest.config.ts` only
collects `src/**` + `convex/**`, and `.github/workflows/ci.yml` has `paths-ignore: ["apps/**", …]`. Retiring it after launch
is a DNS change (step 12 phase B) plus deleting the Railway service; keep the Convex project until the signups are exported.

## First-time setup (already done for this project)
```bash
railway init --name usertrack --workspace "The CodeCave GbmH"
railway add --service usertrack && railway domain --service usertrack --port 3000
railway variables --service usertrack --set KEY=VALUE …
npx convex deploy --yes && npx convex env set --prod BETTER_AUTH_SECRET … && npx convex env set --prod SITE_URL …
npx convex run --prod seed:run      # optional demo data (remove with seed:clear)
```

After a schema-changing deploy, run once: `npx convex run --prod leaderboard:rerank && npx convex run --prod daily:run`.

## Health check
| Request | Answer |
|---|---|
| `GET /api/health` | `200 {"ok":true,"version":"<sha>","uptime":<seconds>}`, `Cache-Control: no-store`, no Convex read. This is what Railway polls |
| `GET /api/health?deep=1` | the same plus `"convex":"ok"\|"down"` and `"jobs"`: the latest `jobRuns` row per job (`job`, `startedAt`, `finishedAt`, `items`, `errors`). Two independent probes, each behind a 3 s timeout — `convex` comes from the `public.stats` read alone, `jobs` from the gateway-gated `jobs.health`; **always 200**, so a Convex blip is visible without triggering a restart |

`jobs.health` requires `UT_GATEWAY_SECRET` on both sides (fail closed). A missing or mismatched secret shows up as
`jobs: "unavailable: gateway secret not configured"` / `"unavailable: jobs.health did not answer"` and leaves
`convex: "ok"` — only the `public.stats` probe decides that field. `/api/health` is not tracked by analytics
(`SKIP_PATTERNS` → `/api/**`).

## CI (`.github/workflows/ci.yml`)
Push and pull request (ignores `apps/**` and markdown): `pnpm install --frozen-lockfile` → `lint` → `typecheck` → `test` →
`packages:build` + `packages:typecheck` + `packages:test` → `build`. **No secrets**: `convex/_generated` is committed and the
build only gets placeholder `NEXT_PUBLIC_CONVEX_URL` / `NEXT_PUBLIC_CONVEX_SITE_URL` / `NEXT_PUBLIC_SITE_URL` values — the
public pages render their degraded state when Convex is unreachable, so the build still passes. `release-packages.yml`
(tag-driven npm publish) is untouched.

## Verify production
- `GET /leaderboard`, `/trending`, `/discover`, `/sitemap.xml`, `/api/v1/leaderboard`, `/api/badge/<slug>.svg` → 200
- Sign up → onboarding → publish → `/s/<slug>` renders, `og:image` returns `image/png`
- Convex dashboard → Crons: `sync all integrations` (4h), `rerank leaderboard`, `daily sweep`, `weekly digest`, `monthly growth report`
- Convex dashboard → Data → `jobRuns`: the latest row per `job` has a `finishedAt`, `pages ≈ projects / page size` (see ARCHITECTURE → Background jobs) and `errors: 0`; a non-zero `errors` names the failing project in `lastError`
- `/app/settings/notifications` renders and toggles persist; `/forgot-password` sends (check `emailEvents` in the dashboard: `sent` with a Resend id, or `failed: email not configured`)
- `npx convex run --prod email/testSend:run '{"to":"you@example.com"}'` → Resend → Emails shows *Delivered*
- `GET /api/health` → `200 {"ok":true,…}` and `GET /api/health?deep=1` → `"convex":"ok"` with a `jobs` array
- Convex dashboard → Data → `jobRuns`: a `retention sweep` row per day with a `finishedAt` (it is the last thing the daily sweep schedules)
