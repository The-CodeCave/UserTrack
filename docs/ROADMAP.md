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

### v0.5 — Growth → Activation → Conversion (lifecycle model)
- Normalized lifecycle **Reached → Signed up → Activated → Trial → Converted** with dynamic partial funnels, strategic rates, per-stage provenance / freshness / health, funnel history and an owner/public visibility model (connection ≠ publication). `docs/FUNNEL.md`.
- Provider roles as lifecycle sources (`users` · `activation` · `traffic` · `conversion`), capability flags `trial` / `converted` / `identity`, `revenue` role migrated to `conversion`.
- Conversion providers, read-only and amount-free: **Stripe** (rewritten: subscription state, no MRR), **RevenueCat** (mobile trial / active subscriptions), **Paddle**, **Lemon Squeezy**, **Chargebee**, JSON endpoint; provider-independent conversion modes (`active_paid` default, `ever_paid`, `first_payment`).
- Identity matching architecture: salted-hash identity links from Postgres/Supabase/PostHog/Stripe/Paddle/Chargebee/endpoint, daily cohort engine (signup cohorts, D7 activation, D30 conversion, medians), identity quality + **Cohort Verified** badge. `docs/IDENTITY.md`.
- Dashboard IA Growth / Engagement / Conversion with per-group health; public profile sections; mobile / hybrid project type with App Store / Google Play links; onboarding platform step + stack questions + recommendations; conversion share card.
- Benchmarks + secondary leaderboards for conversion rates, small trending conversion multiplier, monthly report conversion lines, API (`/conversion`, `/engagement`, `/cohorts`, `/funnel/history`) and MCP (`usertrack_get_conversion_setup`, `usertrack_get_identity_mapping`, `usertrack_get_cohorts`, `usertrack_get_funnel_history`, mobile-aware provider recommendation).

### v0.6 — Better Auth native integration
- `@usertrack/better-auth` (packages/better-auth): signed metrics endpoint, lifecycle events, 42 tests + HTTP e2e, README, HUMAN_TODO, tag-driven release workflow.
- Provider `better_auth` (native verified), `ut_int_` credentials shown once, awaiting-verification state, verify → first sync, event ingestion, plugin/protocol version diagnostics.
- Dashboard wizard, AI-onboarding step, MCP tools `usertrack_get_better_auth_setup` / `usertrack_create_integration`, prompt, Better Auth first in the users priority, public docs `/developers/integrations/better-auth`.

### v0.7 — Embeddable growth widgets
- Live widgets for websites: `/widget.js` loader → iframe `/embed/[slug]` (users · growth · verified · chart; `auto` / dark / light; 7d / 30d; count-up; 5-minute refresh from `/api/embed/[slug].json`); every widget links back with `ref=embed` + UTM.
- Distribution tracking: embedding hosts (`embedSites`, domain only) → “Where it's embedded” in the configurator, “Embedded on N sites” on the manage page and the public page.
- Configurator with Live widget / SVG badge modes; MCP `usertrack_get_embed_code { format: "widget" }`.

### v0.7 — Native SDK integrations (`@usertrack/node`)
- One provider kind `native` for every client of the native protocol; `better_auth` migrated (`migrations:nativeV1`) and kept as an alias. Users, activation and conversion from one signed handler; extra roles attach automatically.
- `@usertrack/protocol` (signing + wire types, zero deps), `@usertrack/node` (handler, Node adapter, tracker; Prisma / Drizzle / Convex / Auth.js adapters, 22 tests + e2e), `@usertrack/better-auth` 0.2.0 as a thin wrapper. One tag-driven release workflow for all three packages.
- Setup knowledge per source (`convex/lib/nativeSetup.ts`) shared by the "My app (SDK)" wizard, `/developers/integrations/native` and MCP `usertrack_get_native_setup`; recommendation ranks Better Auth / Auth.js / Convex first and ORM-only signals after hosted auth providers.
### v0.8 — Founder identity & sharing
- Public founder profiles with weighted aggregates, aggregate growth chart, project grid, founder card / OG, `profilePublic`, search integration. `docs/PROFILES.md`.
- X handle support (canonical, validated, optional), connection states, `/app/settings/social`.
- Share Card Studio (Blueprint / Aurora / Minimal, 1200×630 + 1080×1080, timeframes, toggles, title; Download / Copy image / Copy link / Post to X) with share buttons on every major metric, chart, rank, benchmark, milestone and the founder page; deterministic, rate-limited, cacheable card URLs; honest chart scale. `docs/SHARING.md`.
- Share engine (`shareEvents`, significance floors, one-time keys, monthly benchmark cards) + Share Center; drafts for X; milestone emails link to the Center.
- X OAuth 2.0 PKCE + opt-in auto-posting and the separate UserTrack-account pathway (OAuth 1.0a), all feature-flagged with human setup in `HUMAN_TODO.md`. `docs/SOCIAL.md`.
- API `/users/{username}` aggregates + `/history`; MCP +6 tools (36) and the share workflow.

