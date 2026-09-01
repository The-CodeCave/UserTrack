# UserTrack MVP Backlog

Planned, implemented and reviewed in "Fable 5.1" mode (single model for decomposition, acceptance criteria, ordering, code, and review — changed from the original Fable-plans / Opus-executes split on request). Status legend: ☐ todo · ◐ in progress · ☑ done.

Vertical-slice ordering: each epic leaves the app in a usable state. The first four epics produce a deployable authenticated shell with the full visual identity; epics 5–9 make the core loop (create SaaS → connect → sync → chart → rank) work end to end; 10–13 make it shareable and shipped.

---

## Epic 1 — Foundation
| ID | Title | Acceptance criteria | Deps | Status |
|---|---|---|---|---|
| UT-101 | Bootstrap Next.js 16 App Router + TS + Tailwind 4 + shadcn/ui | `pnpm build` passes; `src/` layout; `components.json` present | – | ☑ |
| UT-102 | Convex project + Better Auth component | `npx convex dev --once` deploys; `BETTER_AUTH_SECRET`, `SITE_URL` set; `_generated` exists | 101 | ☑ |
| UT-103 | Railway project in CodeCave workspace | `railway status` shows `usertrack` | – | ☑ |
| UT-104 | Repo docs baseline: README, ARCHITECTURE, ASSUMPTIONS, BACKLOG, DEPLOYMENT | Files exist and reflect real state | – | ☑ |
| UT-105 | Code quality: eslint flat config, `pnpm typecheck`, `pnpm test` (vitest) scripts | All three commands pass in CI-like run | 101 | ☑ |

