# UserTrack

**Which SaaS products are gaining real users right now?**

UserTrack is a public growth and discovery platform for SaaS. Founders connect a read-only data source, UserTrack snapshots their user count every 4 hours, and every product gets a public growth page, trending score, milestones, share cards, an embeddable badge and a place on the leaderboards. Numbers are pulled from connected providers — never typed in.

**Live:** https://usertrack-production.up.railway.app · **API:** `/api/v1` ([docs](docs/API.md)) · **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## What it does

| Area | Features |
|---|---|
| **Verified data** | Clerk · Supabase · Firebase Auth · Auth0 · JSON endpoint (verified on own domain) · Manual (self-reported, never ranked). 30-day history backfill where the provider supports it. |
| **Activation** | Optional activation source (PostHog event, Supabase table, endpoint) → activated users 24h/7d/30d, activation rate, second chart series. |
| **Retention** | Estimated retained / churned / retention rate from providers that expose "active in 30 days" (Clerk, Auth0, endpoint). Labelled *estimated*; never fabricated. |
| **Traffic & revenue** | Plausible · GA4 · PostHog visitors/sessions; Stripe paying customers + MRR. Opt-in to display publicly. Funnel: Visitors → Signups → Activated → Paying. |
| **Ranking** | 30-day leaderboard, **Trending Score** (volume × growth × acceleration × trust × activation, documented in `convex/lib/trending.ts`), 7 boards × 24h/7d/30d × category × size × verification filters. |
| **Trust** | Trust score 0–100 + anomaly heuristics (impossible jumps, drops, reconnect churn, source switching, stale sources). Public labels: Verified · Partially verified · Data under review · Self-reported. Under-review products are unranked, never accused. |
| **Milestones** | 10 → 1M users, activated thresholds, biggest day/week, top 10 / top 100, best rank, streaks, +X% month, trending top 10. Persisted once; each has a share page + OG image. |
| **Sharing** | Share cards (`/s/[slug]/share/[kind]`) with 1200×630 PNGs, X/copy/download; SVG badges (`/api/badge/[slug].svg`) with copy-paste HTML/Markdown. |
| **Discovery** | `/discover` search (name, description, tags, category, founders), Trending Now, Fastest This Week, New, Hidden Gems, Top Dev Tools, Top AI, recent milestones. Category pages, `/trending`, `/fastest-growing-saas`, `/fastest-growing-ai-saas`, `/new-saas`, `/most-new-users`, `/compare`. |
| **Social** | Follow products and founders; `/app/following` feed; optional weekly digest (in-app + email). Profile links: website, X, GitHub, LinkedIn. |
| **Email** | Resend-backed, three categories: **transactional** (welcome + verification, password reset, source stopped syncing / recovered), **product nudges** (profile unfinished after 24h, product without source after 24h, first sync confirmed) and **growth** (user milestones 10→1M, Top 100/50/25/10/5/#1, spike ≥2.5× baseline, 7 quiet days, monthly report, weekly digest, followed-product updates). Per-user preferences at `/app/settings/notifications`, signed preference/unsubscribe links, one-click unsubscribe, delivery log with dedupe keys, bounce/complaint suppression. |
| **Benchmarks** | Daily deciles per group (all / category / size bucket), min sample 5. "Your 30-day growth is ahead of 82% of products your size." |
| **Public API** | `/api/v1/saas/{slug}`, `/history`, `/milestones`, `/api/v1/leaderboard`, `/api/v1/categories`. Stable DTOs, error envelope, 60 req/min/IP, CORS. |
| **SEO** | Server-rendered pages, canonical URLs, OG/Twitter metadata, JSON-LD on product pages, `sitemap.xml`, `robots.txt`, custom 404. |

## Stack
Next.js 16 (App Router, RSC) · React 19 · TypeScript · Tailwind 4 + shadcn/ui (Base UI) · Convex (DB, functions, crons, search, HTTP) · Better Auth via `@convex-dev/better-auth` · Recharts 3 · Motion · `next/og` · Railway.

## Run locally
```bash
pnpm install
npx convex dev            # creates .env.local, pushes functions, watches
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL http://localhost:3000
echo 'NEXT_PUBLIC_SITE_URL=http://localhost:3000' >> .env.local
npx convex run seed:run   # optional labelled demo data (never ranked)
pnpm dev                  # http://localhost:3000
```
Useful one-offs: `npx convex run leaderboard:rerank`, `npx convex run daily:run` (milestones, benchmarks, trust review, quiet-product check), `npx convex run digest:generate`, `npx convex run email/reports:generateMonthly`, `npx convex run seed:clear`.

### Email locally
Without `RESEND_API_KEY` nothing leaves the machine: every send is still evaluated (preferences, suppression, dedupe) and logged in the `emailEvents` table with `status: failed, error: "email not configured"`, so the whole pipeline is testable from the Convex dashboard. To really send, create a Resend key for `mail.usertrack.dev` and `npx convex env set RESEND_API_KEY re_…`. Templates are plain typed functions (`convex/email/templates`) — `pnpm test` renders every one; to eyeball them, `node scripts/email-preview.mjs` writes HTML files to `/tmp/ut-emails/`. `npx convex run email/testSend:run '{"to":"you@example.com","type":"welcome"}'` sends a real sample to one address.

## Scripts
| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | ESLint · `next typegen && tsc` · Vitest (115 tests: metrics, trending, trust, milestones, providers, API DTOs, badge, rate limit, email rules, templates, tokens, webhook signatures, and `convex-test` function tests for dedupe / preferences / lifecycle / milestones / reports) |
| `node scripts/email-preview.mjs` | Render every email template with sample data to `/tmp/ut-emails/*.html` |
| `pnpm convex:dev` · `pnpm convex:deploy` | Convex dev watch · deploy to prod |
| `node scripts/smoke.mjs [base] [mobile]` | E2E: sign-up → onboarding → publish → public page → dashboard (needs Chrome) |
| `node scripts/shot.mjs <url> <out.png> [w] [h] [full]` · `node scripts/console.mjs <urls…>` · `node scripts/og.mjs [base]` | Screenshot · console-error sweep · OG image download |

## Environment variables
| Where | Variable | Required | Purpose |
|---|---|---|---|
| Railway (Next.js) | `NEXT_PUBLIC_CONVEX_URL` | yes | Convex deployment URL |
| | `NEXT_PUBLIC_CONVEX_SITE_URL` | yes | Convex HTTP router (auth proxy) |
| | `NEXT_PUBLIC_SITE_URL` | yes | Public URL used in metadata, OG, badges, share links |
| Convex prod (`npx convex env set --prod`) | `BETTER_AUTH_SECRET` | yes | Auth secret |
| | `SITE_URL` | yes | Better Auth base URL / trusted origin, digest links |
| | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | Google sign-in (OAuth client, redirect URI `<SITE_URL>/api/auth/callback/google`) |
| | `RESEND_API_KEY` | for email | Resend sending key for `mail.usertrack.dev` (see `HUMAN_TODO.md`). Missing → emails logged, not sent |
| | `EMAIL_FROM` · `EMAIL_REPLY_TO` | no | Defaults `UserTrack <noreply@mail.usertrack.dev>` · `hello@usertrack.dev` |
| | `EMAIL_TOKEN_SECRET` | yes | Signs preference / unsubscribe links (falls back to `BETTER_AUTH_SECRET`) |
| | `RESEND_WEBHOOK_SECRET` | for delivery state | Svix signing secret of the Resend webhook → `<convex site url>/webhooks/resend` |

Provider credentials (Clerk keys, service accounts, Stripe restricted keys…) are entered by founders in the app and stored only in `integrations.config` on Convex; they are never returned by any query and never reach the browser.

## Layout
```
convex/                schema, auth (+ email hooks), profiles, saas, integrations, sync engine, trust, leaderboard/trending,
                       daily jobs (milestones, benchmarks), follows, digest, public queries, seed, crons
convex/email/          mailer: send (dedupe + prefs + Resend), templates, prefs + signed tokens, lifecycle,
                       growth (milestones/rank/spike/followers), reports (monthly), webhook, testSend
convex/providers/      provider adapters behind one interface (clerk, supabase, firebase, auth0, posthog,
                       plausible, ga4, stripe, endpoint, manual) + google service-account helper
convex/lib/            pure, unit-tested math: metrics, trending, trust, milestones, spikes, retention, benchmarks
src/app/(public)/      /, /leaderboard, /trending, /discover, /compare, /categories/*, SEO boards, /s/[slug] (+ share/[kind]),
                       /u/[username], /developers, opengraph-image routes
src/app/api/           /api/v1/* public API, /api/badge/[slug], /api/auth (+ /forgot-password, /reset-password pages)
src/app/app/           dashboard: overview, saas manage, following, digest, reports, profile, settings (+ notifications), onboarding
src/app/email/         /email/preferences — signed-link preference page (no login)
src/components/        blueprint primitives, charts (growth w/ annotations, compare), public cards, app forms
src/lib/               format, categories, providers-ui (setup instructions), share copy, API helpers, badge SVG
docs/                  ARCHITECTURE · API · BACKLOG · ASSUMPTIONS · DEPLOYMENT · ROADMAP · CHANGELOG
HUMAN_TODO.md          the only things left that need a human
```

## Trust model (short)
`verified` = synced from an auth provider or a JSON endpoint on the SaaS's own domain · `unverified` = manual / foreign endpoint, badged, never ranked · `pending` = no successful sync yet. On top of that a **trust score** (provider type, connection age, sync continuity, activation, open anomaly flags) drives the public label and excludes "Data under review" products from rankings until flags auto-resolve. Details in `docs/ARCHITECTURE.md`.
