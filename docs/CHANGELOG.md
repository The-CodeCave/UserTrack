# Changelog

## 0.2.0 — Trustworthy, discoverable, shareable (2026-09-02)
- Provider interface v2 (roles, capabilities, normalized metrics, history backfill); new adapters: Firebase Auth, Auth0, PostHog, Plausible, Google Analytics 4, Stripe; Clerk/Supabase/endpoint upgraded with range + active-user metrics.
- Sync engine v2: staggered cron, retries with backoff, run durations, last success/failure, previous-window deltas, multi-role integrations, one-time 30-day backfill.
- Activated users (24h/7d/30d, rate, chart series), estimated retention/churn, traffic + revenue with opt-in display, funnel.
- Trust score + anomaly flags (impossible growth, drops, reconnect churn, source switching, stale) with neutral public labels; under-review products unranked.
- Trending score (24h/7d/30d) with documented formula, trending rank + movement, trending milestones.
- Boards: trending, fastest, most users, most new, most activated, activation rate, new & rising; filters for window, category, size, verification.
- Automatic milestones (users/activated thresholds, best day/week, top 10/100, best rank, streaks, monthly growth) persisted once; spike detection; chart annotations.
- Share cards with OG images + downloadable PNG; SVG badge endpoint + copy-paste embed UI.
- Follow products/founders, following feed, weekly digest (in-app + Resend email when configured), digest opt-in.
- Categories, `/discover` (search + sections), `/trending`, `/fastest-growing-saas`, `/fastest-growing-ai-saas`, `/new-saas`, `/most-new-users`, `/categories/*`, `/compare`, `/developers`.
- Benchmarks (daily deciles per group) with percentile cards.
- Public API v1 (`/api/v1/*`) with stable DTOs, error envelope, CORS, rate limiting; `docs/API.md`.
- SEO: sitemap, robots, canonical URLs, JSON-LD, custom 404; mobile nav row.
- Dashboard overview, manage page with per-role sources, insights, sync log, share + embed; onboarding category + activation nudge; LinkedIn on profiles.
- Tests: 57 unit tests (metrics, trending, trust, milestones, spikes, retention, benchmarks, providers, DTOs, badge, rate limit); smoke test updated.

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
- OG images for SaaS, profile and leaderboard (`next/og`, vendored Geist woff, brand wordmark).
- Brand assets: favicon / `icon.png` / `apple-icon.png` from the UT monogram, wordmark in header and OG frame (`public/brand`, sources in `brand/`).
- Demo seed (`seed:run` / `seed:clear`), Vitest unit tests, Playwright smoke test (`scripts/smoke.mjs`).
- Railway deployment (`railway.toml`), Convex production deployment, docs.