### v0.9 — Discovery, follow, history, benchmarks v2, datasets, webhooks
- **Discovery v3**: history-backed Biggest Movers, Hidden gems + Movers boards (`/hidden-gems`, `/biggest-movers`), category-narrowed `/discover`, Popular mobile apps, platform filter, feed events `rank_jump` / `traction` / `benchmark`, related products, search by category. `docs/DISCOVERY.md`.
- **Follow + watchlists**: idempotent follow / unfollow, follow chips on cards, personalized feed (`/app/following`), per-kind email sub-preferences, API `/following`, MCP follow tools. `docs/FOLLOWS.md`.
- **History as an asset**: append-only `rankHistory` (leaderboard + trending per window), weekly `benchmarkHistory`, monthly `rankingSnapshots`, backfill provenance (`backfills`, idempotent imports, owner-triggered backfill), downsampled charts with honest gaps, rank history charts, `/rank-history` + `/benchmark-history` API. `docs/HISTORY.md`.
- **Benchmarks v2**: category × size, platform, founded / tracked age cohorts, growth acceleration, `MIN_SAMPLE` 10, previous percentile + change insights, cohort definitions, public benchmark visibility toggle. `docs/BENCHMARKS.md`.
- **Public datasets + SEO**: `/fastest-growing-developer-tools`, `/fastest-growing-mobile-apps`, `/best-activation-rate-saas`, `/best-converting-mobile-apps`, `/rankings/<year>/<month>/<category>`, methodology + last-updated + JSON-LD on every ranking page, `/api/v1/datasets/*` (JSON + CSV, cursor). `docs/DATASETS.md`.
- **Webhooks**: signed (HMAC-SHA256) async deliveries with retries and a delivery log, SSRF policy + DoH re-resolution, 7 event types, `/app/developer/webhooks`, `/developers/webhooks`, MCP webhook tools. `docs/WEBHOOKS.md`.
- Platform: 50 MCP tools (4 new scopes), OpenAPI 3.1 updated.

