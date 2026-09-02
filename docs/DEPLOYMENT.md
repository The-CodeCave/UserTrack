# Deployment

Two deployables: the **Next.js app on Railway** and the **Convex backend** (functions, DB, crons, auth component).

## Topology
```
Browser ──► Railway (Next.js 16, node)  ──► Convex prod (handsome-warthog-21)
                 │  /api/auth/*  proxies to Convex HTTP router (Better Auth)
                 └─ OG images rendered with next/og
Convex crons ──► provider APIs (Clerk / Supabase / Firebase / Auth0 / PostHog / Plausible / GA4 / Stripe / endpoint)
             ──► Node runtime action (convex/node/postgres.ts, `pg` via convex.json node.externalPackages) ──► PostgreSQL / Supabase DB (TCP, read-only)
  every 4h sync (staggered) · +20min rerank+trending · 03:30 UTC daily sweep (+ quiet-product check) · Mon 08:00 UTC digest
  · 1st 05:00 UTC monthly report (delivered 09:00 local) · per-user/per-SaaS scheduled reminders (24h)
Convex actions ──► Resend API (mail.usertrack.dev) · Resend webhooks ──► Convex HTTP /webhooks/resend
```

## Environments
| Where | Var | Value |
|---|---|---|
| Railway service `usertrack` | `NEXT_PUBLIC_CONVEX_URL` | `https://<prod>.convex.cloud` |
| | `NEXT_PUBLIC_CONVEX_SITE_URL` | `https://<prod>.convex.site` |
| | `NEXT_PUBLIC_SITE_URL` | `https://usertrack-production.up.railway.app` |
| Convex prod (`npx convex env set --prod`) | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| | `SITE_URL` | same as `NEXT_PUBLIC_SITE_URL` (Better Auth `baseURL` + trusted origin, digest links) |
| | `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | Google OAuth client; redirect URI `<SITE_URL>/api/auth/callback/google` (see `HUMAN_TODO.md`) |
| | `RESEND_API_KEY` | Resend sending key for `mail.usertrack.dev` — without it every email is logged as `failed: email not configured` (see `HUMAN_TODO.md`) |
| | `EMAIL_FROM` · `EMAIL_REPLY_TO` | set: `UserTrack <noreply@mail.usertrack.dev>` · `hello@usertrack.dev` |
| | `EMAIL_TOKEN_SECRET` | set (random) — signs preference / unsubscribe links |
| | `RESEND_WEBHOOK_SECRET` | Svix secret of the Resend webhook → `https://handsome-warthog-21.eu-west-1.convex.site/webhooks/resend` (see `HUMAN_TODO.md`) |

Local dev uses `.env.local` (created by `npx convex dev`) plus the dev deployment's env (`npx convex env set …` without `--prod`).

## Ship a release
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # VERIFY
npx convex deploy --yes                                   # backend first (schema, functions, crons)
railway up --service usertrack --ci                       # then the app
```
`railway.toml` pins the builder (Railpack), `pnpm build` / `pnpm start`, and a health check on `/leaderboard`.

Convex is deployed from a logged-in machine (`npx convex login`). CI can instead set `CONVEX_DEPLOY_KEY` and run `pnpm railway:build` (`convex deploy --cmd 'pnpm build'`).

## First-time setup (already done for this project)
```bash
railway init --name usertrack --workspace "The CodeCave GbmH"
railway add --service usertrack && railway domain --service usertrack --port 3000
railway variables --service usertrack --set KEY=VALUE …
npx convex deploy --yes && npx convex env set --prod BETTER_AUTH_SECRET … && npx convex env set --prod SITE_URL …
npx convex run --prod seed:run      # optional demo data (remove with seed:clear)
```

After a schema-changing deploy, run once: `npx convex run --prod leaderboard:rerank && npx convex run --prod daily:run`.

## Verify production
- `GET /leaderboard`, `/trending`, `/discover`, `/sitemap.xml`, `/api/v1/leaderboard`, `/api/badge/<slug>.svg` → 200
- Sign up → onboarding → publish → `/s/<slug>` renders, `og:image` returns `image/png`
- Convex dashboard → Crons: `sync all integrations` (4h), `rerank leaderboard`, `daily sweep`, `weekly digest`, `monthly growth report`
- `/app/settings/notifications` renders and toggles persist; `/forgot-password` sends (check `emailEvents` in the dashboard: `sent` with a Resend id, or `failed: email not configured`)
- `npx convex run --prod email/testSend:run '{"to":"you@example.com"}'` → Resend → Emails shows *Delivered*
