# Assumptions Log

Decisions made autonomously during the CodeCraft loop. Each entry: what was assumed, why, and how to revisit.

| # | Assumption | Rationale | Revisit |
|---|-----------|-----------|---------|
| A1 | **Next.js 16 App Router** (not Vite/CRA). | Metadata API, `next/og` ImageResponse, RSC + Convex `fetchQuery` for SEO pages. | n/a |
| A2 | **Auth data lives inside Convex** via `@convex-dev/better-auth` component. | Single backend, no external Postgres, Better Auth remains the auth engine. Docs pin `better-auth ~1.6.x`; `better-auth` is **pinned to exactly 1.6.15**: 1.6.30 breaks `ConvexBetterAuthProvider`'s `AuthClient` typing (`useSession().data: never`). pnpm uses `node-linker=hoisted` (`.npmrc`) so only one copy of `better-auth` types exists. | If the component blocks, fall back to Better Auth + Railway Postgres and mirror user ids into Convex. |
| A3 | **Ranking formula** = verified net new users in trailing 30 days (`total_now − total_30d_ago`), tiebreak by 30d growth %. | Simple, explainable, growth-first, not size-first. | Could add a blended score later. |
| A4 | **Trust levels**: `verified` (auto-synced from a 3rd-party auth provider or a domain-matched endpoint), `unverified` (manual/self-reported or non-domain-matched endpoint), `pending` (connected, no successful sync yet). | Matches brief; keeps manual entry possible but never ranked as verified. | Add stronger verification (DNS TXT, OAuth) post-MVP. |
| A5 | **MVP providers**: Clerk (users/count API), Supabase (PostgREST exact count on a table), Custom JSON endpoint (`{"totalUsers": n}` with a per-SaaS bearer token; verified only when host matches SaaS website host), Manual (unverified). | Fetch-only, no native deps, covers most indie SaaS auth stacks. Extensible `Provider` interface. | Add Firebase, Auth0, Postgres read-only. |
| A6 | Provider secrets are stored in the `integrations` table and **never returned by any query**; only server actions read them. Convex encrypts at rest. | Pragmatic for MVP. | Add envelope encryption with a KMS-style key in env. |
| A7 | **Sync cadence**: Convex cron every 4h, plus an immediate sync on connect and a manual "Sync now" (rate-limited to 1/10min). | Brief asks for "multiple updates per day, default 4h". | Tunable constant. |
| A8 | **New users** = delta of total users between snapshots (we don't get per-user signup events from every provider). | Uniform across providers. | Providers with event APIs can later report true signups. |
| A9 | Charts use **Recharts 3** with custom styling. | Mature, responsive, SSR-safe, easy to skin to blueprint look. | n/a |
| A10 | **Password reset** shipped as UI + Better Auth `requestPasswordReset` wired to console-logging email sender in dev; real email provider (Resend) is a post-MVP env toggle. | No email provider credentials available; don't block MVP. | Set `RESEND_API_KEY` and swap sender. |
| A11 | Logos/avatars are **URLs** (with a hosted-upload option via Convex storage). | Fast; Convex storage is available if needed. | n/a |
| A12 | Railway hosts the **Next.js server only**; Convex is hosted by Convex Cloud (team `thecodecave`, project `usertrack`). | Standard Convex deployment model. | n/a |
| A13 | Public pages are **dynamic** (no ISR) and read Convex via `fetchQuery`; Convex caches queries so this is cheap. OG images are cached by CDN headers for 1h. | Simplicity + freshness. | Add `revalidate` if traffic demands. |
| A14 | Leaderboard reads a **materialized `saasMetrics` row per SaaS**, recomputed after every snapshot, never recomputed on page load. | Performance requirement from the brief. | n/a |
| A15 | Seed/demo data: a small seeded set of demo SaaS entries flagged `isDemo` is used so the public leaderboard and landing page are never empty on day one. Demo entries are labeled and excluded from ranking once ≥5 real verified SaaS exist. | Shareability requires the product to look alive. | Remove seed via `internal.seed.clear`. |
| A-loop | **Model orchestration**: Fable 5.1 handles PLAN, BUILD, VERIFY/REVIEW and REPAIR (originally Opus 5 was to execute tickets). | Explicit user instruction mid-loop. | n/a |
| A16 | Chart palette: single series drawn in white (#f4f4f5, 2px) with pink (#fb0184) for area wash, end-dot and "new users" bars. The dataviz validator flags white as a categorical hue (chroma 0) — not applicable, there is one series and identity is carried by the title. CVD ΔE 34.7 and contrast ≥ 3:1 pass. | Brand direction mandates white linework + pink accent. | Add a second hue only if multi-series charts are introduced. |

## v0.2 decisions

| # | Assumption | Rationale | Revisit |
|---|-----------|-----------|---------|
| A17 | **Labelled demo rows stay in production** (they were already there) but are excluded from ranks, trending ranks, benchmarks, milestone feeds and flagged `demo: true` in the API. Removal is a one-liner and listed as a human decision. | Brief forbids seeding fake growth to look active; these predate v0.2, are visibly labelled, and prevent an empty board. | `npx convex run --prod seed:clear` |
| A18 | **One integration per role** (users / activation / traffic / revenue) instead of unlimited sources per SaaS. | Covers every roadmap capability with a simple mental model; avoids conflicting user-count sources. | Multi-source merge if demand appears. |
| A19 | **Canonical new-user counts are snapshot deltas** (net), uniform across providers; provider-reported gross signups only fill windows the snapshot history cannot cover yet. | Comparable across providers; new connections get real 30-day numbers immediately. | Expose gross vs net explicitly. |
| A20 | **Retention is estimated** as `active30d − new30d` over the cohort that existed 30 days ago, and shown only when a provider exposes active users. | No connected provider exposes true cohorts; honest labelling beats fabricated precision. | Cohorts from per-user activity APIs. |
| A21 | **First snapshot never creates threshold milestones**; it is a baseline. | A product connecting with 12,000 users has not "just crossed" 10k. | – |
| A22 | Trending **volume term is `log10(1+new)^1.5`** after testing showed a 60→100 product beating a 100k product adding 4k/week with a plain log. 50-user floor on relative growth; < 5 new users = no signal. | Brief: tiny products must not dominate; momentum still matters. | Tune exponent with real data. |
| A23 | **Under-review products are unranked but keep their public page**, with neutral wording ("Data under review") and auto-resolving flags. | Do not accuse; do not let anomalies drive rankings. | Manual review UI. |
| A24 | Firebase/GA4 auth uses **WebCrypto RS256 in the default Convex runtime** (probed: works) — no Node runtime needed. | Keeps all providers in one runtime; no cold starts. | – |
| A25 | **Boards sort the public set in one query** rather than a materialized board table; ranks and trending scores are precomputed. | Public set is small; one indexed read + in-memory sort is faster than N table writes per cycle. | Materialize past a few thousand products. |
| A26 | Public **API rate limit is an in-process token bucket** (60/min/IP). | No Redis in the stack; single Railway replica. | Edge rules if scaled. |
| A27 | Digest email is **Resend over HTTP** (no SDK) and silently in-app-only until credentials exist. | Zero dependencies; nothing breaks without creds. | – |
| A28 | Traffic and revenue are **private by default** and only public with an explicit per-SaaS switch. | Brief: only expose if the owner enables it. | – |
| A29 | Stripe MRR ignores discounts, trials and tax; `active` subscriptions only; up to 2,500 subscriptions per sync. | Simple, conservative, documented in the adapter. | Include `trialing`, discounts. |
| A30 | **Categories are a fixed list** of 15 slugs (`src/lib/categories.ts`) used for pages, filters and benchmarks; free tags remain. | Stable SEO URLs and benchmark groups. | Add on demand. |