### v1.0 — Launch hardening
No new product surface; everything here makes v0.9 safe to show to strangers. Release notes: `docs/RELEASE-v1.0.md`.
- **Security**: gateway secret fails closed (constant-time, rejected when missing on either side), honest credential wording, `safeInternalPath` for every redirect, security headers + CSP, email verification with a publish gate (SEC-1); real rate limiting through the `@convex-dev/rate-limiter` component with a named catalog, an in-memory first line and a trusted client IP (SEC-2); shared SSRF policy for every founder-supplied host — validate-time checks, a DoH guard before every provider fetch, `redirect: "manual"` + timeouts, a `dns.lookup` guard before every Postgres connection (SEC-3).
- **Legal + GDPR**: `/impressum`, `/privacy`, `/terms`, footer everywhere, `src/lib/legal.ts` (LEGAL-1); self-service export (`/api/account/export`, MCP) and a paged hard account delete across all 32 user-owned tables plus the Better Auth rows (LEGAL-2).
- **Analytics**: self-hosted cookieless Rybbit, a typed 44-event catalog wired at its call sites, pseudonymous identify, server-side events from route handlers and Convex (ANALYTICS-1). `docs/ANALYTICS.md`.
- **Accounts + profiles**: GitHub + X sign-in, account linking, connected accounts, provider profile import (AUTH-1); rich product profiles — markets, tech stack, marketing channels, cofounders, company + product texts, logo upload, anonymous mode, hide from Google, `/stacks/<slug>` boards (PROFILE-1); "Import from TrustMRR" in the forms and MCP (IMPORT-1); X follower counts from the founder's own token (SOCIAL-1).
- **Operations**: every cron pages its table and writes a `jobRuns` row (OPS-1); ISR + cache headers on every public page and indexed, bounded board reads with materialized directory counters (OPS-2); retention sweep, Sentry behind a DSN, error boundaries + degraded public pages, `/api/health`, CI without secrets (OPS-3).
- **Consolidation**: full clean verification, launch screenshot pass (`docs/screenshots/v1/ship/`), doc reconciliation, `HUMAN_TODO.md` launch checklist, `docs/RELEASE-v1.0.md` (SHIP-1). 52 MCP tools, OpenAPI 3.1 with 22 paths.

## Next opportunities
0. **Real-world adapter runs** — the Prisma / Drizzle / Convex / Auth.js adapters are tested against fakes and rendered SQL; one live founder integration per adapter (see `packages/node/HUMAN_TODO.md`) would confirm the count semantics end to end, then publish the three packages.
1. **Verified retention cohorts** — providers with per-user `last_active_at` (Clerk list API, Auth0 logs) could yield true cohort retention instead of the estimate; also weekly cohort curves.
2. **Domain verification** (DNS TXT / meta tag) so endpoints on other hosts can become verified, and to strengthen the trust score.
3. **Envelope encryption** of `integrations.config` with a KMS-style key in env (Convex encrypts its storage, but v1.0 adds no application-level encryption — A120, `docs/RELEASE-v1.0.md` → Residual risks).
4. **Materialized board table** once the public set exceeds ~5,000 products (OPS-2 moved every board except `most-activated` onto its own index with an early-exit walk, and caps `publicSet` / the sitemap at 5,000 rows).
5. **Owner-added annotations** (launches, Product Hunt day) on the chart; annotation clustering when > 8.
6a. **Better Auth follow-ups**: publish `@usertrack/better-auth` to npm (see `packages/better-auth/HUMAN_TODO.md`), community-plugin listing, `waitUntil`-aware event delivery on serverless hosts, optional active-users (session scan) capability, `@usertrack/protocol` extraction when a second native plugin (Auth.js, Lucia, Clerk webhooks) arrives.
6. **More sources**: Umami, Fathom (traffic); Amplitude, Mixpanel, Firebase Analytics via BigQuery (activation, today through the endpoint); RevenueCat identities (customers API or webhooks) and per-day trial flows; StoreKit / Google Play Billing directly; more databases (MySQL, MongoDB) behind the same Node-runtime pattern.
6b. **Cohort-verified benchmarks** once enough products are `cohort_verified` (kept separate from aggregate cohorts by construction).
7. **In-app notification centre** (bell + unread state) on top of the watchlist feed; per-target mutes.
7b. **Sharing follow-ups**: materialize founder aggregates/history on the profile row once founders have many projects; media upload for X posts (today the card comes from the URL unfurl); LinkedIn / Bluesky intents and connections; calendar-month growth cards; per-project X handles; share-stats dashboard for operators; "Import from X" in onboarding once the X app exists.
8. **"vs" SEO pages** for popular compare pairs (compare permalinks + OG images exist since v0.4).
9. **OAuth for MCP** (authorization-code flow with dynamic client registration) so clients can connect without copying tokens.
10. **SDKs**: `@usertrack/api` (typed client generated from `/api/openapi.json`) and a Python equivalent.
11. **Per-plan limits** (`PLANS` already keyed by plan) and billing; higher API/MCP quotas for paid tiers.
12. **Webhook follow-ups**: IP-pinning egress proxy for deliveries, per-endpoint retry policy, `benchmark.changed` event, replay from the dashboard, webhook marketplace listings (Zapier / Make).
13. **MCP registry listing** and directory submissions (official MCP registry, Smithery, Cursor directory) using the `GET /mcp` discovery document.
14. **Light theme** (design is intentionally dark-only), i18n number formats.
15. **Benchmarks v3**: finer size buckets once cohorts exceed ~200 members, versioned cohort deciles, founding dates imported from public sources; Postgres history for custom-SQL activation sources; time-to-activation would need per-user data and is intentionally out of scope.
16. **History follow-ups**: 30-day movers, backfill of monthly ranking archives from `rankHistory`, aggregation of 4-hour snapshots older than two years into daily rows (raw daily history is never destroyed), dedicated MCP backfill tool.

