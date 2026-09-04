# FIX-1 — no UI changes

FIX-1 touches `src/lib/client-ip.ts`, `src/lib/analytics.ts`, `src/app/api/health/route.ts`, `convex/gateway.ts` and
`convex/jobs.ts` — no component renders differently. These full-page shots of `/leaderboard` at 375 / 768 / 1440
(`PORT=3100 pnpm build && pnpm start`, dark) are the regression check: the page is unchanged and the Rybbit script is
absent, because a local production build whose `NEXT_PUBLIC_SITE_URL` is not `https://usertrack.dev` no longer
inherits the production site id.

Runtime check of the split health probes on the same build:

```
GET /api/health          → {"ok":true,"version":"dev","uptime":2297}
GET /api/health?deep=1   → {"ok":true,...,"convex":"ok","jobs":[{"job":"rerank leaderboard",...}, ...]}
```
