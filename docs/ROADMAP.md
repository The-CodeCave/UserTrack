# Roadmap

## Completed

### v0.1 — MVP
Auth, profiles, SaaS pages, Clerk/Supabase/endpoint/manual sources, 4-hour snapshots, 30-day leaderboard, growth chart, OG images, onboarding, Railway + Convex deployment.

### v0.2 — Trustworthy, discoverable, shareable
- Provider interface v2 with roles (users / activation / traffic / revenue), capabilities, normalized metrics and history backfill; Firebase, Auth0, PostHog, Plausible, GA4, Stripe added.
- Sync engine: staggered scheduling, retries with backoff, sync log with durations, last success/failure, previous-window deltas.
- Activated users, activation rate, activation chart series; estimated retention / churn.
- Trust score + anomaly flags with neutral public labels; under-review products unranked.
- Trending score (documented formula), trending board + badge + movement; 7 boards with window/category/size/verification filters.
- Automatic milestones (thresholds, best day/week, top 10/100, best rank, streaks, monthly growth, trending top 10) with share pages and OG cards; growth-spike detection and chart annotations.
- Share cards for users / growth / rank / trending / activation / milestones; SVG badge endpoint + embed UI.
- Follow system, following feed, weekly digest (in-app + Resend email when configured).
- Categories, `/discover` search + sections, `/trending`, `/fastest-growing-saas`, `/fastest-growing-ai-saas`, `/new-saas`, `/most-new-users`, `/categories/*`, `/compare`, `/developers`.
- Benchmarks (deciles per group, percentile cards on the dashboard).
- Public API v1 with stable DTOs, error envelope, rate limiting, docs.
- Traffic + revenue (opt-in display), funnel visualization.
- SEO: sitemap, robots, canonical, JSON-LD, custom 404. Dashboard overview, onboarding category step + activation nudge, LinkedIn profile link.

## Next opportunities
1. **Verified retention cohorts** — providers with per-user `last_active_at` (Clerk list API, Auth0 logs) could yield true cohort retention instead of the estimate; also weekly cohort curves.
2. **Domain verification** (DNS TXT / meta tag) so endpoints on other hosts can become verified, and to strengthen the trust score.
3. **Envelope encryption** of `integrations.config` with a KMS-style key in env (Convex already encrypts at rest).
4. **Materialized board table** once the public set exceeds a few thousand products (today boards sort the public set in one query).
5. **Owner-added annotations** (launches, Product Hunt day) on the chart; annotation clustering when > 8.
6. **More traffic/revenue sources**: Umami, Fathom, Paddle, Lemon Squeezy.
7. **Notifications**: in-app + email on milestones / rank changes for followed products (the `events`/`milestones` data already exists).
8. **Compare permalinks with OG image**, and "vs" SEO pages for popular pairs.
9. **API keys + higher limits** for the public API; webhooks for milestones.
10. **Light theme** (design is intentionally dark-only), i18n number formats.
11. Password reset email (Better Auth supports it; needs the same Resend setup as the digest).

## Known limitations
- Retention is an estimate (active − new over the 30-day-old cohort) and is labelled as such.
- History backfill is 30 days and only for providers that support it; Firebase/Stripe/manual start from the first live snapshot.
- Rate limiting is per Next.js process (fine for one Railway replica).
- Milestones for `best_day` / `best_week` need ≥3 / ≥14 closed days of daily data.
- Demo listings remain in production until `seed:clear` is run (see `HUMAN_TODO.md`).
- The six new provider adapters are unit-tested against documented API shapes but have not yet been exercised against live third-party accounts.
