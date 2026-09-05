# Founder profiles

**TL;DR** — `/u/<username>` is a first-class public page: identity (avatar, name, @username, X handle, bio, links, location, joined), founder-level aggregates across the founder's *public* projects, an aggregate growth chart, a project grid and its own OG image / share card. Private projects never leak — not into the totals, not into the chart, not into the API.

## Routes

| Route | What |
|---|---|
| `/u/<username>` | Public profile (server-rendered, ISR `revalidate = 300`, JSON-LD `Person`, canonical, OG + Twitter card). Founders without public projects are `noindex` (no thin pages). |
| `/u/<username>/opengraph-image` | Social preview, rendered by the same founder-card renderer (90-day aggregate curve). |
| `/u/<username>/card?style=…&size=…&range=…` | Downloadable founder card PNG (see `docs/SHARING.md`). |
| `/api/v1/users/<username>` · `/api/v1/users/<username>/history` | Public JSON (`docs/API.md`). |
| `/app/profile` | Edit form (name, handle, bio, avatar URL, website, X, GitHub, LinkedIn, location). |
| `/app/settings/social` | X handle, connected account, tagging / promotion / auto-share preferences (`docs/SOCIAL.md`). |

Usernames are case-insensitive (`/u/Ada` resolves `ada`). `profiles.profilePublic = false` hides the page, search results, sitemap entry and API (404).

## Profile fields

