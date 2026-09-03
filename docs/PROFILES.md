# Founder profiles

**TL;DR** — `/u/<username>` is a first-class public page: identity (avatar, name, @username, X handle, bio, links, location, joined), founder-level aggregates across the founder's *public* projects, an aggregate growth chart, a project grid and its own OG image / share card. Private projects never leak — not into the totals, not into the chart, not into the API.

## Routes

| Route | What |
|---|---|
| `/u/<username>` | Public profile (server-rendered, `force-dynamic`, JSON-LD `Person`, canonical, OG + Twitter card). Founders without public projects are `noindex` (no thin pages). |
| `/u/<username>/opengraph-image` | Social preview, rendered by the same founder-card renderer (90-day aggregate curve). |
| `/u/<username>/card?style=…&size=…&range=…` | Downloadable founder card PNG (see `docs/SHARING.md`). |
| `/api/v1/users/<username>` · `/api/v1/users/<username>/history` | Public JSON (`docs/API.md`). |
| `/app/profile` | Edit form (name, handle, bio, avatar URL, website, X, GitHub, LinkedIn, location). |
| `/app/settings/social` | X handle, connected account, tagging / promotion / auto-share preferences (`docs/SOCIAL.md`). |

Usernames are case-insensitive (`/u/Ada` resolves `ada`). `profiles.profilePublic = false` hides the page, search results, sitemap entry and API (404).

## Profile fields

`profiles`: `username`, `displayName`, `avatarUrl?`, `bio?` (≤160), `website?`, `x?` (canonical handle, no `@`), `github?`, `linkedin?`, `location?` (≤60), `profilePublic?` (default true), `xUserId?` / `xConnectedAt?` (set only by X OAuth), `socialPrefs?`, `followerCount?`, `_creationTime` → "Joined".

Only `username` and `displayName` are required. Onboarding asks for name, handle, optional avatar URL and optional X handle.

### X handle states

| State | Meaning | UI |
|---|---|---|
| `unavailable` | no handle | nothing shown |
| `handle_provided` | typed by the founder (`@name`, `name` or an x.com URL → canonical `name`) | `𝕏 @name` link, never a "verified" claim |
| `connected_via_oauth` | linked through X sign-in (`xUserId` set) | `𝕏 @name` + small `connected` chip |

## Aggregates (`convex/lib/founder.ts`)

All sums run over **public** projects only (`saas.isPublic`), after per-metric visibility has been applied (`publicSaas`), so a private converted count can never reach a profile.

| Metric | Formula |
|---|---|
| `totalUsers` | Σ `totalUsers` |
| `newUsers30d` / `newUsers7d` | Σ max(0, new users) |
| `growth30dPct` | `newUsers30d / (totalUsers − newUsers30d)` — growth of the combined user base |
| `changeVsPrev30dPct` | `(newUsers30d − Σ newUsersPrev30d) / Σ newUsersPrev30d`; **undefined** unless every project has a previous window |
| `activationRatePct` | **weighted**: Σ activated ÷ Σ users *of projects with an activation source* — never the mean of per-project rates. `activationProjects` says how many projects contribute |
| `convertedUsers` | Σ converted users, only over projects whose owner published the count; otherwise undefined |
| `bestRank` | min leaderboard rank |
| `trendingCount` | projects with a trending rank |
| `biggestGrowth` | project with the most new users in 30 days (undefined when nobody grew) |
| `projectCount` / `verifiedCount` | counts |

Averages of percentages are deliberately never computed.

## Aggregate history (`public.founderHistory`)

Per project, `dailyMetrics` rows in the range are loaded; the union of days is walked in order and each project is **forward-filled** from its last known total (a sync gap does not create a false dip); before a project's first row it contributes 0. `total` = Σ forward-filled totals, `delta` = Σ new users of the rows that exist that day, `byProject[]` = per-project totals in the order of `projects[]`. Ranges `7d · 30d · 90d · 1y · all` (24h maps to 7d — the aggregate is daily).

The chart (`src/components/charts/founder-growth.tsx`) offers Total / New and a per-project stacked breakdown. Cost: one indexed query per public project; founders have a handful of projects, so this is computed per request (no materialization yet, see `docs/ROADMAP.md`).

## Project grid

Each card: logo, name, trust badge, description, category, leaderboard rank, trending rank, users, 30-day sparkline, 30-day new users + growth %. Clickable to `/s/<slug>`.

## Search

`public.search` returns founders with `projectCount`, `totalUsers`, `newUsers30d` and the X handle; hidden profiles and the demo owner are excluded.

## Metadata

Title `"{Founder} — SaaS Founder on UserTrack"`, description `"{n} SaaS · {users} users · +{new} in the last 30 days. {bio}"`, canonical, `og:type=profile`, `twitter:card=summary_large_image`, JSON-LD `Person` with `sameAs` links.
