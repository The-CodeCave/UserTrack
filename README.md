# UserTrack

Public, shareable leaderboard of SaaS user growth. Founders connect a read-only data source, UserTrack snapshots the user count every 4 hours, and every product gets a growth page with a chart, trust badge and custom OG image.

**Live:** https://usertrack-production.up.railway.app

## Stack
Next.js 16 (App Router, RSC) · React 19 · Tailwind 4 + shadcn/ui (Base UI) · Convex (DB, functions, crons, HTTP) · Better Auth via `@convex-dev/better-auth` · Recharts 3 · Motion · `next/og` · Railway.

## Run locally
```bash
pnpm install
npx convex dev            # creates .env.local, pushes functions, watches
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL http://localhost:3000
echo 'NEXT_PUBLIC_SITE_URL=http://localhost:3000' >> .env.local
npx convex run seed:run   # optional demo data
pnpm dev                  # http://localhost:3000
```

## Scripts
| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | ESLint · `next typegen && tsc` · Vitest |
| `pnpm convex:dev` · `pnpm convex:deploy` | Convex dev watch · deploy to prod |
| `node scripts/smoke.mjs [base] [mobile]` | E2E: sign-up → onboarding → publish → public page (needs Chrome) |
| `node scripts/shot.mjs <url> <out.png> [w] [h] [full]` | Screenshot helper |

## Layout
```
convex/            schema, auth, profiles, saas, integrations, sync engine, crons, public queries, seed
convex/providers/  data-source adapters (clerk, supabase, endpoint, manual)
src/app/(public)/  /, /leaderboard, /s/[slug], /u/[username] (+ opengraph-image routes)
src/app/(auth)/    /sign-in, /sign-up
src/app/app/       dashboard: onboarding, saas, profile, settings
src/components/    blueprint primitives, charts, app forms, public cards
docs/              ARCHITECTURE · BACKLOG · ASSUMPTIONS · DEPLOYMENT · CODECRAFT · ROADMAP
```

## Trust model (short)
`verified` = synced from Clerk/Supabase or a JSON endpoint on the SaaS's own domain · `unverified` = manual / foreign endpoint, badged, never ranked · `pending` = no successful sync yet. Snapshots are append-only and carry source + trust. Ranking = verified new users in the last 30 days. Details in `docs/ARCHITECTURE.md`.
