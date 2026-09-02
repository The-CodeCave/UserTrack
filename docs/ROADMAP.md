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

### v0.3 — Public API keys & MCP
- Domain layer (`convex/domain/{projects,integrations,metrics}.ts`) shared by dashboard, REST and MCP; typed `DomainError`.
- Developer tokens: API keys (`ut_api_`) and MCP tokens (`ut_mcp_`), SHA-256 hashed, shown once, six scopes, optional expiry, revoke, usage per day, audit trail; `/app/developer` UI.
- Token-authenticated Convex gateway (`convex/gateway.ts`): scopes, strict ownership, daily quotas in `apiUsage`, audit logs, idempotent project creation by normalized domain, create/verify/sync limits, `UT_GATEWAY_SECRET`.
- Public API: optional API keys (1,000/day + 120/min burst), `X-RateLimit-Window`/`X-RateLimit-Reset`, new `/saas/{slug}/metrics`, `/trending`, `/users/{username}`, `unauthorized`/`revoked`/`expired`/`forbidden` errors, OpenAPI 3.1 at `/api/openapi.json`.
- MCP server at `/mcp` (Streamable HTTP, stateless, JSON): 15 tools, server instructions with the 9-step setup workflow, `add_project_to_usertrack` prompt, structured tool errors with hints, integration catalog + executable setup instructions with code templates.
- Onboarding "Set up with AI in 60 seconds": token generation, config snippets for Claude Code / Cursor / Codex / VS Code / generic, agent prompt, live status derived from the audit trail, funnel events.
- `/developers` rewritten (overview, quickstart, API reference, MCP reference, examples); `docs/API.md`, `docs/MCP.md`, architecture/assumptions updated.

### v0.4 — Growth data layer
- Provider layer v3: per-configuration capability model, source verification levels (`verified` / `partially_verified` / `self_reported`), Node runtime dispatch (`convex/providerRun.ts`), 429/503 backoff, bounded backfills; `docs/PROVIDERS.md`.
- PostgreSQL provider (read-only session, aggregate SQL only, timeouts, secret-free error mapping) with a 4-step wizard (connect → table → columns → confirm) and a read-only-role SQL template; Supabase read-only database mode (`auth.users` signups + history through the session pooler) with the service-role API mode as fallback; Firebase signup scan (≤100k accounts) for real windows + history; Clerk backoff + bounded history concurrency; live "Test connection" card with capabilities.
- Activation + funnel v2: 7d / 30d / 90d from daily rows, previous window, per-stage conversion + change, per-stage provenance and funnel-level verification; optional activation step in onboarding; `docs/METRICS.md`.
- Trending Score v2 (freshness + history factors, no-signal rules), per-window trending ranks + movement, public factor explanation (`public.trendingExplain`, ⓘ tooltip, one-line explain on boards); `docs/TRENDING.md`.
- Discovery v2: stored `launched` / `verified` events, deduplicated activity feed (`public.feed`), Recently verified, Biggest movers, Hidden gems with public rules, category counts.
- Share engine v2: `week` and `spike-<id>` cards, square 1080×1080 variant, one renderer for OG image + PNG, edge caching.
- Badges / embeds v2: `chart` widget, `window`, `compact`, per-IP burst limit, 404 not-found badge, configurator page `/app/saas/[id]/embed`.
- Benchmarks v2: five metrics, `MIN_SAMPLE = 5`, deciles-only storage, percentile steps of 5, insight sentences, top-quarter public statement on product pages; `docs/BENCHMARKS.md`.
- Compare v2: 7d / 30d / 90d / 1y / all windows, Total vs Indexed modes, permalink share + OG image (`/compare/og`).
- Public API: `/saas/{slug}/funnel`, `/saas/{slug}/benchmarks`, `/discover`, `/compare`. MCP: 8 new tools (23 total), 10-step workflow with provider recommendation + optional activation.
- Dashboard IA: "Next actions" on the overview, anchored manage-page sections with "Next steps", compact benchmark cards.

## Next opportunities
1. **Verified retention cohorts** — providers with per-user `last_active_at` (Clerk list API, Auth0 logs) could yield true cohort retention instead of the estimate; also weekly cohort curves.
2. **Domain verification** (DNS TXT / meta tag) so endpoints on other hosts can become verified, and to strengthen the trust score.
3. **Envelope encryption** of `integrations.config` with a KMS-style key in env (Convex already encrypts at rest).
4. **Materialized board table** once the public set exceeds a few thousand products (today boards sort the public set in one query).
5. **Owner-added annotations** (launches, Product Hunt day) on the chart; annotation clustering when > 8.
6. **More traffic/revenue sources**: Umami, Fathom, Paddle, Lemon Squeezy; more databases (MySQL, MongoDB) behind the same Node-runtime pattern.
7. **Notifications**: in-app + email on milestones / rank changes for followed products (the `events`/`milestones` data already exists).
8. **"vs" SEO pages** for popular compare pairs (compare permalinks + OG images exist since v0.4).
9. **OAuth for MCP** (authorization-code flow with dynamic client registration) so clients can connect without copying tokens.
10. **SDKs**: `@usertrack/api` (typed client generated from `/api/openapi.json`) and a Python equivalent.
11. **Per-plan limits** (`PLANS` already keyed by plan) and billing; higher API/MCP quotas for paid tiers.
12. **Webhooks** for milestones, rank changes and sync failures (signed payloads, retries).
13. **MCP registry listing** and directory submissions (official MCP registry, Smithery, Cursor directory) using the `GET /mcp` discovery document.
14. **Light theme** (design is intentionally dark-only), i18n number formats.
15. **Raise `MIN_SAMPLE` to 10** once category cohorts are large enough; Postgres history for custom-SQL activation sources; time-to-activation would need per-user data and is intentionally out of scope.

## Known limitations
- Retention is an estimate (active − new over the 30-day-old cohort) and is labelled as such.
- History backfill is 30 days and only for providers that support it; Stripe/manual, Supabase API mode without a `createdAtColumn`, Firebase projects above 100k accounts (or with `scanSignups: false`) and custom-SQL activation sources start from the first live snapshot.
- Firebase signup windows and history come from a full `accounts:batchGet` scan (pages of 1,000) on every sync; it is capped at `FIREBASE_SCAN_LIMIT = 100,000` accounts, beyond which the provider silently reports totals only.
- PostgreSQL: the host must accept connections from the internet (Convex IPs are not fixed) or via a pooler; `ssl: require` uses `rejectUnauthorized: false` (encrypted, no CA validation); one 20 s statement timeout per query; the wizard lists at most 200 tables.
- Benchmarks need ≥ 5 verified products per cohort and metric; with the current public set most category cohorts have no aggregate, and `n = 5` deciles are interpolations between neighbours (see `docs/BENCHMARKS.md`, privacy analysis).
- Burst rate limiting (API, MCP, badges) is per Next.js process (fine for one Railway replica); daily quotas live in Convex and survive deploys.
- MCP auth is bearer tokens only (no OAuth yet); the MCP server is stateless, so clients that require SSE notifications are not supported.
- Milestones for `best_day` / `best_week` need ≥3 / ≥14 closed days of daily data; Trending Score reaches full weight only after 14 tracked days.
- Demo listings remain in production until `seed:clear` is run (see `HUMAN_TODO.md`).
- The provider adapters (including the v0.4 PostgreSQL, Supabase database mode and Firebase scan paths) are unit-tested against documented API shapes and SQL builders but have not yet been exercised against live third-party accounts or databases.
