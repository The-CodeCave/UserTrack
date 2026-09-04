# UserTrack Backlog

Status legend: ☐ todo · ◐ in progress · ☑ done. The v0.1 MVP backlog (Epics 1–13, all ☑) lives in git history (`git show b7c0cb0:docs/BACKLOG.md`).

## v0.2 — "Trustworthy, discoverable, shareable"

Ordering is by vertical slice: every epic leaves the app deployable. Dependencies reference ticket IDs.

### Epic 20 — Data model & provider architecture (P0)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-2001 | Migration-safe schema extension | Add optional fields on `saas`/`integrations`/`dailyMetrics`; new tables `milestones`, `events`, `follows`, `fraudFlags`, `benchmarkAggregates`, `digests`, `syncRuns` extended. Search index on `saas`. | – | `npx convex dev --once` deploys against existing prod data with no data loss; all fields optional | ☑ |
| UT-2002 | Provider interface v2 | `roles` (users/activation/traffic/revenue), `capabilities`, `fetch(config, role)` → normalized `ProviderMetrics`, optional `fetchHistory`. Registry + UI metadata generated from one source. | 2001 | Existing providers pass updated unit tests; no provider-specific code outside `convex/providers/` | ☑ |
| UT-2003 | New providers | Firebase (service account → Identity Toolkit), Auth0 (M2M → Management API incl. daily stats + active users), PostHog (HogQL: activation + traffic), Plausible (stats API: traffic), GA4 (Data API: traffic), Stripe (subscriptions → paying customers + MRR). Google SA JWT helper shared. | 2002 | Validation + response parsing unit-tested; secrets never leave server; copy-paste setup instructions in UI | ☑ |
| UT-2004 | Sync engine v2 | Multi-role integrations per SaaS, staggered scheduling, retry with backoff, `syncRuns` log with duration, last success/failure on integration, previous-window deltas, activation/traffic/revenue recording, one-time history backfill. | 2002 | Cron spreads N integrations over 10 min; failures retry ≤2×; idempotent snapshot per run | ☑ |

### Epic 21 — Metrics: activation, retention, trust (P0)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-2101 | Activated users | Activation source (PostHog event / JSON endpoint / Auth0 active users) → `activatedUsers`, 24h/7d/30d, activation rate, daily history. UI: explain + configure, optional. | 2004 | Public page + dashboard show activation cards only when data exists | ☑ |
| UT-2102 | Retention (estimated) | `activeUsers30d` from Clerk/Auth0/PostHog → retained / churned / retention rate, labelled *estimated*; *unavailable* otherwise. | 2004 | Never renders numbers without source; label states estimated vs verified | ☑ |
| UT-2103 | Trust score + anomaly flags | Heuristics (provider, continuity, connection age, impossible jumps, drops, reconnect churn) → `trustScore`, `trustState`; `fraudFlags` table; public label (Verified / Partially verified / Under review / Self-reported). Under-review SaaS excluded from ranks. | 2004 | Unit tests for each heuristic; no public "fraud" wording | ☑ |
| UT-2104 | Growth spike detection | ≥3× 14-day average daily new users (and ≥20) → `events` row; also activation spikes. | 2004 | Event stored once per day; visible as chart annotation | ☑ |

### Epic 22 — Ranking & discovery (P0/P1)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-2201 | Trending score | Documented formula (volume × growth × acceleration × trust × activation) for 24h/7d/30d; `trendingRank` + previous rank for movement. | 2004 | Tiny products don't dominate; unit tests on formula; explanation in UI | ☑ |
| UT-2202 | Leaderboard boards + filters | Boards: trending, fastest, most-users, most-new, most-activated, activation-rate, new-rising. Filters: category, range, verification, size bucket. Server-rendered with URL state. | 2201 | Defaults sensible; mobile layout; ≤1 query per page | ☑ |
| UT-2203 | Categories | Fixed category list on SaaS; category select in form/onboarding; `/categories/[slug]` pages. | 2001 | Category shown on cards/pages; category pages indexable | ☑ |
| UT-2204 | Search & discover | Convex search index (name/description/tags) + profile search; `/discover` with Trending Now, Fastest This Week, New, Hidden Gems, Top Dev Tools, Top AI, Recent milestones. | 2202 | Real data only; empty sections hidden | ☑ |
| UT-2205 | Benchmarks | Daily `benchmarkAggregates` (deciles per group: all / category / size bucket) for growth %, activation rate, new users; dashboard benchmark cards with percentile sentences; min sample 5. | 2004 | Demo rows excluded; "not enough data" state | ☑ |
| UT-2206 | Fast-growth & SEO pages | `/trending`, `/fastest-growing-saas`, `/fastest-growing-ai-saas`, `/new-saas`, `/most-new-users`; sitemap, robots, canonical, OG/Twitter metadata, custom 404. | 2202 | Server-rendered, useful copy, internal links | ☑ |
| UT-2207 | Compare | `/compare?s=a,b,c` (≤4) multi-series chart + metric table. | 2202 | Readable palette; mobile stacks | ☑ |

### Epic 23 — Milestones, sharing, embeds (P1)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-2301 | Automatic milestones | Thresholds (10…1M), biggest day/week, entered top 10/100, best rank, growth streak, +X% month; persisted once per key with title/copy. | 2004 | No duplicates across syncs; timeline on public page | ☑ |
| UT-2302 | Share cards | `/s/[slug]/share/[kind]` (users, growth, rank, trending, milestone) with OG image + share buttons; dashboard share picker. | 2301 | 1200×630 PNG, brand frame, works in X/LinkedIn/Slack previews | ☑ |
| UT-2303 | Embeddable badges | `/api/badge/[slug].svg?type=users|growth|trending|verified`, cached; copy-paste HTML/Markdown UI. | 2201 | Renders in <50ms after cache; correct numbers | ☑ |
| UT-2304 | Chart annotations | Milestones + spikes + reconnects on the growth chart; second series toggle (activated). | 2301, 2104 | No clutter (max ~8 markers), tooltips explain | ☑ |

### Epic 24 — Social & digest (P1/P2)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-2401 | Follow system | Follow SaaS / founders, counts, `/app/following` feed (milestones + weekly deltas). | 2001 | Auth required; idempotent; unfollow | ☑ |
| UT-2402 | Weekly digest | Weekly cron builds per-profile digest (own SaaS, followed movers, milestones, trending); in-app `/app/digest`; email via Resend when `RESEND_API_KEY` set. | 2401 | Digest renders without email creds; HUMAN_TODO documents Resend setup | ☑ |
| UT-2403 | Social links | LinkedIn on profiles (X/GitHub/website exist). | – | Displayed on public profile | ☑ |

### Epic 25 — Revenue, traffic, funnel (P2)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-2501 | Stripe revenue (optional) | Restricted key → paying customers, MRR/ARR; `showRevenue` opt-in. | 2003 | Never required; hidden unless opted in | ☑ |
| UT-2502 | Traffic (opt-in) | Plausible / GA4 / PostHog visitors + sessions 30d; `showTraffic` opt-in. | 2003 | Hidden unless opted in | ☑ |
| UT-2503 | Funnel | Visitors → Signups → Activated → Paying with conversion rates; only connected stages. | 2501, 2502, 2101 | Visual funnel on public + dashboard | ☑ |

### Epic 26 — Public API & platform (P1)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-2601 | Public API v1 | `/api/v1/saas/[slug]`, `/history`, `/milestones`, `/api/v1/leaderboard`, `/api/v1/categories`; stable DTOs; error envelope; in-process rate limit; `/developers` docs. | 2202 | Only public-safe fields; 429 on abuse; documented | ☑ |
| UT-2602 | Dashboard overview | `/app` shows own SaaS metrics, trending rank, benchmark, milestones, digest preview. | 2205 | Replaces placeholder | ☑ |
| UT-2603 | Onboarding polish | Category step, provider instructions, activation nudge post-publish. | 2203 | Smoke test passes desktop + mobile | ☑ |

### Epic 27 — QA, docs, deploy
| ID | Title | Status |
|---|---|---|
| UT-2701 | Lint / typecheck / tests / build green; smoke test; screenshots 390 & 1440 | ☑ |
| UT-2702 | README, ARCHITECTURE, ROADMAP, ASSUMPTIONS, API docs, HUMAN_TODO, CHANGELOG | ☑ |
| UT-2703 | Convex deploy + Railway deploy + production smoke | ☑ |

