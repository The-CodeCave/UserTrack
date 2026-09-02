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
