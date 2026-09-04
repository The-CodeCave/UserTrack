# UserTrack

**The growth data layer for SaaS and apps. Discover what is growing, follow it, and build on the history.**

UserTrack is a public growth and discovery platform for SaaS and mobile apps. Founders connect read-only sources for each lifecycle stage — an identity source (Clerk, Supabase, Firebase Auth, Auth0, PostgreSQL), an activation source (PostHog, a table, custom SQL) and optionally a reach source (PostHog, Plausible, GA4) and a conversion source (Stripe, RevenueCat, Paddle, Lemon Squeezy, Chargebee) — and UserTrack builds a normalized funnel **Reached → Signed up → Activated → Trial → Converted**, snapshots every stage every 4 hours, and gives every product a public growth page, trending score, milestones, benchmarks, share cards, an embeddable badge and a place on the leaderboards. Numbers are pulled from connected providers, never typed in. **UserTrack tracks users, not revenue**: payment providers are read only to determine who converted; no amounts, MRR or ARR are ever requested, stored or shown. Visitors without an account discover what is trending, growing fastest, moving up or quietly gaining traction; founders follow competitors and get a personal feed; every ranking, trending score and benchmark standing is kept as append-only history; the public data is a free JSON / CSV dataset API; external systems subscribe to signed webhooks; and an AI agent can do the whole setup through MCP.

**Live:** https://usertrack.dev · **API:** `/api/v1` ([docs](docs/API.md)) · **MCP:** `/mcp` ([docs](docs/MCP.md)) · **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · **Profiles:** [docs/PROFILES.md](docs/PROFILES.md) · **Sharing:** [docs/SHARING.md](docs/SHARING.md) · **Social:** [docs/SOCIAL.md](docs/SOCIAL.md) · **Providers:** [docs/PROVIDERS.md](docs/PROVIDERS.md) · **Funnel:** [docs/FUNNEL.md](docs/FUNNEL.md) · **Identity & cohorts:** [docs/IDENTITY.md](docs/IDENTITY.md) · **Metrics:** [docs/METRICS.md](docs/METRICS.md) · **Trending:** [docs/TRENDING.md](docs/TRENDING.md) · **Benchmarks:** [docs/BENCHMARKS.md](docs/BENCHMARKS.md) · **Discovery:** [docs/DISCOVERY.md](docs/DISCOVERY.md) · **Follows:** [docs/FOLLOWS.md](docs/FOLLOWS.md) · **History:** [docs/HISTORY.md](docs/HISTORY.md) · **Datasets:** [docs/DATASETS.md](docs/DATASETS.md) · **Webhooks:** [docs/WEBHOOKS.md](docs/WEBHOOKS.md) · **Analytics:** [docs/ANALYTICS.md](docs/ANALYTICS.md)

## What it does