## v0.4 — "Growth data layer"

Same vertical-slice ordering. v0.3 (domain layer, tokens, gateway, API keys, MCP, onboarding with AI) had no ticketed backlog; it is recorded in `docs/CHANGELOG.md` 0.3.0. Numbering continues at Epic 30.

### Epic 30 — Provider architecture v3 (P0)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-3001 | Capability model | `ProviderCapabilities` per configured source (`describe()`), `capabilitiesFromList` default, shown in the connect wizard, returned by `integrations.test` / `usertrack_verify_integration`, used for funnel provenance. | – | Postgres / Supabase / Firebase report ranges + history only when the configuration allows it; UI shows "windows derived from snapshot deltas" otherwise | ☑ |
| UT-3002 | Verification levels | `verificationLevel(kind, trust, caps, role)` → `verified` / `partially_verified` / `self_reported`; labels on sources, test card and funnel stages; SaaS-level label unchanged. | 3001 | Manual and foreign endpoints are `self_reported`; unit-tested | ☑ |
| UT-3003 | Node runtime dispatch | `runtime()` / `toPostgres()` on the interface, `convex/providerRun.ts` as the only switch, `convex/node/postgres.ts` (`"use node"`, `pg` external), `ConvexError { message, retryable }` → `ProviderError`. | – | Sync engine, `integrations.test` and `gateway.verifyIntegration` all go through `fetchMetrics` / `fetchHistory`; no provider branching elsewhere | ☑ |
| UT-3004 | Rate-limit hardening | `fetchJson` backoff on 429/503 (Retry-After ≤ 5 s, ≤ 2 retries), `mapLimit` for bounded backfills. | – | Clerk history runs 4 in flight; tests for backoff | ☑ |

### Epic 31 — Providers (P0)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-3101 | PostgreSQL provider | Read-only session, `count(*)` with created-at / soft-delete / status filters, `GROUP BY day` history, epoch columns, validated identifiers, custom `$1` SELECT for activation, secret-free `explain()` error mapping, 10 s / 20 s timeouts, SSL default by host. | 3003 | Write attempts fail (`25006`); connection strings never appear in errors; SQL builders + error mapping unit-tested | ☑ |
| UT-3102 | Postgres / Supabase wizard | `postgres-wizard.tsx`: connect + SSL → ranked table list (≤ 200, estimates) → columns + suggestions + preview count → confirm with live test; `integrations.introspectPostgres`; read-only-role SQL in UI and MCP setup plan. | 3101 | Nothing stored before the last step; `auth.users` pre-selected for Supabase | ☑ |
| UT-3103 | Supabase database mode | `mode: "database"` (session-pooler hosts only) with `auth.users` signups + history; API mode kept as fallback; mode derived from the config. | 3101 | Verified 24h/7d/30d + 30-day history from one query; `publicConfig` masks the project ref | ☑ |
| UT-3104 | Firebase signup scan | `accounts:batchGet` scan of `createdAt` (pages of 1,000, ≤ 100k) → windows + history; `scanSignups` opt-out; fallback to totals above the cap. | – | Pagination + cap unit-tested; user records discarded immediately | ☑ |
| UT-3105 | Clerk backoff + catalog | Clerk 429 backoff, bounded history concurrency; catalog + aliases for `postgres` (`DATABASE_URL`, `pg`, Neon, Vercel Postgres, Prisma/Drizzle), recommendation order `supabase → clerk → firebase → auth0 → postgres → endpoint`. | 3004 | `recommendIntegrations` tests; `manual` never recommended | ☑ |
| UT-3106 | Live test-connection card | `integrations.test` action + `TestResultCard` / `CapabilityList` in every connect flow. | 3001 | Counts, verification, masked config and capabilities shown before saving | ☑ |

### Epic 32 — Activation + funnel v2 (P0)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-3201 | Funnel timeframes | `convex/domain/funnel.ts`: 7d / 30d / 90d from `dailyMetrics`, previous window, flow vs stock, fallbacks below `min(days, 2)` rows. | – | ≤ 2 × days indexed rows per read; unit tests for fallbacks and conversions | ☑ |
| UT-3202 | Per-stage provenance | `source { provider, label, verification }` per stage from `funnelSources`; funnel-level `verification` (`verified` / `mixed` / `self_reported` / `none`). | 3002, 3201 | A funnel with one self-reported stage is never "verified" | ☑ |
| UT-3203 | Funnel surfaces | `public.funnel` (opted-in stages), `saas.funnel` (owner), `Funnel` component with timeframe tabs on public + dashboard, `GET /api/v1/saas/{slug}/funnel`, MCP `usertrack_get_funnel`. | 3201 | Same numbers on every surface | ☑ |
| UT-3204 | Activation in onboarding | Optional, skippable activation step; publish preview shows 7d growth + activation; celebrate step nudges only when no activation source exists; `usertrack_get_activation_setup`. | 3203 | Smoke test passes; `docs/METRICS.md` states that time-to-activation is out of scope | ☑ |

### Epic 33 — Trending v2 + discovery (P0/P1)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-3301 | Trending Score v2 | Freshness (24 h → 72 h) and history (14 days) factors, no-signal rules (< 5 new, stale, under review), `trendingFactors` + `explainTrending`. | – | Worked examples in `docs/TRENDING.md` reproduce; `growth.test.ts` | ☑ |
| UT-3302 | Per-window ranks + movement | `trendingRank24h` / `trendingRank` / `trendingRank30d` with `prev*` = previous rerank; deterministic order; `movement` + `explain` on trending boards. | 3301 | Stable #1 reads "same"; reruns with unchanged data change nothing | ☑ |
| UT-3303 | Trending explain UI | `public.trendingExplain`, ⓘ tooltip on product pages, one-line explain on `/trending` and boards. | 3301 | Factors shown are exactly the ones used | ☑ |
| UT-3304 | Stored discovery events | `launched` (first publish) and `verified` (first verified sync) events written once (`convex/domain/events.ts`), `saas.launchedAt` / `verifiedAt`, `events.by_time`. | – | Never duplicated across syncs / republishes; `discovery.test.ts` | ☑ |
| UT-3305 | Feed + discover v2 | `feedItems` merge of milestones + events with stable ids, `public.feed`, `/discover` sections (Recently verified, Biggest movers, Hidden gems with `HIDDEN_GEM_RULES`, category counts), `discovery-feed.tsx`, richer cards. | 3304 | Real stored data only; empty sections hidden; rules returned with the section | ☑ |

### Epic 34 — Share + embeds v2 (P1)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-3401 | Share engine | `week` and `spike-<id>` kinds, `parseShareKind`, `availableShareKinds`, one renderer for OG image + `/card` PNG, `?size=square` (1080×1080), edge cache headers. | – | Cards for kinds without data are not offered; `share.test.ts` | ☑ |
| UT-3402 | Badge v2 | `chart` widget (320×120 / 96), `window=7d\|30d`, `compact=1`, 120/min per-IP burst, CORS + nosniff, 404 with neutral SVG. | – | `badge.test.ts`; branding always rendered | ☑ |
| UT-3403 | Embed configurator | `/app/saas/[id]/embed` (type, timeframe, theme, size, live preview, HTML / Markdown / image URL), `#embeds` section linking to it, MCP `usertrack_get_embed_code`. | 3402 | Snippets match `/api/badge` params exactly (`badgeSrc` shared) | ☑ |
| UT-3404 | Share tooling for agents | MCP `usertrack_get_share_card` (page, image, square, X intent, milestone cards). | 3401 | Unknown kinds → `bad_request` | ☑ |