## Known limitations
- Retention is an estimate (active − new over the 30-day-old cohort) and is labelled as such.
- Conversion: Stripe covers subscriptions only (one-time payments via the endpoint); RevenueCat reports stocks (daily flows are clamped deltas) and no identities; each conversion provider lists at most 50 pages per status (5,000 subscriptions) per sync.
- Identity matching needs ids from both ends (identity source *and* activation/conversion source); Clerk / Firebase Auth / Auth0 do not report identities, so those stacks reach `cohort_verified` only with a database or endpoint identity source. Coverage is measured over the last 90 days and capped at 100k subjects per stage.
- Amplitude, Mixpanel, Firebase Analytics, StoreKit and Google Play Billing are not native providers yet — the onboarding recommends the JSON endpoint for them.
- History backfill is 30 days and only for providers that support it; Stripe/manual, Supabase API mode without a `createdAtColumn`, Firebase projects above 100k accounts (or with `scanSignups: false`) and custom-SQL activation sources start from the first live snapshot.
- Firebase signup windows and history come from a full `accounts:batchGet` scan (pages of 1,000) on every sync; it is capped at `FIREBASE_SCAN_LIMIT = 100,000` accounts, beyond which the provider silently reports totals only.
- PostgreSQL: the host must accept connections from the internet (Convex IPs are not fixed) or via a pooler; `ssl: require` uses `rejectUnauthorized: false` (encrypted, no CA validation); one 20 s statement timeout per query; the wizard lists at most 200 tables.
- Benchmarks need ≥ 10 verified products per cohort and metric; with the current public set most cohorts have no aggregate yet (see `docs/BENCHMARKS.md`).
- Ranking history, Biggest Movers, benchmark history and monthly ranking archives accumulate from the v0.9 deploy onwards; the first movers appear after a week of stored positions, the first archive after the first full month.
- Webhook delivery resolves hostnames through DNS-over-HTTPS immediately before the request but cannot pin the address `fetch` connects to (see `docs/ASSUMPTIONS.md` A111).
- Burst rate limiting (API, MCP, badges) is per Next.js process (fine for one Railway replica); daily quotas live in Convex and survive deploys.
- MCP auth is bearer tokens only (no OAuth yet); the MCP server is stateless, so clients that require SSE notifications are not supported.
- Milestones for `best_day` / `best_week` need ≥3 / ≥14 closed days of daily data; Trending Score reaches full weight only after 14 tracked days.
- Demo listings remain in production until `seed:clear` is run (see `HUMAN_TODO.md`).
- Provider credentials in `integrations.config` are stored without application-level encryption (A120); nothing returns them, but deployment access can read them.
- Better Auth sign-in / sign-up is not rate limited — it runs inside the Convex HTTP router where the Next.js `limit()` helper cannot reach it (deferred from SEC-2, `docs/BACKLOG.md`).
- The TrustMRR mapper is written against the published example response, not a live key (A173); unknown fields land in `unmapped[]`.
- Public pages may be up to 5 minutes stale (`revalidate = 300`, A192); the dashboard stays live.
- The provider adapters (including the v0.4 PostgreSQL, Supabase database mode and Firebase scan paths) are unit-tested against documented API shapes and SQL builders but have not yet been exercised against live third-party accounts or databases.