## Epic 2 — Visual system (blueprint / graphite / pink)
| ID | Title | Acceptance criteria | Deps | Status |
|---|---|---|---|---|
| UT-201 | Design tokens in `globals.css`: graphite bg (#0B0C0E), panel (#121316), line (white @ 12–18%), accent #FB0184, radii, mono label font | shadcn components render on-brand with no per-component overrides | 101 | ☑ |
| UT-202 | Typography: Geist Sans (UI) + Geist Mono (labels/stats) via `next/font` | Rendered in layout; `font-mono` used for metric labels | 201 | ☑ |
| UT-203 | Blueprint primitives: `<Grid/>` background, `<Panel/>` with corner ticks, `<MetricCard/>`, `<TrustBadge/>`, `<SectionLabel/>` | Storybook-free: visible on `/design` dev route | 201 | ☑ |
| UT-204 | Layout shells: public `SiteHeader`/`SiteFooter`, app `AppShell` (sidebar desktop / bottom-nav mobile) | Renders at 375px and 1440px without overflow | 203 | ☑ |
| UT-205 | Motion: reveal/trace animations via `motion` with reduced-motion respect | `prefers-reduced-motion` disables animation | 203 | ☐ |

## Epic 3 — Authentication
| ID | Title | Acceptance criteria | Deps | Status |
|---|---|---|---|---|
| UT-301 | Better Auth email+password wiring (client, server helpers, `/api/auth/[...all]`, provider) | Sign-up creates a user in Convex component tables | 102 | ☑ |
| UT-302 | `/sign-in`, `/sign-up` pages with validation + errors | Bad password shows inline error; success redirects to `/app` | 301, 204 | ☑ |
| UT-303 | Route protection via `proxy.ts` | Visiting `/app` logged-out → `/sign-in?next=/app`; logged-in `/sign-in` → `/app` | 301 | ☑ |
| UT-304 | Sign-out + session persistence | Reload keeps session; sign-out clears and redirects to `/` | 301 | ☑ |
| UT-305 | Forgot / reset password flow (dev sender logs link) | Request → token → new password works locally | 301 | ☑ |

## Epic 4 — Profiles
| ID | Title | Acceptance criteria | Deps | Status |
|---|---|---|---|---|
| UT-401 | `profiles` schema + `ensureProfile` on first authenticated load | Every authed user has exactly one profile | 102 | ☑ |
| UT-402 | Username rules: 3–24 chars `[a-z0-9-]`, unique, reserved list | Duplicate → friendly error; live availability check | 401 | ☑ |
| UT-403 | `/app/profile` edit form: name, username, avatar URL, bio, website/X/GitHub | Saves; validation errors inline | 402 | ☑ |
| UT-404 | Public `/u/[username]` page: header, links, SaaS grid with sparklines | 404 for unknown user; metadata set | 403, 803 | ☑ |

## Epic 5 — SaaS management
| ID | Title | Acceptance criteria | Deps | Status |
|---|---|---|---|---|
| UT-501 | `saas` schema (name, slug, logoUrl, tagline, websiteUrl, category, tags, ownerId, published, trust) | Indexes: by_slug, by_ownerId, by_published | 401 | ☑ |
| UT-502 | Create SaaS form + slug auto-generation + uniqueness | Creating "Acme App" → slug `acme-app`; collision → `acme-app-2` | 501 | ☑ |
| UT-503 | `/app/saas` list + `/app/saas/[id]` manage page (edit, publish toggle, delete) | Owner-only mutations; unauthorized → error | 502 | ☑ |
| UT-504 | Category select (fixed list) + free tags (≤5) | Displayed as chips on public page | 502 | ☑ |

## Epic 6 — Onboarding
| ID | Title | Acceptance criteria | Deps | Status |
|---|---|---|---|---|
| UT-601 | `/app/onboarding` 4-step wizard: Profile → SaaS → Connect → Publish | Progress rail; back/next; state persists across refresh via Convex | 403, 502, 703 | ☑ |
| UT-602 | Connect step validates the source live ("Test connection") and records first snapshot | Success shows the fetched number before continuing | 704 | ☑ |
| UT-603 | Success screen: confetti-free "trace" animation, share buttons, link to public page | Copy-link works; X share intent opens | 601 | ☑ |
| UT-604 | `/app` redirects to onboarding until profile + ≥1 SaaS exist | Fresh user lands in wizard automatically | 601 | ☑ |

## Epic 7 — Data source architecture
| ID | Title | Acceptance criteria | Deps | Status |
|---|---|---|---|---|
| UT-701 | `Provider` interface: `id, label, trust, configSchema, fetchTotalUsers(config, secret)` | Type-checked registry in `convex/providers/index.ts` | 102 | ☑ |
| UT-702 | `integrations` schema + mutations (`connect`, `disconnect`); secrets never leave server | Public queries strip `secret` | 701, 501 | ☑ |
| UT-703 | Providers: Clerk, Supabase (table count), Custom endpoint (domain-match verification), Manual | Unit tests for response parsing + trust resolution | 701 | ☑ |
| UT-704 | `testConnection` action returns `{ok, totalUsers}` or friendly error | Used by wizard and manage page | 703 | ☑ |

## Epic 8 — Snapshot & metrics engine
| ID | Title | Acceptance criteria | Deps | Status |
|---|---|---|---|---|
| UT-801 | `snapshots` (append-only), `dailyMetrics`, `saasMetrics`, `syncRuns` schemas | Indexes documented in ARCHITECTURE | 501 | ☑ |
| UT-802 | `recordSnapshot` mutation: insert → upsert daily → recompute materialized metrics | Unit tests on metric math (24h/7d/30d deltas, growth %) | 801 | ☑ |
| UT-803 | `public.series({slug, range})` bucketed series for 24H/7D/30D/90D/1Y/ALL | Returns ≤ 400 points for any range | 802 | ☑ |
| UT-804 | Cron every 4h → `sync.runAll` → `syncOne` per integration; manual "Sync now" rate-limited | `crons.ts` deployed; syncRuns rows created | 802, 704 | ☑ |
| UT-805 | Manual snapshot entry for `manual` provider (unverified) | Recorded with `trust: unverified` | 802 | ☑ |

## Epic 9 — Leaderboard
| ID | Title | Acceptance criteria | Deps | Status |
|---|---|---|---|---|
| UT-901 | `leaderboard.rerank` assigns rank by new30d among published + verified | Deterministic tiebreak by growth % then total | 802 | ☑ |
| UT-902 | `/leaderboard` page: rank, logo, name, total, +30d, growth %, sparkline, trust badge; period toggle 7D/30D/90D; "include unverified" toggle | Renders 50 rows < 1s; mobile card layout | 901, 203 | ☑ |
| UT-903 | Leaderboard OG image | `/leaderboard/opengraph-image` returns 1200×630 PNG | 902, 1101 | ☑ |

## Epic 10 — Public SaaS pages
| ID | Title | Acceptance criteria | Deps | Status |
|---|---|---|---|---|
| UT-1001 | `/s/[slug]`: hero (logo, name, tagline, trust, rank), metric cards, range-switchable chart, founder card, share CTA | 404 for unknown/unpublished; owner sees "manage" link | 803, 404 | ☑ |
| UT-1002 | `generateMetadata` with title/description/OG/Twitter card | Validated with a metadata debugger locally | 1001 | ☑ |
| UT-1003 | Share sheet: copy link, X intent, native share on mobile | Works at 375px | 1001 | ☑ |

## Epic 11 — OG images
| ID | Title | Acceptance criteria | Deps | Status |
|---|---|---|---|---|
| UT-1101 | Shared OG frame component (blueprint grid, wordmark, pink accent) for `next/og` | Renders under satori constraints (flex only) | 201 | ☑ |
| UT-1102 | `/s/[slug]/opengraph-image`: name, total, +30d, trust, sparkline | 1200×630, < 1s, cache headers | 1101, 803 | ☑ |
| UT-1103 | `/u/[username]/opengraph-image` | Shows avatar initial, name, SaaS count, total users | 1101 | ☑ |

## Epic 12 — Mobile polish & animation
| ID | Title | Acceptance criteria | Deps | Status |
|---|---|---|---|---|
| UT-1201 | Audit every route at 375/768/1440; fix overflow, touch targets ≥ 44px | Screenshots in PR/report | all | ☑ |
| UT-1202 | Loading (`loading.tsx`), empty and error states for app + public routes | No unstyled flashes | all | ☑ |
| UT-1203 | Chart polish: draw-in animation, crosshair tooltip, mobile touch | Works on iOS Safari sizes | 803 | ☑ |

## Epic 13 — Deployment & docs
| ID | Title | Acceptance criteria | Deps | Status |
|---|---|---|---|---|
| UT-1301 | Convex prod deployment + env; Next.js build runs `convex deploy --cmd` | Prod deployment URL live | 102 | ☑ |
| UT-1302 | Railway service, env vars, domain; `railway up` green | Public URL responds 200; auth works in prod | 1301 | ☐ |
| UT-1303 | Seed demo data (labelled) so leaderboard isn't empty | `internal.seed.run` idempotent | 802 | ☑ |
| UT-1304 | Final docs: README, DEPLOYMENT, ROADMAP, CHANGELOG | Future engineer can run locally in < 10 min | all | ☑ |