### Epic 35 — Benchmarks + compare (P1)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-3501 | Benchmarks v2 | Five metrics, `MIN_SAMPLE = 5` (delete below), deciles only, `percentileOf` steps of 5, `medianMultiple`, `benchmarkInsight`, `publicBenchmarkStatement` (≥ 75). | – | `benchmarks.test.ts`; no raw values stored | ☑ |
| UT-3502 | Benchmark surfaces | `saas.benchmarks` cards (compact variant on the overview), `public.benchmarkHighlight` on product pages, `GET /api/v1/saas/{slug}/benchmarks`, MCP `usertrack_get_benchmark`. | 3501 | Public page never states a below-top-quarter position | ☑ |
| UT-3503 | Compare v2 | `days=7\|30\|90\|365\|all`, `public.compare` on daily rows, Total / Indexed modes, window-growth row, share buttons, `/compare/og` image, `GET /api/v1/compare`, MCP `usertrack_compare_projects`. | – | ≤ 4 products; OG image only with ≥ 2 slugs | ☑ |

### Epic 36 — API / MCP / onboarding / QA (P1)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-3601 | API v1 additions | `/saas/{slug}/funnel`, `/saas/{slug}/benchmarks`, `/discover`, `/compare`; `funnelDto` / `feedItemDto` / `compareDto`; OpenAPI + `docs/API.md`. | 3203, 3305, 3502, 3503 | Field-by-field DTOs; `dto.test.ts` | ☑ |
| UT-3602 | 8 new MCP tools | `usertrack_get_provider_recommendation`, `usertrack_get_activation_setup`, `usertrack_get_funnel`, `usertrack_get_trending`, `usertrack_get_benchmark`, `usertrack_compare_projects`, `usertrack_get_share_card`, `usertrack_get_embed_code`; 10-step workflow; `postgres` in the tool enums. | 3601 | `tools.test.ts` / `server.test.ts` register 23 tools; `docs/MCP.md` | ☑ |
| UT-3603 | Dashboard IA | Overview "Next actions", anchored manage sections with "Next steps", compact benchmark cards, verification + capabilities on connected sources. | 3106 | Every action links to the section that resolves it | ☑ |
| UT-3604 | QA + docs | Lint / typecheck / 262 tests / build green; smoke script updated; `docs/PROVIDERS.md`, `METRICS.md`, `TRENDING.md`, `BENCHMARKS.md` new; CHANGELOG, ROADMAP, ASSUMPTIONS, ARCHITECTURE, MCP, README, BACKLOG updated. | – | `pnpm test` → 262 passed | ☑ |
| UT-3605 | Live provider verification | Exercise PostgreSQL, Supabase database mode and the Firebase scan against real accounts / databases. | 3101, 3103, 3104 | Not done: no live third-party credentials available to the agent (see `docs/ROADMAP.md`, known limitations) | ☐ |

## v0.5 — "Lifecycle: Growth → Activation → Conversion"

Numbering continues at Epic 40. Mirrors the CodeCraft board (UT-4001 … UT-4014).

### Epic 40 — Lifecycle model + conversion providers (P0)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-4001 | Lifecycle model | `conversion` role (legacy `revenue` migrated), capabilities `trial` · `converted` · `identity`, `trialUsers` / `convertedUsers` / `newConverted*` / `newTrials*` on `saas` + `dailyMetrics`, `stageSnapshots`, `migrations:lifecycleV1` (amounts cleared). | – | Migration idempotent; no `mrr` / `currency` written anywhere | ☑ |
| UT-4002 | Stripe rewrite + RevenueCat | Stripe: subscriptions by status → trial / converted, modes `active_paid` / `ever_paid` / `first_payment`, `metadata.userId` identities, no amounts / prices / expand. RevenueCat: `metrics/overview` active trials + active subscriptions, customers never registered users. | 4001 | Provider tests: active / non-paying / canceled / trial / multiple subs / duplicates; anonymous RevenueCat ids ignored | ☑ |
| UT-4003 | Paddle / Lemon Squeezy / Chargebee | Subscription / order state → trial / converted via shared `conversion.ts` (`SubRecord`, `aggregateConversion`, bounded paging). | 4001 | Unit tests per provider; read-only, amount-free | ☑ |
| UT-4004 | Funnel v3 | Dynamic stages, strategic `rates[]`, per-stage provenance + freshness + health, `basis` / `identityQuality`, `funnelHistory`. | 4001 | Full / partial / zero / hidden-count / stale tests | ☑ |

### Epic 41 — Identity, cohorts, visibility (P0)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-4005 | Identity + cohorts | `identityLinks` (salted SHA-256, `IDENTITY_SALT`), `cohortMetrics`, daily paged rebuild, quality `aggregate_only` / `partially_mapped` / `cohort_verified`, Cohort Verified badge. | 4001 | Exact / missing / partial / duplicate mapping tests; no PII stored | ☑ |
| UT-4006 | Visibility model | Per-metric keys, `saas.setVisibility`, `stripPrivate` on every public projection, conversion private by default; connection ≠ publication. | – | Public page / API / share cards never leak a private field (tests) | ☑ |

### Epic 42 — UX (P0/P1)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-4007 | Dashboard IA + funnel UI | Growth / Engagement / Conversion groups with health + freshness, premium funnel, funnel history chart with metric selection, Visibility section. | 4004, 4006 | Desktop + mobile screenshots; one broken source does not break the page | ☑ |
| UT-4008 | Onboarding | Platform step, web / mobile stack questions, recommendation, `projectType`, store links, auth methods, no mandatory payment step. | – | Smoke flow (desktop + mobile) passes | ☑ |
| UT-4009 | Public profile | Growth / Engagement / Conversion sections, Cohort Verified badge, store chips for mobile / hybrid. | 4006 | Conversion section only when published | ☑ |

### Epic 43 — Platform (P1)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-4010 | API | `/funnel` v3, `/conversion`, `/engagement`, `/cohorts`, conversion boards, SaaS object fields, OpenAPI, `docs/API.md`, `/developers`. | 4004, 4006 | `dto.test.ts`: rate-only publication carries no counts; no amounts in any response | ☑ |
| UT-4011 | MCP | `usertrack_get_provider_recommendation` (lifecycle composition, mobile), `usertrack_get_conversion_setup`, `usertrack_get_identity_mapping`, `usertrack_get_funnel_history`, `usertrack_get_cohorts`, mobile prompt, 12-step workflow. | 4010 | 27 tools registered (`server.test.ts`); `docs/MCP.md` | ☑ |
| UT-4012 | Benchmarks, boards, trending, emails, share | Conversion benchmark metrics (aggregate-labelled), secondary conversion boards, trending conversion factor ≤ ×1.10, monthly report funnel fields + changes, activation / conversion share cards. | 4006 | Core growth boards unchanged; no revenue anywhere | ☑ |

### Epic 44 — Docs, QA, deploy
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-4013 | Docs | README, ARCHITECTURE, PROVIDERS, METRICS, FUNNEL, IDENTITY, MCP, API, BENCHMARKS, ASSUMPTIONS, ROADMAP, CHANGELOG, BACKLOG, HUMAN_TODO. | – | Lifecycle semantics, aggregate vs cohort, RevenueCat / Stripe distinctions, visibility and the no-revenue policy are all documented | ☑ |
| UT-4014 | QA + deploy | Lint / typecheck / tests / build, smoke desktop + mobile, Convex prod deploy + `migrations:lifecycleV1`, Railway deploy, production verification. | all | `pnpm test` green; production funnel / API / MCP verified | ☑ |
| UT-4015 | Live payment-provider verification | Exercise Stripe / RevenueCat / Paddle / Lemon Squeezy / Chargebee against real accounts. | 4002, 4003 | Not done: no credentials available to the agent (`HUMAN_TODO.md`, optional) | ☐ |

## v0.6 — "Better Auth native integration"

Goal: Better Auth becomes a first-class, native-verified UserTrack provider with an official npm plugin (`@usertrack/better-auth`), a polished 2-minute manual setup and a fully MCP-automatable flow. Tickets are execution-ready: objective · scope · dependencies · acceptance criteria · done definition.