`profiles`: `username`, `displayName`, `avatarUrl?`, `bio?` (≤160), `website?`, `x?` (canonical handle, no `@`), `github?`, `linkedin?`, `location?` (≤60), `profilePublic?` (default true), `xUserId?` / `xConnectedAt?` (set only by X OAuth), `xFollowers?` / `xFollowersAt?` (X follower count read from the founder's own token — Connect X or X sign-in — refreshed daily, see `docs/SOCIAL.md`), `socialPrefs?`, `followerCount?` (UserTrack followers), `feedSeenAt?` (last visit of `/app/following`, `docs/FOLLOWS.md`), `attribution?` (first-touch sign-up source `{ ref?, source?, medium?, campaign?, at }`, written once on insert, never public — `docs/ANALYTICS.md`), `_creationTime` → "Joined".

Only `username` and `displayName` are required. Onboarding asks for name, handle, optional avatar URL and optional X handle.

### X handle states

| State | Meaning | UI |
|---|---|---|
| `unavailable` | no handle | nothing shown |
| `handle_provided` | typed by the founder (`@name`, `name` or an x.com URL → canonical `name`) | `𝕏 @name` link, never a "verified" claim |
| `connected_via_oauth` | linked through X sign-in (`xUserId` set) | `𝕏 @name` + small `connected` chip |

### X follower count

`xFollowers` exists only when the founder proved ownership of the account (Connect X or X sign-in): it is read from `GET /2/users/me?user.fields=public_metrics` with the founder's own token — never looked up by handle. Shown as `𝕏 12.4k followers on X` in the header, `𝕏 12.4k` on the owner chip of leaderboard rows and the "Built by" block of `/s/<slug>`, and as `@name · 12.4k followers` on the founder OG image / share card. A typed handle shows nothing (Settings nudges "Connect X to show your follower count"). Anonymous projects drop the owner altogether, hidden profiles 404, so the count never leaks through them. API: `Profile.xFollowers?` / `xFollowersAt?`, `Saas.owner.xFollowers?`.

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

## Product profile (PROFILE-1)

**TL;DR** — `/app/saas/<id>#settings` lets a founder describe the product in detail: markets, tech stack, marketing channels, cofounders, company facts, product texts, anonymous mode, hide-from-Google and a logo upload. Everything is descriptive — **there are no revenue, MRR or profit fields, by design**. All fields are optional (`convex/schema.ts` → `saas`, no migration).

| Field | Limit / values | Where it comes from |
|---|---|---|
| `name` / `description` | ≤100 / ≤500 chars (raised from 60 / 160) | form, MCP |
| `markets[]` | 1–5 slugs from `MARKETS` (`src/lib/profile-options.ts`, aligned with `src/lib/categories.ts`) | chip multi-select |
| `techStack[]` | ≤20 entries: curated slugs from `src/lib/tech-stack.ts` (190+ entries with simple-icons slugs, also matched by label — `"Next.js"` → `nextjs`) or free text (`normalizeStackEntry`: lowercase token, 2–30 chars, no icon) | searchable chip select |
| `marketingChannels[]` | ≤15 slugs from `MARKETING_CHANNELS` | chip multi-select |
| `cofounders[]` | ≤5 × `{ name? ≤60, x?, github? }`; X handle canonicalised like the profile handle (`@`, x.com URLs stripped), GitHub URL → login; invalid handles are rejected. The **owner's** X handle is not stored here — it comes from the profile | "+ Add cofounder" rows |
| `country` | ISO 3166-1 alpha-2 from `src/lib/countries.ts` (flag derived from the code) | picker |
| `funding` · `teamSize` | `bootstrapped \| vc` · `1 \| 2-5 \| 6-10 \| 11-50 \| 50+` | two-button toggle with Clear · select |
| `foundedAt` | month precision (existing field) | month input |
| `valueProposition` · `problemSolved` · `audience` · `pricingSummary` · `additionalInfo` | ≤300 · ≤300 · ≤200 · ≤300 (pricing *model* in words, never numbers) · ≤500 | Product details card |
| `anonymous` | boolean | Additional settings |
| `hideFromSearch` | boolean | Additional settings |
| `logoStorageId` | Convex `_storage` id of an uploaded logo; `logoUrl` carries the served URL | Upload button |

Validation lives in `convex/domain/projects.ts` (`normalizeProjectInput` → `normalizeProfile`): unknown market / channel slugs are dropped, lists deduped and capped, texts trimmed and sliced, country codes checked, cofounder handles normalised. The same path serves the dashboard mutation (`saas.update`), the MCP tool (`usertrack_update_project`) and the seed. Every limited field shows a live `n/max` counter in the form; the browser enforces `maxLength`, the server slices again.

### Public page, boards and API

`/s/<slug>` gains an **About** panel (value proposition, problem, audience, pricing model, more), a **Company & stack** panel (country flag, funding, team size, founded, "Built with" chips linking to `/stacks/<slug>`, markets, growth channels) and cofounders with X / GitHub links under "Built by". Stack icons come from `https://cdn.simpleicons.org/<icon>` rendered as a CSS mask in the current text colour (`src/components/public/stack-chip.tsx`); the CSP `img-src https:` already allows the host.

- `/stacks/<slug>` — "SaaS built with Next.js": the board page filtered by a curated stack slug (in-memory filter like size / platform, no index), in the sitemap when at least one visible public product lists it. Free-text stack entries only work as `?stack=` on `/discover` and the boards (`public.board`, `public.boardMeta`, `public.discover` accept `stack`).
- REST `SaaS object` (`docs/API.md`): `anonymous`, `cofounders[]`, `markets[]`, `techStack[]`, `marketingChannels[]`, `company { country, funding, teamSize }`, `about { valueProposition, problemSolved, audience, pricingSummary, additionalInfo }` (`src/lib/api/dto.ts`, OpenAPI `Saas` schema).
- MCP `usertrack_update_project` accepts every field (`foundedAt` as `YYYY-MM`); `project_updated { fields }` is tracked from the form with the *names* of the changed fields.

### Anonymous mode — what is hidden

Enforced server-side in `convex/domain/visibility.ts` (`ANONYMOUS_HIDDEN`, `stripPrivate`, `publicLogo`) and `convex/public.ts` (`publicOwner`, `founderRows`), so every consumer — page, OG image, share cards, boards, feed, watchlists, frozen rankings, suggest, REST, MCP discovery — gets the same row.

| Hidden | Stays |
|---|---|
| owner (`owner: null` → no "Built by" link, no JSON-LD author, no founder line on share cards) | `name`, `description`, `category`, `tags` |
| `cofounders` | every metric, rank, trend, milestone, benchmark statement |
| `logoUrl` (page, cards, OG, feed, watchlists, `rankingSnapshots` rows written while anonymous) | `techStack`, `markets`, `marketingChannels`, `country`, `funding`, `teamSize`, `foundedAt`, About texts |
| `websiteUrl`, `appStoreUrl`, `playStoreUrl` (no outbound link, `SoftwareApplication.url` omitted) | boards, discovery, API listing, `anonymous: true` flag on the wire |
| the product on the founder's `/u/<username>` page, aggregates and founder history | the owner's dashboard (unchanged) |

The page shows an `anonymous` chip and an "An anonymous founder" card instead of the owner card. Anonymous mode does not hide the page itself — combine it with **Hide from Google** for that.

### Hide from Google

`hideFromSearch` adds `robots: noindex, follow` to `/s/<slug>` and `/s/<slug>/share/<kind>`, removes the product from `sitemap.xml` and from the `/stacks/*` sitemap counts. Boards, discovery, the founder page, the REST API and MCP still list it — the flag only speaks to search engines.

### Logo upload

`saas.generateLogoUploadUrl` (signed-in) → browser `POST`s the file to Convex storage → `saas.create` / `saas.update` receive `logoStorageId`, check the system row (≤1 MB, `image/png`, `image/jpeg`, `image/webp`; SVG is refused rather than sanitised) and store `logoUrl = ctx.storage.getUrl(id)`. A new upload deletes the previous file; pasting a URL or removing the logo deletes it too; project deletion (`removeProjectRows`) and account purge remove it. A refused upload cannot be deleted inside the failing mutation (the throw rolls the write back), so the form validates type + size before uploading. The form offers **Upload** / **Use URL** / **Remove** next to the current logo.

### Import from TrustMRR (IMPORT-1)

**TL;DR** — a founder pastes `trustmrr.com/startup/<slug>` (or the slug) on the new / edit project form, sees a diff-style preview and applies it; empty fields are filled, nothing is overwritten unless "Overwrite existing values" is ticked, nothing is saved until the form is submitted. Revenue is never read.

- **Key** — one operator key `TRUSTMRR_API_KEY` on the Convex deployment (`HUMAN_TODO.md`). Unset → button disabled ("Not configured"), MCP `not_configured`. `fixture` serves the documented example offline (dev only).
- **Parsing** — `parseTrustmrrRef` accepts full URLs (`/startup/` or `/startups/`, `www`, trailing slash, query) or `^[a-z0-9-]{1,80}$`.
- **Mapping** (`convex/lib/trustmrr.ts`, fixtures + tests next to it) — `name`, `description`, `website` → `websiteUrl`, `icon` → `logoUrl` (https only), `category` → our `category` and `markets` (aliases such as `design-tools → design`, `games → gaming`), `techStack[].slug` → curated tech slugs (label / slug / alias / `…js` match, unknown dropped and reported), `marketingChannels[].slug` → channel slugs (aliases, category fallback for `paid` / `community` / `partnerships` / `outbound`), `cofounders[] {xHandle, xName}` → `{ name, x }`, `country` (ISO-2), `startupInsights.fundingStatus` → `bootstrapped | vc`, `teamSize` buckets (`11-25 | 26-50 → 11-50`, `51+ → 50+`), `foundedDate` → month, `valueProposition`, `problemSolved`, `pricingModel` → `pricingSummary`, `targetPersona` (or B2B / B2C) → `audience`, `mobile-apps` / RevenueCat / Superwall → `projectType: mobile`. Everything money- or traction-related is ignored by construction.
- **Limits** — 5 imports per founder per 10 minutes and 10 per minute for the operator key (SEC-2 limiter); TrustMRR's 429 → "TrustMRR rate limit, try again in a minute"; 10 s timeout.
- **Stored** — only `saas.trustmrrSlug` (validated, cleared with "Unlink"); it renders a `nofollow` "Also on TrustMRR" link on `/s/[slug]` and is hidden in anonymous mode. Not part of the REST DTO.
- **MCP** — `usertrack_import_from_trustmrr { urlOrSlug, projectId? | slug?, apply?, overwrite? }` (docs/MCP.md).
- **Analytics** — `trustmrr_import_started` / `_succeeded {unmappedCount}` / `_failed {reason}`.

## Search

`public.search` returns founders with `projectCount`, `totalUsers`, `newUsers30d` and the X handle; hidden profiles and the demo owner are excluded.

## Metadata

Title `"{Founder} — SaaS Founder on UserTrack"`, description `"{n} SaaS · {users} users · +{new} in the last 30 days. {bio}"`, canonical, `og:type=profile`, `twitter:card=summary_large_image`, JSON-LD `Person` with `sameAs` links.
