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