### Epic 50 — Workspace, research, protocol (P0)
- ☑ **50.1 Workspace setup** — Objective: add `packages/*` to the pnpm workspace without touching the Railway build. Scope: `pnpm-workspace.yaml`, root `tsconfig` excludes `packages`, root ESLint ignores `packages/**`, root scripts `packages:build|test|typecheck`. Deps: none. AC: root `lint/typecheck/test/build` unchanged and green; `pnpm install` links the package. Done: committed, Railway build unaffected.
- ☑ **50.2 Better Auth research** — Objective: use current plugin APIs (1.6.x, latest 1.7.2). Scope: `BetterAuthPlugin` shape, `init()` → `databaseHooks` merge order (plugin hooks before host hooks, both run), `createAuthEndpoint` (`SERVER_ONLY`/`isAction:false` remove the route from the HTTP router — do not use), `adapter.count` + `Where` operators, memory adapter for tests, `rateLimit`. AC: findings encoded in tests. Done: `docs/ASSUMPTIONS.md` A70–A76.
- ☑ **50.3 Shared protocol v1** — Objective: one signing scheme for pull and push. Scope: canonical string `v1\n{REQUEST|RESPONSE}\n{path}\n{ts}\n{nonce}\n{sha256(body)}`, HMAC-SHA256, headers `x-usertrack-{project,timestamp,nonce,signature}`, 5-min tolerance, response bound to request nonce, `pseudonymize()`. Twin implementations `packages/better-auth/src/protocol.ts` and `convex/lib/betterAuthProtocol.ts` frozen by `tests/fixtures/signatures.json` (generated by an independent `node:crypto` script). AC: both test suites verify the same fixtures. Done.

### Epic 51 — `@usertrack/better-auth` package (P0)
- ☑ **51.1 Package foundation** — `package.json` (ESM, exports, types, peer `better-auth >=1.3 <2`, files whitelist, provenance), tsconfig build, vitest, LICENSE, CHANGELOG. AC: `pnpm build` emits `dist/*.js + d.ts`; `pnpm pack` contains only dist/README/LICENSE/CHANGELOG/package.json.
- ☑ **51.2 Plugin core** — `userTrack({ projectId, secret, endpoint?, events?, debug? })`, option validation, defaults (`https://usertrack.dev`, events on). AC: missing projectId/secret throw at construction with actionable messages; secret never on the plugin object.
- ☑ **51.3 Metrics endpoint** — `POST /usertrack/metrics`: project header check, signature/timestamp/nonce verification, `days` (≤90) and `from/to`, anonymous exclusion, `count` with bounded scan fallback, signed response, `rateLimit` 30/min, secret-free 500s. AC: endpoint tests (valid, wrong project, wrong secret, stale, replay, tampered body, 400, range, anonymous, adapter failure).
- ☑ **51.4 Lifecycle events** — `databaseHooks.user.create.after` / `user.delete.after` → signed `user.created` / `user.deleted` with HMAC subject, fire-and-forget, 3 s timeout, never throws. AC: host hooks still run; signup succeeds with UserTrack down/hanging; no PII in payload.
- ☑ **51.5 Tests** — 42 tests across protocol / metrics / events / endpoint / init. Done.
- ☑ **51.6 README + HUMAN_TODO + release workflow** — README (what/install/quickstart/env/setup/security/verification/MCP/troubleshooting/dev), `HUMAN_TODO.md` (scope, trusted publishing, first publish, releases, community submission, owners), `.github/workflows/release-better-auth.yml` (tag-driven, test+build+pack check+provenance publish).

### Epic 52 — UserTrack provider + credentials + sync (P0)
- ☑ **52.1 Provider `better_auth`** — `convex/providers/betterAuth.ts`: validate (https, default `/api/auth`), trust `verified`, signed pull, response verification, protocol/plugin version gate, actionable error mapping (404 plugin missing, 401 secret mismatch, stale, 5xx, network), `fetchHistory` (daily newUsers). Registered in `ProviderKind` ×3, schema, registry, trust base 40, MCP enum, UI catalog. AC: provider unit tests + in-process e2e with the real plugin.
- ☑ **52.2 Integration credentials** — `convex/betterAuth.ts::createBetterAuthIntegration`: `ut_int_` secret (238 bits), shown once, stored in `config` + SHA-256 hash + prefix, idempotent create, `rotate`. Integration created `awaitingVerification` (excluded from cron/`requestSync`). AC: dashboard + MCP both create; second call returns no secret.
- ☑ **52.3 Verification flow** — `integrations.verifyStored` (owner) / `usertrack_verify_integration` (MCP) → live signed read → `markVerified` (clears awaiting, sets `connectedAt`, schedules first sync). AC: first snapshot written, `saas.trust` → verified after sync.
- ☑ **52.4 Scheduler + observability** — existing 4 h cron, retries; `pluginVersion` / `protocolVersion` stored on success (`ProviderMetrics.sourceVersion`); `lastEventAt`. AC: `integrationView` exposes them.
- ☑ **52.5 Event ingestion** — Next route `POST /api/integrations/better-auth/events` → `betterAuth.ingestEvent` (action: gateway secret, HMAC verify, protocol/type checks, dedupe by `eventId`) → `integrationEvents`; `eventSummary` for the panel; daily prune (30 d). AC: duplicate → 200, invalid signature → 401, stored → 202.

### Epic 53 — Dashboard, onboarding, public surfaces (P0/P1)
- ☑ **53.1 Setup wizard** — `better-auth-setup.tsx`: Create (URL) → Install (one-time env reveal, npm/pnpm/yarn/bun tabs, config snippet, env) → Verify (live result card, capabilities) → Live. "Waiting for deployment" status row with rotate + verify. AC: screenshots at 375/1440.
- ☑ **53.2 Provider card** — "Better Auth · Plugin · 2 min" first in the users list; recommended when the stack answer is Better Auth (`stack-recommendation`).
- ☑ **53.3 AI onboarding** — extra step "Plugin installed & deployed" for Better Auth projects; labels use provider labels.
- ☑ **53.4 Public provenance / API** — `source.provider = "better_auth"` flows through funnel DTO; public page shows "Better Auth"; nothing secret exposed.

### Epic 54 — MCP (P0)
- ☑ **54.1 Recommendation** — `better_auth` first in `USERS_PRIORITY`; aliases `better-auth`, `@better-auth/*`, `BETTER_AUTH_SECRET`, `@convex-dev/better-auth`; reasoning mentions the plugin; `priority`/`signals`/`nativePlugins` in `usertrack_get_provider_recommendation`.
- ☑ **54.2 `usertrack_create_integration`** — write; returns projectId + secret once, `rotate`, audit `create_integration`.
- ☑ **54.3 `usertrack_get_better_auth_setup`** — read; package-manager-aware install command, config example, env, `.env.example`, code-modification rules, version gate, steps, verification. `usertrack_get_integration_setup { provider: "better_auth" }` returns the same steps.
- ☑ **54.4 Workflow + prompt** — `SETUP_WORKFLOW`, `SERVER_INSTRUCTIONS` Better Auth flow, prompt `add_better_auth_project_to_usertrack`; tests updated (29 tools).

### Epic 55 — Docs, QA, deploy
- ☑ **55.1 Docs** — `README.md`, `docs/PROVIDERS.md`, `docs/MCP.md`, `docs/ARCHITECTURE.md`, `docs/ASSUMPTIONS.md`, `docs/ROADMAP.md`, `docs/CHANGELOG.md`, `docs/API.md`; public page `/developers/integrations/better-auth`; root + package `HUMAN_TODO.md`.
- ☑ **55.2 QA** — lint, typecheck, root tests, package tests, build, `pnpm pack`, local e2e (`packages/better-auth/e2e`), screenshots.
- ☑ **55.3 Deploy + smoke** — push `main`, Railway deploy (Convex deploy in build), production smoke: pages, MCP tool list (29), docs page, integration creation, events route.

## v0.7 — "Embeddable growth widgets"

### Epic 60 — Growth widgets + distribution (P1)
| ID | Title | Objective / scope | Deps | Acceptance criteria | Status |
|---|---|---|---|---|---|
| UT-6001 | Widget runtime | `public/widget.js` loader → iframe `/embed/[slug]` (users / growth / verified / chart; auto / dark / light; 7d / 30d; count-up; size via postMessage; 5-minute refresh from `/api/embed/[slug].json`; not-found pill). | 3402 | `widget.test.ts`, `embed.test.ts`; renders on dark + light host pages at 375 / 1440; every link carries `ref=embed` + UTM; branding always visible | ☑ |
| UT-6002 | Distribution tracking | `embedSites` + `saas.embedSiteCount`, `embeds.record` (gateway secret, host normalization, 1 write / host / minute, own host + localhost ignored), `getMine.embedSites`. | 6001 | `convex/embeds.test.ts`; hosts only, never IPs / paths; count written once per host | ☑ |
| UT-6003 | Surfaces | Configurator Live widget / SVG badge modes + “Where it's embedded”; manage `#embeds` summary; public “Embedded on N sites” chip; MCP `usertrack_get_embed_code { format: "widget" }`. | 6001, 6002 | Snippets come from `widgetSnippets` everywhere; docs (README, API, ARCHITECTURE, MCP, ROADMAP, CHANGELOG) | ☑ |