| Area | Features |
|---|---|
| **Lifecycle model** | One normalized funnel for web SaaS and mobile apps: Reached → Signed up → Activated → Trial → Converted. Every project combines several provider roles (identity · activation · reach · conversion); only stages with real connected data are shown (Signups → Converted, Signups → Activated, full funnel…). Two confidence levels: **Aggregate** (period ratios) and **Cohort Verified** (anonymized users traced across stages). `docs/FUNNEL.md`, `docs/IDENTITY.md`. |
| **Verified data** | **Native SDK** (`@usertrack/node` for Prisma, Drizzle, Convex, Auth.js / NextAuth and custom apps, `@usertrack/better-auth` for Better Auth: the app answers signed aggregate requests itself — users, optionally activation + conversion from one handler — native verified, ~2 min, `docs/PROVIDERS.md` + `/developers/integrations/native`) · Clerk · Supabase (read-only database mode via the session pooler, or service-role API mode) · **PostgreSQL** (read-only role, aggregate SQL only, 4-step wizard) · Firebase Auth (signup scan ≤100k accounts) · Auth0 · JSON endpoint (verified on own domain) · Manual (self-reported, never ranked). Per-source capability model + verification level (verified / partially verified / self-reported), live "Test connection" before saving, 30-day history backfill where the source supports it. `docs/PROVIDERS.md`. |
| **Activation** | Optional activation source (PostHog event, Supabase / PostgreSQL table or custom `$1` SELECT, endpoint) → activated users 24h/7d/30d, activation rate, second chart series; optional onboarding step. |
| **Retention** | Estimated retained / churned / retention rate from providers that expose "active in 30 days" (Clerk, Auth0, endpoint). Labelled *estimated*; never fabricated. |
| **Conversion (no revenue)** | Stripe · **RevenueCat** (iOS/Android subscriptions) · Paddle · Lemon Squeezy · Chargebee · endpoint, read-only and amount-free → Trial Users, Converted Users, Signup → Converted, Activated → Converted, Trial → Converted, converted-user growth. Provider-independent definition of "converted" (active paid · ever paid · first payment). A Stripe customer or a RevenueCat install is never a converted user. |
| **Reach** | Plausible · GA4 · PostHog visitors/sessions for the top of the funnel (private unless published). |
| **Funnel** | Dynamic stages over 7d / 30d / 90d from daily rows, previous-window comparison, adjacent + strategic conversion rates, per-stage provenance / freshness / health ("Conversion · Needs attention" never breaks the project), rate history chart, cohort table with D7 activation / D30 conversion where identities exist. |
| **Visibility** | Per-metric public toggles (Total users · Growth · Activation rate · Conversion rate · Trial conversion · Converted count · Visitors). **Connection ≠ publication**: connect Stripe or RevenueCat for private analytics without exposing anything. Conversion is private by default. |
| **Mobile apps** | Project type web · mobile · hybrid (onboarding: "What are you tracking?", sign-in / monetization / usage questions → recommended stack), Firebase Auth / Supabase / Auth0 as the registered-user source, Sign in with Apple / Google as authentication methods only, App Store / Google Play links on the profile. |
| **Ranking** | 30-day leaderboard, **Trending Score v2** (volume × growth × acceleration × trust × activation × freshness × history, every factor public via ⓘ / API / MCP, `docs/TRENDING.md`), per-window trending ranks with movement, 12 boards × 24h/7d/30d × category × size × **platform** (web / mobile / hybrid) × verification filters. |
| **History** | Append-only 4-hour snapshots and daily rows, plus **ranking + trending history** (one stored position per board, window and day → "#78 → #31 this week", rank charts, highest rank ever), **weekly benchmark standings** ("Top 12 %, up from Top 27 % last month"), **frozen monthly rankings** (`/rankings/2026/08/ai`), backfill provenance with idempotent imports, charts that downsample long ranges and draw gaps as gaps. `docs/HISTORY.md`. |
| **Trust** | Trust score 0–100 + anomaly heuristics (impossible jumps, drops, reconnect churn, source switching, stale sources). Public labels: Verified · Partially verified · Data under review · Self-reported. Under-review products are unranked, never accused. |
| **Milestones** | 10 → 1M users, activated thresholds, biggest day/week, top 10 / top 100, best rank, streaks, +X% month, trending top 10. Persisted once; each has a share page + OG image. |
| **Sharing** | Share cards (`/s/[slug]/share/[kind]`: users, growth, week, rank, trending, activation, milestone, spike) as 1200×630 and 1080×1080 PNGs, X/copy/download, edge-cached. |
| **Embeds** | **Live widgets** (`/widget.js` loader → iframe `/embed/[slug]`: live user count, growth %, Verified by UserTrack, mini chart; auto/dark/light theme, 7d/30d, count-up, 5-minute refresh from `/api/embed/[slug].json`, every widget links back with `ref=embed` + UTM) and SVG badges (`/api/badge/[slug].svg`: users, growth, trending, verified, mini chart; dark/light, compact) with copy-paste snippets, per-IP rate limits, configurator at `/app/saas/[id]/embed`. Embedding hosts are recorded (domain only) → “Embedded on N sites” on the dashboard and the public page. |
| **Discovery** | `/discover` (per category too) with search (products, founders, categories), Trending now, Fastest today / this week / this month, New & rising, Recently verified, **Biggest movers** (stored 7-day rank history), **Hidden gems** (public rules), Popular mobile apps, Top dev tools, Top AI, and an activity feed built only from stored, deduplicated events (milestones, launches, verifications, spikes, rank jumps, early traction, benchmark months). Boards with methodology + last-updated stamps: `/trending`, `/leaderboard`, `/hidden-gems`, `/biggest-movers`, `/fastest-growing-saas`, `/fastest-growing-ai-saas`, `/fastest-growing-developer-tools`, `/fastest-growing-mobile-apps`, `/best-activation-rate-saas`, `/best-converting-mobile-apps`, `/new-saas`, `/most-new-users`, `/best-conversion`, category pages, `/rankings` archives. Related products on every project page. `docs/DISCOVERY.md`. |
| **Compare** | `/compare?s=a,b,c,d&days=7\|30\|90\|365\|all` — up to four products, Total or Indexed (= 100) chart, metric table, shareable permalink with its own OG image (`/compare/og`). |
| **Product profiles** | `/app/saas/<id>#settings`: markets (≤5), tech stack (≤20 from 190+ curated entries with simple-icons, free text allowed), marketing channels (≤15), cofounders (X + GitHub), country, funding, team size, founded month, value proposition / problem / audience / pricing model / more, logo upload (Convex storage, ≤1 MB), **anonymous mode** (owner, cofounders, logo, website and store links stripped server-side on every public surface incl. OG, share cards and the API) and **hide from Google** (`noindex` + no sitemap entry). Public page gets About + Company & stack sections; `/stacks/<slug>` boards ("SaaS built with Next.js") and `?stack=` filters. Never a revenue field. `docs/PROFILES.md`. |
| **Founder profiles** | `/u/<username>`: avatar, name, X handle (typed vs connected states), bio, links, location, joined; founder-level aggregates across public projects (Σ users, new 30d, **weighted** activation rate, best rank, trending, biggest growth), aggregate growth chart with per-project breakdown, project grid, `Person` JSON-LD, founder card / OG. `docs/PROFILES.md`. |
| **Share Card Studio** | Every metric, chart, rank, benchmark and milestone has a Share button → live-preview studio with **Blueprint / Aurora / Minimal** presets, 1200×630 + 1080×1080, timeframes (honest min/max scale printed on the card), toggles, custom title; Download PNG · Copy image · Copy link · Post to X. Deterministic, rate-limited card URLs (`/s/[slug]/share/[kind]/card?style=…`, `/u/[username]/card`). "Verified by UserTrack" only for verified sources. `docs/SHARING.md`. |
| **Share engine** | Significant events (100+ users, Top 100 / Top 10, records, 3× spikes, top-10 % benchmarks…) automatically become share-ready cards in the **Share Center** (`/app/share`) with X drafts; one-time keys, per-day / per-month cooldowns, dismiss / restore. |
| **X / social** | Canonical X handles, data-driven X drafts + intents, `/app/settings/social`; feature-flagged X OAuth (connect account, import handle/avatar) with **opt-in** per-category auto-posting (default off, ≤ 1/day) and a separate UserTrack-account pathway (verified milestones only, founder opt-outs). `docs/SOCIAL.md`, `HUMAN_TODO.md`. |
| **Follow + watchlist** | Follow products and founders (buttons and card chips, idempotent API + MCP); `/app/following` is a personal intelligence feed — milestones, spikes, rank jumps, weekly rank moves, new projects from followed founders, benchmark months — with a 7 / 30 / 90-day view; optional email alerts for the big moments with per-kind sub-preferences; weekly digest (in-app + email). `docs/FOLLOWS.md`. |
| **Email** | Resend-backed, three categories: **transactional** (welcome + verification, password reset, account deleted, source stopped syncing / recovered), **product nudges** (profile unfinished after 24h, product without source after 24h, first sync confirmed) and **growth** (user milestones 10→1M, Top 100/50/25/10/5/#1, spike ≥2.5× baseline, 7 quiet days, monthly report, weekly digest, followed-product updates). Per-user preferences at `/app/settings/notifications`, signed preference/unsubscribe links, one-click unsubscribe, delivery log with dedupe keys, bounce/complaint suppression. |
| **Benchmarks v2** | Daily deciles per cohort — category, **category × size**, size bucket, **platform**, **age** (founder-entered founding month, or tracking age — never mixed), all — for 30d + 7d growth, new users, **growth acceleration**, activation rate, trending score and the four conversion rates (aggregate definitions only); min sample **10**; percentiles in steps of 5 with Top 5 / 10 / 20 / 25 % bands; weekly standings history → "improved from the 55th to the 70th percentile since last month". Owner cards carry the cohort definition; the public page shows only top-quarter statements and only while the founder keeps the "Benchmark statement" toggle on. `docs/BENCHMARKS.md`. |
| **Public datasets** | `/api/v1/datasets/{trending, fastest-growing, new-and-rising, hidden-gems, movers, categories/{slug}, rankings/history}` as JSON or **CSV** with window / category / platform / cursor, methodology links and last-updated stamps; public projections only. `docs/DATASETS.md`. |
| **Webhooks** | HTTPS endpoints with one-time `whsec_` secrets, 7 event types (`milestone.reached`, `rank.changed`, `trending.rank_changed`, `growth.spike`, `integration.failed`, `integration.recovered`, `project.verified`) + test events; versioned payloads signed with HMAC-SHA256 (`UserTrack-Signature`, `-Timestamp`, `-Event`, `-Delivery`); async delivery with retries (5 min → 12 h), delivery log, rotate / disable / delete, SSRF protection (private ranges refused, hostnames re-resolved before every delivery). `/app/developer/webhooks`, docs at `/developers/webhooks`, MCP tools. `docs/WEBHOOKS.md`. |
| **Public API** | `/api/v1/saas/{slug}`, `/metrics`, `/history` (resolution + gaps), `/rank-history`, `/benchmark-history`, `/milestones`, `/funnel` (+ `/funnel/history`), `/conversion`, `/engagement`, `/cohorts`, `/benchmarks`, `/leaderboard` (12 boards, platform filter), `/trending`, `/categories`, `/discover`, `/compare`, `/datasets/*`, `/following` (API key, your own watchlist), `/users/{username}` (+ founder aggregates), `/users/{username}/history`. Stable DTOs, error envelope, CORS, OpenAPI. Anonymous 60 req/min; API key 1,000 req/day. |
| **MCP** | `/mcp` — 52 tools for Claude Code, Cursor, Codex, VS Code or any MCP client: stack-aware provider recommendation (web + mobile), create project, **import a profile from TrustMRR**, setup instructions, configure + verify each source independently, activation / conversion setup, identity-mapping guidance, publish, metrics, history, rank + rank history, milestones, funnel + history, cohorts, trending, benchmarks + benchmark history, compare, share cards, embed code, founder profile, **account export**, **discover**, **follow / unfollow products and founders**, **watchlist**, **datasets**, **webhooks** (list, create, update, test, deliveries). Scoped, hashed tokens (`follows:*`, `webhooks:*` scopes); audit trail. |
| **SEO** | Server-rendered pages, canonical URLs, JSON-LD (`SoftwareApplication`, `ItemList`, `Person`), intro + methodology + last-updated on every ranking page, monthly ranking archives, `sitemap.xml` (incl. frozen rankings and the legal pages), `robots.txt`, custom 404. Legal: `/impressum` (DE), `/privacy`, `/terms` (`src/lib/legal.ts`), footer on every layout, no cookie banner (session cookie only, cookieless self-hosted analytics). GDPR self-service: `/app/settings#data-privacy` downloads everything as JSON (`/api/account/export`, also MCP `usertrack_export_account`) and deletes the account — paged hard delete across every table, Better Auth rows last, confirmation email, no grace period. Every public page has its own live OG/Twitter image (`next/og`, shared blueprint frame in `src/lib/og`): product pages render the logo, stats and 30-day curve, founder profiles their projects, every board its current top 4, plus cards for home, discover, categories, compare and developers — with a data-free fallback for the rest. |
| **Analytics** | Self-hosted, cookieless Rybbit (no banner, no session replay, IP hashed daily, token paths masked, `/api/**` `/embed/**` `/mcp` skipped). Typed catalog of 44 product events in `src/lib/analytics.ts` fired at their real call sites, pseudonymous identify on sign-in / clear on sign-out, server-side events from route handlers (`api_request`, `mcp_tool_called`, `badge_rendered`, `embed_rendered`, `native_event_ingested`) and Convex (`webhook_delivered`, `sync_completed`). Goals + funnels to create in the dashboard: `docs/ANALYTICS.md`. |

## Public API
Read-only JSON for everything that is public. No key needed; an API key (`/app/developer`) raises the limit from 60 req/min per IP to 1,000 req/day.

```bash
curl https://usertrack.dev/api/v1/saas/acme/metrics
curl -H "Authorization: Bearer ut_api_…" "https://usertrack.dev/api/v1/leaderboard?board=trending&window=7d"
```

Endpoints, response shapes, error codes and rate-limit headers: [docs/API.md](docs/API.md). OpenAPI 3.1: `/api/openapi.json`.

## MCP for AI agents
Set up with AI in 60 seconds:

1. Sign in, open `/app/developer`, create an **MCP token** (`ut_mcp_…`, shown once).
2. Add the server to your agent, e.g. Claude Code inside your SaaS repository:
   ```bash
   claude mcp add --transport http usertrack https://usertrack.dev/mcp --header "Authorization: Bearer ut_mcp_…"
   ```
   (Cursor, Codex CLI, VS Code and generic snippets are on `/developers#mcp`.)
3. Tell the agent: *"Add this project to UserTrack. Detect the current authentication/user stack, choose the safest supported UserTrack integration, configure it, verify it, and return the public UserTrack URL."*
4. The agent asks for a provider recommendation (native SDK → Supabase → Clerk → Firebase → PostgreSQL → endpoint), creates the project, connects the source (native: `usertrack_create_integration { provider: "native", source }` issues the credential once, `usertrack_get_native_setup` returns the package-manager-aware install plan and the agent adds `userTrack()` to the Better Auth plugins array or one `@usertrack/node` route file with a count source; otherwise a read-only key, a read-only database role, or a tiny count endpoint), verifies, publishes, optionally adds an activation source, and hands back the public URL.

Tools, scopes, limits, security model and troubleshooting: [docs/MCP.md](docs/MCP.md).

## Stack
Next.js 16 (App Router, RSC) · React 19 · TypeScript · Tailwind 4 + shadcn/ui (Base UI) · Convex (DB, functions, crons, search, HTTP) · Better Auth via `@convex-dev/better-auth` · `@modelcontextprotocol/sdk` · zod · Recharts 3 · Motion · `next/og` · self-hosted Rybbit analytics · Railway.

## Developer setup
```bash
pnpm install
npx convex dev            # creates .env.local, pushes functions, watches
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL http://localhost:3000
echo 'NEXT_PUBLIC_SITE_URL=http://localhost:3000' >> .env.local
# gateway secret shared by Next.js and Convex (required everywhere — the gateway fails closed without it)
SECRET=$(openssl rand -hex 32); echo "UT_GATEWAY_SECRET=$SECRET" >> .env.local; npx convex env set UT_GATEWAY_SECRET "$SECRET"
npx convex run seed:run   # optional labelled demo data (never ranked)
pnpm dev                  # http://localhost:3000
```
Useful one-offs: `npx convex run leaderboard:rerank`, `npx convex run daily:run` (milestones, benchmarks, trust review, quiet-product check), `npx convex run digest:generate`, `npx convex run email/reports:generateMonthly`, `npx convex run seed:clear`.

### Email locally
Without `RESEND_API_KEY` nothing leaves the machine: every send is still evaluated (preferences, suppression, dedupe) and logged in the `emailEvents` table with `status: failed, error: "email not configured"`, so the whole pipeline is testable from the Convex dashboard. To really send, create a Resend key for `mail.usertrack.dev` and `npx convex env set RESEND_API_KEY re_…`. Templates are plain typed functions (`convex/email/templates`) — `pnpm test` renders every one; to eyeball them, `node scripts/email-preview.mjs` writes HTML files to `/tmp/ut-emails/`. `npx convex run email/testSend:run '{"to":"you@example.com","type":"welcome"}'` sends a real sample to one address.

Try the API and MCP locally: `curl localhost:3000/api/v1/leaderboard`, `curl localhost:3000/mcp` (discovery document), then create a token at `localhost:3000/app/developer` and point your agent at `http://localhost:3000/mcp`.

## Scripts
| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | ESLint · `next typegen && tsc` · Vitest (606 tests in 76 files: X follower counts (OAuth read, paged daily refresh, cooldown, anonymous stripping), product profile validation + anonymous stripping + logo upload, legal constants + redirects, GDPR deletion + export, social provider config + profile prefill, metrics, funnel, trending, trust, milestones, benchmarks + cohorts, history downsampling, webhook policy / signing, SSRF policy (URL / IP / DoH / Postgres host guard), datasets / CSV, providers incl. Postgres SQL builders / error mapping, Clerk backoff, Firebase scan, integration setup, API DTOs, badge, embed widgets, share, rate limit + client IP trust, email rules, templates, tokens, webhook signatures, MCP tools, OpenAPI, gateway secret, safe redirects, and `convex-test` function tests for durable rate limits / discovery / rank history / follows / webhooks / dedupe / preferences / lifecycle / milestones / reports / gateway / embed sites / publish gate / product profile) |
| `node scripts/email-preview.mjs` | Render every email template with sample data to `/tmp/ut-emails/*.html` |
| `pnpm packages:build` · `pnpm packages:test` · `pnpm packages:typecheck` | Build / test / typecheck every workspace package (`@usertrack/protocol`, `@usertrack/node`, `@usertrack/better-auth`; 61 tests) |
| `pnpm convex:dev` · `pnpm convex:deploy` | Convex dev watch · deploy to prod |
| `node scripts/smoke.mjs [base] [mobile]` | E2E: sign-up → onboarding → publish → public page → dashboard (needs Chrome) |
| `node scripts/shots-share.mjs [base] [out]` | v0.8 QA: founder profile, Share Studio (3 presets, square, 90d graph), SaaS share buttons, search, onboarding X field, Share Center (seeded via `seed:simulateGrowth`), social settings, desktop + mobile |
| `node scripts/shot.mjs <url> <out.png> [w] [h] [full]` · `node scripts/console.mjs <urls…>` · `node scripts/og.mjs [base]` | Screenshot · console-error sweep · OG image download |

## Environment variables
| Where | Variable | Required | Purpose |
|---|---|---|---|
| Railway (Next.js) | `NEXT_PUBLIC_CONVEX_URL` | yes | Convex deployment URL |
| | `NEXT_PUBLIC_CONVEX_SITE_URL` | yes | Convex HTTP router (auth proxy) |
| | `NEXT_PUBLIC_SITE_URL` | yes | Public URL used in metadata, OG, badges, share links, MCP snippets |
| | `UT_GATEWAY_SECRET` | yes | Sent with every gateway call (API keys, MCP). **Must be identical to the Convex value.** |
| Convex prod (`npx convex env set --prod`) | `BETTER_AUTH_SECRET` | yes | Auth secret |
| | `SITE_URL` | yes | Better Auth base URL / trusted origin, digest links, URLs returned by MCP tools |
| | `UT_GATEWAY_SECRET` | yes | Proves gateway calls come from the Next.js server; compared in constant time, and calls are rejected when it is missing on either side (fail closed). **Same value as on Railway.** |
| | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | Google sign-in (OAuth client, redirect URI `<SITE_URL>/api/auth/callback/google`) |
| | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | optional | GitHub sign-in (OAuth App, callback `<SITE_URL>/api/auth/callback/github`). Missing → button disabled, everything else works |
| | `IDENTITY_SALT` | yes | Salt for pseudonymous identity subjects (`docs/IDENTITY.md`); set on dev + prod, never rotate without purging `identityLinks` |
| | `RESEND_API_KEY` | yes | Resend sending key for `mail.usertrack.dev` (see `HUMAN_TODO.md`). Email+password sign-in requires a verified address, so without it new password accounts cannot sign in; every send is still logged |
| | `EMAIL_FROM` · `EMAIL_REPLY_TO` | no | Defaults `UserTrack <noreply@mail.usertrack.dev>` · `hello@usertrack.dev` |
| | `EMAIL_TOKEN_SECRET` | yes | Signs preference / unsubscribe links (falls back to `BETTER_AUTH_SECRET`) |
| | `RESEND_WEBHOOK_SECRET` | for delivery state | Svix signing secret of the Resend webhook → `<convex site url>/webhooks/resend` |
| | `X_CLIENT_ID`, `X_CLIENT_SECRET` | optional | Enables "Continue with X" sign-in (Better Auth provider `twitter`, callback `<SITE_URL>/api/auth/callback/twitter`), "Connect X" (OAuth 2.0 PKCE, callback `<SITE_URL>/api/social/x/callback`) and opt-in auto-posting from founder accounts. Missing → feature hidden, everything else works (`docs/SOCIAL.md`, `HUMAN_TODO.md`) |
| | `X_BOT_CONSUMER_KEY`, `X_BOT_CONSUMER_SECRET`, `X_BOT_ACCESS_TOKEN`, `X_BOT_ACCESS_SECRET` | optional | OAuth 1.0a credentials of the UserTrack X account for verified-only milestone posts (≤ 3/day, founder opt-outs). Missing → no bot posts |

Provider credentials (Clerk keys, service accounts, Stripe restricted keys, read-only database connection strings…) are entered by founders in the app or passed by an agent through MCP and stored only in `integrations.config` on Convex; they are never returned by any query, tool or audit entry and never reach the browser. Database sources are read in a Node-runtime action with a read-only session and aggregate SQL only (`pg` is declared in `convex.json` → `node.externalPackages`; no extra env vars). Developer tokens are stored as SHA-256 hashes.

## Layout

```
packages/protocol/     @usertrack/protocol — native protocol v1 (HMAC signing, nonce cache, wire types), zero deps, frozen fixtures
packages/node/         @usertrack/node — createUserTrackHandler + toNodeHandler + createTracker; adapters /prisma /drizzle /convex /authjs (own tests, README, AGENTS.md, HUMAN_TODO)
packages/better-auth/  @usertrack/better-auth 0.2.0 — the official Better Auth plugin, a thin wrapper over the two packages above
packages/*/e2e/        local HTTP end-to-end samples (pnpm --filter usertrack-node-e2e e2e · pnpm --filter usertrack-better-auth-e2e e2e)
convex/native.ts       native integration credentials (ut_int_ secret, shown once, rotate), event ingestion (5 event types, legacy path), event summary
convex/lib/nativeProtocol.ts / nativeSetup.ts  protocol v1 twin (fixtures + cross-implementation test) · per-source install plan shared by dashboard, docs and MCP
```
```
convex/                schema, auth, profiles, saas, integrations (+ live test, Postgres introspection), sync engine,
                       providerRun (V8 / Node dispatch), trust, leaderboard/trending, daily jobs (milestones, benchmarks),
                       follows, digest, public queries (boards, discover, feed, funnel, compare, benchmark highlight,
                       trending explain), seed, crons, tokens (developer credentials), onboarding (AI setup status)
convex/domain/         projects · integrations · metrics · funnel · visibility · events — the rules shared by dashboard, REST API and MCP
convex/cohorts.ts      identity-link paging → signup cohorts, identity quality, Cohort Verified · convex/migrations.ts (lifecycleV1, nativeV1)
convex/gateway.ts      token-authenticated entry points: scopes, ownership, quotas, audit, idempotent create, all MCP tool backends
convex/email/          mailer: send (dedupe + prefs + Resend), templates, prefs + signed tokens, lifecycle,
                       growth (milestones/rank/spike/followers), reports (monthly), webhook, testSend
convex/providers/      provider adapters behind one interface (native, clerk, supabase, firebase, auth0, posthog, plausible, ga4,
                       stripe, revenuecat, paddle, lemonsqueezy, chargebee, postgres, endpoint, manual) + google service-account
                       helper + conversion.ts (shared trial/converted aggregation); capability model + verification levels in types.ts
convex/node/           postgres.ts — the only Node-runtime action ("use node", pg): read-only TCP, aggregate SQL, introspection
convex/lib/            pure, unit-tested math: metrics, trending (v2), trust, milestones, spikes, retention, benchmarks,
                       tokens (format, SHA-256, scopes, plans), domain normalization, integrationSetup (catalog + recommendation + plans)
src/app/(public)/      /, /leaderboard, /trending, /discover, /compare (+ /compare/og), /categories/*, SEO boards,
                       /s/[slug] (+ share/[kind], share/[kind]/card), /u/[username], /developers, opengraph-image routes
src/app/api/           /api/v1/* public API, /api/openapi.json, /api/badge/[slug], /api/embed/[slug].json, /api/auth (+ /forgot-password, /reset-password pages)
src/app/embed/         /embed/[slug] — iframe document behind public/widget.js (records the embedding host)
src/app/mcp/           /mcp — MCP endpoint (Streamable HTTP, stateless)
src/app/app/           dashboard: overview (next actions), saas manage (anchored sections) + embed configurator, following, digest,
                       reports, profile, settings (+ notifications), developer (keys + tokens), onboarding (5 steps, optional activation)
src/app/email/         /email/preferences — signed-link preference page (no login)
src/components/        blueprint primitives, charts (growth w/ annotations, compare), public cards (funnel, discovery feed,
                       trending explain, embed badge), app forms (connect source, postgres wizard, test result, embed configurator)
src/lib/api/           respond (rate limits + envelope), gateway bridge, DTOs (incl. funnel / feed / compare), OpenAPI
src/lib/mcp/           server, tools (30) + setup workflow, config snippets + agent prompts
src/lib/               format, categories, providers-ui (setup instructions), share copy + kinds, badge SVG (+ chart widget), embed snippets + widget HTML, og renderers
docs/                  ARCHITECTURE · API · MCP · PROVIDERS · FUNNEL · IDENTITY · METRICS · TRENDING · BENCHMARKS · BACKLOG · ASSUMPTIONS · DEPLOYMENT · ROADMAP · CHANGELOG
HUMAN_TODO.md          the only things left that need a human
```

## Trust model (short)
`verified` = synced from an auth provider or a JSON endpoint on the SaaS's own domain · `unverified` = manual / foreign endpoint, badged, never ranked · `pending` = no successful sync yet. On top of that a **trust score** (provider type, connection age, sync continuity, activation, open anomaly flags) drives the public label and excludes "Data under review" products from rankings until flags auto-resolve. Details in `docs/ARCHITECTURE.md`.
