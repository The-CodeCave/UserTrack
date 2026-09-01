# Changelog

## 0.1.0 — MVP (2026-09-01)
- Next.js 16 App Router, Tailwind 4, shadcn/ui (Base UI), Convex, Better Auth (email + password) via `@convex-dev/better-auth`.
- Blueprint design system: graphite surfaces, white linework, pink `#FB0184` accent, Geist Sans/Mono, corner-tick panels, grid backgrounds.
- Auth: sign-up, sign-in, sign-out, session persistence, `proxy.ts` route protection.
- Profiles: handle availability check, display name, bio, links; public `/u/[username]`.
- SaaS: create/edit/delete, slug management, publish toggle, tags, logo URL; `/app/saas/*`.
- Onboarding wizard: profile → SaaS → data source → publish → share, resumable, mobile-first.
- Data sources: provider abstraction with Clerk, Supabase (auth users or table), JSON endpoint (verified on own domain), Manual (self-reported).
- Sync engine: append-only snapshots, 4-hour cron, derived metrics (24h/7d/30d, growth %), daily rollups, failure demotion to `pending`, manual "Sync now" with cooldown.
- Leaderboard: verified-only default, "all sources" toggle, ranking by 30-day verified new users, demo rows excluded from ranks.
- Public SaaS page: metric cards, Recharts growth chart (24H–ALL, total/new), provenance, founder card, share buttons.
- OG images for SaaS, profile and leaderboard (`next/og`, vendored Geist woff).
- Demo seed (`seed:run` / `seed:clear`), Vitest unit tests, Playwright smoke test (`scripts/smoke.mjs`).
- Railway deployment (`railway.toml`), Convex production deployment, docs.