## v0.7 — "Native SDK integrations"

Goal: generalize the v0.6 Better Auth integration into ONE provider kind `native` that accepts any client speaking the protocol, and ship `@usertrack/node` with adapters so Prisma, Drizzle, Convex, Auth.js / NextAuth and custom apps become native-verified sources ("install package → UserTrack is done"). Tickets: objective · scope · dependencies · acceptance criteria · done definition.

### Epic 56 — Protocol package (P0)
- ☑ **56.1 `@usertrack/protocol`** — Objective: one signing implementation for every client. Scope: `packages/protocol` (ESM, WebCrypto only, zero deps, Node 18.17+/edge): canonical string, HMAC-SHA256 `sign` / `verify` / `signedHeaders`, `timingSafeEqual`, `NonceCache`, `pseudonymize`, header + path constants (`EVENTS_PATH` native, `LEGACY_EVENTS_PATH`), wire types. Deps: none. AC: fixtures (moved from the plugin, +2 cases) pass in the package and in the Convex twin; `pnpm pack` contains only dist/docs. Done: 9 tests, README, AGENTS.md/llms.txt, CHANGELOG.
- ☑ **56.2 Protocol v1 additive shape** — Objective: multi-role bodies without a version bump. Scope: `MetricsResponse` gains `source`, `clientVersion` (`pluginVersion` / `provider` deprecated aliases), `users` / `activation` / `conversion` / `identities` blocks, `capabilities.roles`; events gain `user.activated`, `trial.started`, `user.converted`. AC: the 0.1.x users-only body stays valid on the server (`parseMetrics` test). Done.
- ☑ **56.3 Convex twin decision** — Objective: verify whether Convex can import the workspace package. Finding: the Convex bundler resolves `@usertrack/protocol` through `node_modules` → `dist/`, which only exists after a package build (Railway build + `convex dev` would depend on it). Decision: keep `convex/lib/nativeProtocol.ts` self-contained; `nativeProtocol.test.ts` asserts identical signatures for the fixtures and 25 random inputs against `packages/protocol/src`. Done: `docs/ASSUMPTIONS.md` A79.

### Epic 57 — `@usertrack/node` (P0)
- ☑ **57.1 Handler core** — `createUserTrackHandler({ projectId, secret, users, activation?, conversion?, identities?, source?, debug? })` → `(Request) => Promise<Response>`; `handleMetrics` (framework-agnostic core reused by the Better Auth plugin); `toNodeHandler()`; project header + signature + nonce + protocolVersion checks; 400 / 401 / 405 / 500 mapping (`USERTRACK_SOURCE_ERROR`, never leaks the source error). AC: handler tests (valid multi-role, timeFilter=false, exact=false, empty body, ranges, wrong project / secret, stale, replay, tampered body, 400s, 405, 500, option validation, Node http). Done.
- ☑ **57.2 Count sources + collector** — `CountSource { count(where), timeFilter? }`, `CountResult` number | `{ count, exact }`; `collectMetrics` builds users (total, 24h/7d/30d, daily ≤ 90, range), activation (+ daily), conversion (converted / trial windows, mode), identities (cap 5,000, `@` dropped). Done.
- ☑ **57.3 Tracker** — `createTracker({ projectId, secret, endpoint?, source?, debug? })` → `track()` (void, never throws) + `deliver()`; 3 s timeout; HMAC subject; native events path. AC: never-blocks tests. Done.
- ☑ **57.4 Adapters** — `/prisma` (`prismaUsers(model, { createdAtField?, where? })`, `userTrackPrismaExtension` on `create` / `delete`), `/drizzle` (`drizzleUsers(db, table, { createdAt?, where? })` via `count()` + `gte` / `lt`; optional peer dep), `/convex` (`convexHandler(opts)` for `httpAction`, `countWithCap(query, cap)`), `/authjs` (`userTrackAuthjsEvents`). AC: in-memory fakes + rendered SQL (PgDialect) tests. Done: `docs/ASSUMPTIONS.md` A81–A84.
- ☑ **57.5 e2e + docs** — `packages/node/e2e/run.mjs` (real HTTP: multi-role pull, signature, 401, push, receiver down) + `serve.mjs`; README (adapters, Express / Hono / Remix, security, troubleshooting), AGENTS.md / llms.txt, CHANGELOG, HUMAN_TODO (publish order, real-world adapter test). Done.
- ☑ **57.6 Better Auth 0.2.0** — depends on `@usertrack/protocol` + `@usertrack/node` (`betterAuthUsers` count source, `handleMetrics`, shared tracker); nested `users` block; native events path; `betterAuthUsers` exported for combined handlers. AC: 30 tests + e2e green; CHANGELOG / README / HUMAN_TODO / AGENTS.md updated. Done.

### Epic 58 — Provider generalization, migration, compat (P0)
- ☑ **58.1 Provider `native`** — `convex/providers/native.ts`: roles users / activation / conversion, per-source base path + metrics URL, `explainStatus(status, code, url, source)`, min client version per source, `parseMetrics` (legacy + nested shapes, identities via `parseIdentities`), `fetchHistory` (users + activation), `describe()` from `config.reported`, `labelFor()`. Registered in types / schema / registry / catalog / UI / MCP / stack recommendation / trust (40). AC: 20 provider tests + in-process e2e with the real plugin. Done.
- ☑ **58.2 Multi-role attach** — `ProviderMetrics.reported`; `sync.recordSuccess` → `domain/integrations.recordReported` stores the report on the config and inserts sibling `native` rows for reported roles that have no source yet. AC: never replaces an existing source; rotation re-keys siblings. Done.
- ☑ **58.3 Credentials + events** — `convex/native.ts`: `createNativeIntegration({ url?, source, rotate? })`, `ingestEvent` (native + legacy signed path, 5 types), `eventSummary` per type, prune. Next routes `/api/integrations/native/events` + legacy re-export. Done.
- ☑ **58.4 Migration + aliases** — `migrations:nativeV1` (integrations → `native` + `source: "better-auth"`; snapshots / stageSnapshots / syncRuns provenance, paged), `normalizeProviderKind` on read, `better_auth` literal kept in the schema, accepted by `usertrack_create_integration` / `usertrack_get_integration_setup` / `DETECTION_ALIASES`. AC: schema + migration compile on the dev deployment (`npx convex dev --once`). Done. ☐ **Run on production** (human, `HUMAN_TODO.md`).
- ☑ **58.5 Catalog + recommendation** — `native` catalog entry; ORM / auth aliases → native; `detectNativeSource`; strong-vs-ORM priority rule; `nativeSource` in the recommendation; activation / conversion from the same handler; `conversionSetup` native branch; identity mapping entries. AC: `integrationSetup.test.ts` cases. Done.

### Epic 59 — Dashboard, docs, MCP, QA (P0/P1)
- ☑ **59.1 Wizard** — `native-setup.tsx`: source picker (Better Auth / Prisma / Drizzle / Convex / Auth.js / Custom) → Create (per-source default URL) → Install (one-time secret, install tabs, per-source route / plugin snippet, env, optional push hook) → Verify → Live; `NativeLive` shows created / activated / trials / converted; "My app (SDK)" card ("SDK · 2 min"); activation / conversion roles explain the auto-attach. Onboarding stack answers Auth.js / Convex / Custom → native with a preselected source. Done.
- ☑ **59.2 Public docs** — `/developers/integrations/native` (overview, per-source tabs with install / route / push hook / notes, activation & conversion, protocol, privacy, MCP prompt, troubleshooting); `/developers/integrations/better-auth` updated (0.2.0 shape, link to native). Done.
- ☑ **59.3 MCP** — `usertrack_get_native_setup { source }`, `usertrack_get_better_auth_setup` deprecated alias, `usertrack_create_integration { provider: "native" | "better_auth", source? }`, prompt `add_native_sdk_project_to_usertrack`, workflow + instructions, `usertrack_get_provider_recommendation.nativeSources`. AC: 30 tools, tests updated. Done.
- ☑ **59.4 Docs** — README, PROVIDERS (matrix row, renaming + adapter recipes), ARCHITECTURE (native section), MCP, API, ASSUMPTIONS (A77–A88), CHANGELOG, ROADMAP, HUMAN_TODO (root: v0.7 paragraph, v0.6 adjusted; packages). Done.
- ☑ **59.5 QA** — root lint / typecheck / test (363) / build, `packages:typecheck` / `test` (61) / `build`, both e2e samples, `npx convex dev --once`; screenshots under `docs/screenshots/v0.7` (light + dark, desktop + mobile). Done.
- ☐ **59.6 Publish + deploy** (human) — publish `@usertrack/protocol` → `@usertrack/node` → `@usertrack/better-auth@0.2.0`; `npx convex deploy` → `migrations:nativeV1 --prod` → Railway; verify one real native integration. See `HUMAN_TODO.md`.
## v0.8 — "Founder identity & sharing"

Goal: every meaningful growth event is one click from a designed, shareable asset; founders get a first-class public identity that aggregates their products. Tickets mirror the CodeCraft board (6 epics, 66–71).

### Epic 66 — Founder profiles (P0)
- ☑ **66.1 Aggregates** — `convex/lib/founder.ts` (Σ users / new users, combined growth, weighted activation, published converted, best rank, trending count, biggest growth) + `public.profileByUsername` (public projects only, `profilePublic`). AC: unit tests incl. weighted vs mean, empty founder. Done.
- ☑ **66.2 History** — `public.founderHistory` with per-project forward fill; `FounderGrowth` chart (Total / New / by project). AC: convex-test forward-fill case. Done.
- ☑ **66.3 Page + OG** — header, links, X state, stats, chart, project grid, JSON-LD, metadata, `noindex` without products; OG = founder card. Done.
- ☑ **66.4 Search** — founders with counts. Done.

### Epic 67 — X handle + social settings + onboarding (P0)
- ☑ **67.1 `src/lib/social.ts`** — normalize / validate / display / intent / states, tests. Done.
- ☑ **67.2 Schema** — `location`, `profilePublic`, `xUserId`, `xConnectedAt`, `socialPrefs`. Done.
- ☑ **67.3 Forms** — onboarding (avatar + X optional, new copy), `/app/profile` (X, location), `/app/settings/social`, settings card, nav "Share". Done.

### Epic 68 — Share Card Studio + renderer (P0)
- ☑ **68.1 Config** — `src/lib/share-card.ts` (URL codec, defaults, title sanitizing, verification wording), tests. Done.
- ☑ **68.2 Renderer** — presets (frame `Backdrop`), `OgRangeChart` with printed scale + dates, `renderShareCard` config-aware, `benchmark` kind, `renderFounderCard`; `/card` routes rate-limited. Done.
- ☑ **68.3 Studio + entry points** — `ShareStudio`, `ShareButton`, MetricCard `action` slot, public SaaS page, dashboard, share page, founder page. Done.
- ☑ **68.4 Analytics** — `share.track` → `shareStats`. Done.

### Epic 69 — Share engine + Share Center (P0)
- ☑ **69.1 Rules** — `convex/lib/shareRules.ts` (categories, floors, score, benchmark key, `botWorthy`, `normalizePrefs`), tests. Done.
- ☑ **69.2 Engine** — `shareEvents`, hooks in `addMilestones` and the spike path, daily `benchmarkSweep`, dismiss / restore / markShared, `readyCount`. Done.
- ☑ **69.3 Center** — `/app/share` Ready / Shared / Dismissed, per-event Studio, Copy link, Post to X. Done.
- ☑ **69.4 Emails** — Share Center line in user- and rank-milestone emails. Done.

### Epic 70 — X sharing, OAuth, auto-post, bot (P0/P1)
- ☑ **70.1 Drafts** — `src/lib/x-drafts.ts`, tests (all kinds ≤ 280). Done.
- ☑ **70.2 OAuth** — `oauthStates`, `/api/social/x/connect` + `/callback`, `social.beginOAuth / consumeState / completeOAuth / storeConnection / disconnect`. Done (flagged).
- ☑ **70.3 Auto-post** — hourly `social.autoPost`, `deliverPost` with refresh, `socialPosts`, limits, errors surfaced. Done (flagged).
- ☑ **70.4 Bot pathway** — OAuth 1.0a signing (documented vector test), env credentials, `botWorthy`, opt-outs, daily cap. Done (flagged).
- ☑ **70.5 HUMAN_TODO** — X developer app + bot account. Done.

### Epic 71 — Platform (P1)
- ☑ **71.1 API** — `/users/{username}` aggregates, `/users/{username}/history`, OpenAPI, DTOs. Done.
- ☑ **71.2 MCP** — 6 tools, `profile:write`, share workflow, tests (36). Done.
- ☑ **71.3 Docs** — PROFILES, SHARING, SOCIAL, ARCHITECTURE, API, MCP, ASSUMPTIONS, ROADMAP, CHANGELOG, README, HUMAN_TODO. Done.
- ☑ **71.4 QA + deploy** — lint / typecheck / tests / build, screenshots desktop + mobile, push main, Railway, production smoke. Done.

## v0.9 — "Discovery, follow, history, benchmarks v2, datasets, webhooks"

### Epic 80 — History foundations (P0)
- ☑ **UT-5001 Schema + history** — `rankHistory`, `benchmarkHistory`, `rankingSnapshots`, `backfills`, `webhookEndpoints` / `webhookDeliveries`; movement fields, `foundedAt`, `visibility.benchmarks`, follow sub-preferences; `lib/history.ts` (downsample, gaps, rank movement, rank-jump rule); idempotent `recordHistory` + provenance; owner backfill. AC: `convex/history.test.ts`, `lib/history.test.ts`. Done.
- ☑ **UT-5008 History UX** — `public.history` with resolution + gaps, time-axis growth chart with shaded gaps, rank history chart, "Backfill history" action + run list. Done.

### Epic 81 — Discovery v3 (P0)
- ☑ **UT-5002** — movers from stored history, `hidden-gems` / `movers` boards, platform filter, `discover(category)`, mobile section, `rank_jump` / `traction` / `benchmark` events, related products, search categories, follow chips, cards with new users + growth. AC: `discovery.test.ts`, `history.test.ts`. Done.

### Epic 82 — Follow + watchlists (P0)
- ☑ **UT-5003** — idempotent follow / unfollow / ids, `watchlistFeed`, `/app/following` v2, sub-preferences + gated fan-out, `/api/v1/following`, MCP follow tools. AC: `follows.test.ts`. Done.

### Epic 83 — Benchmarks v2 (P0)
- ☑ **UT-5004** — `cohortsFor` (category × size, platform, age / tracked), acceleration, `MIN_SAMPLE` 10, weekly standings, previous percentile + change insight, cohort definitions, public toggle, benchmark feed events, dashboard cards v2. AC: `lib/benchmarks.test.ts`, `history.test.ts`. Done.

### Epic 84 — Public datasets + SEO (P0/P1)
- ☑ **UT-5005** — six new ranking pages, `/rankings` archive from monthly snapshots, methodology / last updated / JSON-LD / internal links on every board, redirects, sitemap, `/api/v1/datasets/*` JSON + CSV with cursor. AC: `datasets.test.ts`, `history.test.ts` (snapshot freeze). Done.

### Epic 85 — Webhooks (P0)
- ☑ **UT-5006** — engine (dispatch, signed async delivery, retries, ledger, SSRF policy + DoH, auto-disable, retry sweep), owner API, `/app/developer/webhooks`, `/developers/webhooks`, MCP tools. AC: `lib/webhooks.test.ts`, `webhooks.test.ts`, `gateway.test.ts`. Done.

### Epic 86 — Platform + docs + QA (P1)
- ☑ **UT-5007** — REST additions, OpenAPI, DTOs, gateway functions, 14 MCP tools + 4 scopes, `docs/API.md`, `docs/MCP.md`. Done.
- ☑ **UT-5009** — docs set, README, HUMAN_TODO, lint / typecheck / tests / build, screenshots, push, Railway deploy, production smoke. Done.

## v1.0 launch hardening

### Epic 90 — Security (P0)
- ☑ **SEC-1** — gateway secret fails closed (`convex/lib/gateway.ts`, constant-time), honest credential wording everywhere, `safeInternalPath` for every `next` / `redirectTo`, security headers + CSP in `next.config.ts` (embeddable routes stay frameable), `requireEmailVerification: true` with inbox / resend states and a verified-email gate on publishing (dashboard, onboarding, MCP, public founder profile). AC: `lib/gateway.test.ts`, `safe-redirect.test.ts`, `publishGate.test.ts`, gateway / embed tests, curl header check, sign-in smoke. Done.
- ☑ **SEC-2** — real rate limiting: `@convex-dev/rate-limiter` component + `rateLimits.check` (gateway-gated), named catalog in `convex/lib/rateLimits.ts`, `limit(req, name, key?)` with the in-memory bucket as first line, trusted client IP (`src/lib/client-ip.ts`, last `x-forwarded-for` hop), 429 + `Retry-After` + `no-store` everywhere. AC: `client-ip.test.ts`, `rate-limit.test.ts`, `convex/rateLimits.test.ts`, curl loop to 429 against `/api/badge/demo-northwind.svg`. Done.
- ☑ **SEC-3** — SSRF protection for all provider fetches: shared `convex/lib/ssrf.ts` (webhooks re-use it), validate-time host policy for endpoint / native / PostHog / Plausible / Supabase API / Auth0, fetch-time DoH resolution in `providerRun.assertPublicHosts` with one generic error, `redirect: "manual"` + 15 s timeout on every provider request, `dns.lookup` guard before every Postgres connection (`UT_ALLOW_PRIVATE_DB=1` for local dev). AC: `lib/ssrf.test.ts`, `providers/ssrf.test.ts`, `providerRun.test.ts`, `node/postgres.guard.test.ts`. Done.
- ☐ **Rate-limit Better Auth sign-in / sign-up (`signIn` 20 per 10 min per IP)** — Better Auth runs inside the Convex HTTP router behind the `/api/auth` proxy, so the Next.js `limit()` helper cannot wrap it and the client IP does not reach the Convex side untouched; needs a `hooks.before` in `convex/auth.ts` that forwards a trusted IP header from the proxy and calls the limiter through `ctx.runMutation`. Deferred from SEC-2.
- ☐ **App-level envelope encryption for `integrations.config`** — encrypt provider credentials and webhook secrets with a KMS-style key from env before they reach Convex; decrypt only inside the sync / delivery actions. Future.
- ☐ **Dashboard error toasts show "Server Error"** — Convex formats thrown errors as `…Server Error\nUncaught Error: <message>`; the app-wide `.replace(/^.*Uncaught Error: /, "")` never matches across the newline, so every server-side validation message (username taken, invalid URL, …) is hidden. SEC-1 fixed the two publish sites with `/Uncaught \w*Error: ([^\n]*)/`; move the rest to one shared `errMsg` (and consider `ConvexError` for user-facing messages, which survive production redaction). Belongs with the error-tracking / error-boundary ticket.

### Epic 91 — Legal & GDPR (P0)
- ☑ **LEGAL-1** — `/impressum` (DE, CodeCave operator data), `/privacy` (EN + DE summary, code-accurate data categories, legal bases, processors, retention, cookies without banner, cookieless Rybbit, rights, deletion/export), `/terms` (EN, German law, CC BY 4.0 for public growth data, review/unlist, liability), `/imprint` redirect, `SiteFooter` in public / auth / app layouts, sign-up consent line, sitemap + `rel` links, `src/lib/legal.ts` constants. AC: `legal.test.ts`, curl 200 / 301, screenshots 375 / 768 / 1440. Done.
- ☑ **LEGAL-2** — self-service GDPR deletion + export: `convex/account.ts` (`exportAccount`, `deleteAccount` → `purge` → paged `purgeStep` over all 32 user-owned tables + Better Auth rows via the component adapter), shared `removeProjectRows` / `removeSaas` in `convex/domain/projects.ts` (also used by `saas.remove` / seed), `GET /api/account/export`, MCP `usertrack_export_account` (read-only; no deletion via MCP), `account-deleted` transactional email, Settings → Data & privacy panel with type-DELETE dialog. AC: `convex/account.test.ts` (every table empty for the user, demo + other founders untouched, export free of secrets), MCP 51, screenshots 375 / 768 / 1440. Done.
- ☐ **Lawyer review of the agent-written legal texts** before public launch (HUMAN_TODO.md).

### Epic 93 — Auth & social login (P1)
- ☑ **AUTH-1** — GitHub + X sign-in next to Google: conditional `socialProviders` from env (`convex/lib/authProviders.ts`, X reuses the Connect X app), strict X user-info (no email → actionable `email_not_found`), `accountLinking` (trusted google/github/twitter), `auth.providers` query, three social buttons on `/sign-in` + `/sign-up`, Settings → Connected accounts (link / unlink, last method protected), profile import on first login (`account.onCreate` → `authProfile.importProviderProfile` → empty `profiles.github` / `profiles.x` / `avatarUrl`, `profilePrefills` until the profile exists), docs + HUMAN_TODO (GitHub OAuth App, X callback + email permission).
- ☐ **Set a password from Settings for social-only accounts** — Better Auth `setPassword` is server-only; the Connected-accounts panel currently points to the forgot-password flow.
- ☑ **SOCIAL-1** — X follower counts for connected founders: `profiles.xFollowers` / `xFollowersAt` read only from the founder's own token (`/2/users/me` + `public_metrics`, free tier — no lookup by handle) on Connect X, X sign-in / link and a daily paged `social.refreshFollowers` (50 per action, token refresh, 401 → `error`, 429 ends the run), `social.refreshNow` (1/min) in Settings; shown on `/u/<username>`, owner chips, `/s/<slug>` Built by, founder OG / share card; API `Profile.xFollowers` + `Saas.owner.xFollowers`, MCP profile; anonymous / hidden profiles never leak it. Typed handles get a "Connect X" nudge. Founder directory sorting skipped — there is no founder list (see A184).

### Epic 94 — Product profiles (P1)
- ☑ **PROFILE-1** — rich SaaS profile modelled on TrustMRR's startup form minus every revenue field: markets / tech stack (190+ curated entries with simple-icons, free text allowed) / marketing channels chip selects, cofounders (≤5, X + GitHub), country picker with flags, funding + team size, product texts (value proposition, problem, audience, pricing model, more), anonymous mode (server-side stripping of owner / cofounders / logo / website / stores on every public surface incl. OG + share cards + API), hide from Google (`noindex` + sitemap exclusion), logo upload via Convex storage (≤1 MB png / jpg / webp), `name` ≤100 / `description` ≤500, About + Company & stack sections on `/s/[slug]`, `/stacks/[slug]` SEO boards + `?stack=` filter, DTO / OpenAPI / MCP `usertrack_update_project` extended. AC: `convex/domain/projects.test.ts`, `convex/profile.test.ts`, visibility + DTO tests, screenshots 375 / 768 / 1440 (form, public page, anonymous page, `/stacks/nextjs`). Done.
- ☑ **IMPORT-1** — "Import from TrustMRR" on the new / edit project forms and MCP (`usertrack_import_from_trustmrr`): one operator key `TRUSTMRR_API_KEY` (feature flag → "Not configured" / `not_configured`), URL-or-slug parsing, tolerant mapper with fixtures (`convex/lib/trustmrr{,.fixtures,.test}.ts`), revenue fields excluded by construction, 5 imports / 10 min per founder + shared 10 / min via the SEC-2 limiter, diff-style preview with Apply / Cancel / overwrite, highlighted prefills, `saas.trustmrrSlug` + "Also on TrustMRR" link (hidden in anonymous mode), analytics events, docs + HUMAN_TODO (create the key, paste one real response into the fixtures).
- ☐ **Confirm the TrustMRR mapper against a live response** — the fixture mirrors the public API docs; once `TRUSTMRR_API_KEY` exists, run one import and paste the real JSON into `convex/lib/trustmrr.fixtures.ts` (HUMAN_TODO.md).
- ☐ **Stack / country filters as first-class board filters** — `?stack=` exists on every board and `/stacks/[slug]` is indexed, but the filter bar has no stack or country chips yet (in-memory filtering keeps it cheap; add `techStack` / `country` to `BoardFilters` UI when there are enough profiles to make it useful).
- ☐ **X follower counts for cofounders** — cofounders are plain handles; only the owner's connected X account has a follower count.

### Epic 92 — Analytics (P1)
- ☑ **ANALYTICS-1** — self-hosted cookieless Rybbit: `<AnalyticsScript/>` + `<AnalyticsIdentity/>` in the root layout (skip / mask patterns, env-configurable host + site id, off in tests), typed event catalog in `src/lib/analytics.ts` (44 client events today) wired at every call site, `serverTrack()` from route handlers (`api_request`, `mcp_tool_called`, `badge_rendered`, `embed_rendered`, `native_event_ingested`) and `convex/lib/analytics.ts` (`webhook_delivered`, `sync_completed`, opt-in per deployment), privacy wording aligned, `docs/ANALYTICS.md` with the goals / funnels to create by hand.
- ☐ **Rybbit dashboard configuration** — site settings (autocapture, web vitals, errors, replay off, hostname exclusion), the 9 goals and 2 funnels, `RYBBIT_API_KEY` + `RYBBIT_SITE_ID` on Convex prod — human task, see `HUMAN_TODO.md`.

### Epic 95 — Scale & operations (P0)
- ☑ **OPS-1** — every cron / full-table job is paged (`convex/jobs.ts`, `PAGE`): paged mutation drivers with `cursor` + `runId` (`daily.run` 10 · `trust.dailyReview` 50 · `daily.standings` 50 · `share.benchmarkSweep` 100 · `digest.generate` / `email.reports.generateMonthly` 50 profiles · `email.lifecycle.noGrowthSweep` 100) and two-phase action drivers where the ordering is global (`leaderboard.rerank` and `daily.benchmarks` page a compact projection into memory, compute, then write back in pages of 50; `daily.snapshotRankings` 200; `sync.runAll` 500 integration ids with the unchanged 10-minute stagger; `cohorts.rebuildAll` 200). Per-project failures are caught, logged and counted instead of killing the job; every driver writes a `jobRuns` row (`job`, `startedAt`, `finishedAt`, `pages`, `items`, `errors`, `lastError`). The weekly digest reads bounded windows (`by_public_trending`, top 200 of `by_public_rank`, ≤ 500 follows) instead of the whole public table. Ranking / trending / milestone / benchmark semantics are unchanged (`convex/jobs.test.ts` compares 120- and 250-project runs against single-pass references).
- ☑ **OPS-2** — public-page caching + bounded board queries. Nothing under `(public)` reads a cookie on the server any more (root layout drops `getToken()`, `SiteHeader` delegates the Dashboard / Sign-in switch to the client `HeaderAuth`), public pages read Convex through `src/lib/convex-public.ts` (`publicQuery` for pages without search params, `cachedQuery` / `unstable_cache` 300 s per URL for the ones with) instead of `fetchQuery`'s `cache: "no-store"`, and `revalidate = 300` + `generateStaticParams` on the dynamic segments gives real ISR (`x-nextjs-cache: HIT`, verified by `scripts/cache-check.mjs`). `next.config.ts` adds `Cache-Control: public, s-maxage=300, stale-while-revalidate=1800` on the public routes only (SEC-1 headers merged, not replaced). Boards moved to `convex/lib/boardRules.ts` and are read through 15 new per-sort-key `saas` indexes with an early-exit walk (`public.boardRows`), the directory counters are materialized in the new `publicStats` singleton by the rerank, the feed resolves projects per event, and `publicSet` / the sitemap are capped at 5,000 rows. Results are byte-identical to the old in-memory sort (`convex/boardScan.test.ts`, `discovery.test.ts`).
- ☑ **OPS-3** — retention, Sentry, error boundaries, `/api/health`, CI, doc drift. `convex/retention.ts` sweeps one table per step (take(200) + reschedule, scheduled last by the daily sweep, logged as `retention sweep`): `syncRuns` / `webhookDeliveries` (`success` + `exhausted` only) 30 d, `emailEvents` 180 d, `apiUsage` 90 d, `auditLogs` 365 d, `oauthStates` 1 d, `backfills` / `jobRuns` 90 d, `snapshots` / `stageSnapshots` thinned to the last row of each UTC day after 180 d — nine new time indexes, periods shared with `/privacy` through `RETENTION_DAYS`. `@sentry/nextjs` feature-flagged on the DSN (server / edge / client instrumentation, no DSN → no init and no import, source maps only with `SENTRY_AUTH_TOKEN`, bodies / cookies / auth headers / token params scrubbed, EU ingest in the CSP). `src/app/error.tsx` + `global-error.tsx`, and public pages render `DegradedNotice` instead of crashing when Convex is unreachable (`publicData`). `GET /api/health` (no Convex read; `?deep=1` adds `public.stats` + `jobs.health` behind a 3 s timeout, always 200) is now the Railway health check. `.github/workflows/ci.yml` runs lint / typecheck / test / packages / build with placeholder Convex URLs and no secrets. A2 corrected to `better-auth` 1.6.22.
- ☑ **SHIP-1** — consolidation. Clean-state verification from `rm -rf .next` + `pnpm install --frozen-lockfile`: lint (0 errors), typecheck, **635 tests / 82 files**, `packages:build`, `packages:test` (**61 tests**: 9 protocol · 22 node · 30 better-auth), build; `PORT=3100 pnpm start` + `scripts/smoke.mjs` (adapted to the SEC-1 verification gate: sign-up → check-inbox → verify through the Better Auth component adapter → sign-in → onboarding → publish) and `scripts/cache-check.mjs` (16/16). New `scripts/shots-ship1.mjs` walks every launch surface signed-out and signed-in and writes `docs/screenshots/v1/ship/` at 375 / 768 / 1440. Doc drift fixed: 52 MCP tools in README / ARCHITECTURE / `server.test.ts`, the RSC read path in the ARCHITECTURE diagram (`publicQuery` / `cachedQuery`, not `fetchQuery`), the analytics catalog count, the README docs list. New `docs/RELEASE-v1.0.md` (what changed, deploy order, rollback, the `waitlist` branch, residual risks), `HUMAN_TODO.md` rewritten around one ordered launch checklist, `docs/ROADMAP.md` v1.0 section, `docs/CODECRAFT.md` model note. Not deployed, not pushed — by design.
- ☐ **`scripts/ui-shots.mjs` is stale** — it hardcodes `http://localhost:3000`, signs up without the SEC-1 verification step and walks a pre-v0.5 onboarding (no platform / stack screens), so it fails at the first step. Everything it covered is now in `scripts/shots-legal.mjs` / `shots-auth1.mjs` / `shots-ship1.mjs`; either fix it against the `shots-ship1` helpers or delete it. Not referenced from the README.
- ☐ **Zero lint warnings** — 7 unused-import / unused-variable warnings in `convex/` (all pre-dating the v1.0 loop) and one `@next/next/no-location-assign-relative-destination` in `src/components/app/settings/data-privacy.tsx` (the hard navigation after account deletion is deliberate — a client push races the app shell's sign-in redirect). Worth a sweep, not worth a release.
- ☐ **Move the two-phase accumulators to a scratch table** — `leaderboard.rerank`, `daily.benchmarks` and `daily.snapshotRankings` hold their projection in the action's memory, which is comfortable to roughly 50k projects (`daily.snapshotRankings` keeps whole rows and is the first to feel it).


## v1.0.1 — Post-loop review fixes

### Epic 96 — Review findings (P0)
- ☑ **FIX-0** — branch setup: `.codecraft-loop-*.md` gitignored, `landing-v2` fast-forwarded into `main` (brand tokens, `public.landing`, list-first homepage). Baseline on the merged tree green with no fixes needed — lint 0 errors, typecheck, 636 tests / 82 files, build.
