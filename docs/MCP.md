# UserTrack MCP server

UserTrack exposes its founder-side functionality (projects, data sources, metrics, share URLs) as a [Model Context Protocol](https://modelcontextprotocol.io) server. An AI coding agent running inside a SaaS repository can detect the stack, create the UserTrack project, connect a read-only data source, verify it, publish the growth page and report on it afterwards — without the founder touching the dashboard.

The MCP server, the dashboard and the public API all call the same domain layer (`convex/domain/*`), so an agent sees exactly what the founder sees.

## Endpoint

| | |
| --- | --- |
| URL | `https://usertrack.dev/mcp` (self-hosted: `${NEXT_PUBLIC_SITE_URL}/mcp`) |
| Transport | Streamable HTTP, **stateless** (no session id, no server-initiated streams) |
| Responses | JSON (`enableJsonResponse`), one server instance per request |
| Methods | `POST` JSON-RPC · `GET` discovery document (JSON) · `OPTIONS` CORS preflight |
| Server name / version | `usertrack` / `1.0.0` |

`GET /mcp` without `Accept: text/event-stream` returns a human/crawler-readable discovery document: name, endpoint, auth scheme, tool list and setup workflow. `GET` with an event-stream accept header and `DELETE` return `405` with a JSON-RPC error explaining that the server is stateless.

## Authentication

```
Authorization: Bearer ut_mcp_…
```

- Only **MCP tokens** (`ut_mcp_` prefix) are accepted. Public API keys (`ut_api_`) are rejected with `401`.
- A missing or malformed token returns `401` with a JSON-RPC error and a `WWW-Authenticate: Bearer realm="UserTrack MCP", error="invalid_token"` header.
- Revoked, expired or scope-less tokens pass the HTTP layer but every tool call returns a structured error (see [Errors](#errors)).

### Creating a token

1. Sign in and open `https://usertrack.dev/app/developer`.
2. **Create MCP token**, give it a name, pick scopes (all eleven by default), optionally an expiry (max 365 days).
3. Copy the secret; it is shown once. Only its SHA-256 hash is stored, plus the first 4 characters after the prefix (`ut_mcp_a8f3`) for identification.

Tokens created from the onboarding "Set up with AI" flow get the default scopes and expire after 7 days; the dashboard shows live setup progress derived from that token's audit trail. Up to 25 active tokens/keys per account. Revoke any time from the same page.

## Scopes

| Scope | Grants | Tools |
| --- | --- | --- |
| `profile:read` | Founder profile and account summary | `usertrack_get_account`, `usertrack_get_profile`, `usertrack_get_founder_url` |
| `profile:write` | Edit the founder profile, create share cards | `usertrack_update_profile`, `usertrack_create_share_card` |
| `projects:read` | List and inspect projects, integration state, verification | `usertrack_get_projects`, `usertrack_get_project` |
| `projects:write` | Create projects, edit metadata, publish. Never deletes. | `usertrack_create_project`, `usertrack_update_project` |
| `integrations:read` | Provider catalog, recommendations and setup instructions | `usertrack_get_supported_integrations`, `usertrack_get_integration_setup`, `usertrack_get_provider_recommendation`, `usertrack_get_activation_setup`, `usertrack_get_conversion_setup`, `usertrack_get_identity_mapping`, `usertrack_get_native_setup`, `usertrack_get_better_auth_setup` (deprecated alias) |
| `integrations:write` | Connect data sources, verify, trigger syncs | `usertrack_configure_integration`, `usertrack_verify_integration`, `usertrack_sync_project`, `usertrack_create_integration` |
| `metrics:read` | Metrics, history, ranks, milestones, funnel, trending, benchmarks, compare, share cards, embeds, share events, X drafts, discovery, datasets, rank + benchmark history | `usertrack_get_metrics`, `usertrack_get_growth_history`, `usertrack_get_rank`, `usertrack_get_milestones`, `usertrack_get_share_url`, `usertrack_get_funnel`, `usertrack_get_trending`, `usertrack_get_benchmark`, `usertrack_compare_projects`, `usertrack_get_share_card`, `usertrack_get_embed_code`, `usertrack_get_funnel_history`, `usertrack_get_cohorts`, `usertrack_get_share_events`, `usertrack_get_x_draft`, `usertrack_discover`, `usertrack_get_dataset`, `usertrack_get_rank_history`, `usertrack_get_benchmark_history` |
| `follows:read` **v0.9** | The founder's watchlist and personal feed | `usertrack_get_watchlist` |
| `follows:write` **v0.9** | Follow / unfollow products and founders | `usertrack_follow_project`, `usertrack_unfollow_project`, `usertrack_follow_founder`, `usertrack_unfollow_founder` |
| `webhooks:read` **v0.9** | Webhook endpoints (secrets masked), event catalog, delivery log | `usertrack_get_webhooks`, `usertrack_get_webhook_deliveries` |
| `webhooks:write` **v0.9** | Create, update, test and rotate webhook endpoints (new secrets returned once) | `usertrack_create_webhook`, `usertrack_update_webhook`, `usertrack_test_webhook` |

Recommendation: all eleven scopes for onboarding (the default). A reporting-only agent (weekly summaries, launch posts) needs `projects:read` + `metrics:read`; add `follows:*` for the watchlist and `webhooks:*` for notification setup. Public API keys (`ut_api_`) keep `metrics:read` only.

## Tools

50 tools: the 15 from v0.3, 8 added in v0.4 (marked **v0.4**), 4 added in v0.5 (marked **v0.5**: conversion setup, identity mapping, funnel history, cohorts), 2 added in v0.6 (marked **v0.6**: native credential creation + the Better Auth setup alias), 1 added in v0.7 (marked **v0.7**: `usertrack_get_native_setup` for every SDK source), 6 added in v0.8 (marked **v0.8**: founder profile, share events, share cards, X drafts, founder URL) and 14 added in v0.9 (marked **v0.9**: discovery, watchlist, rank + benchmark history, datasets, webhooks). Every tool takes a project reference `{ projectId?: string, slug?: string }` where noted (`ref`); either is accepted and ownership is enforced on both. All tools are annotated `idempotentHint: true`, `destructiveHint: false`, `readOnlyHint` per tool. Results are returned as JSON text plus `structuredContent`.

| Tool | Scope | Mode | Input | Output (summary) |
| --- | --- | --- | --- | --- |
| `usertrack_get_account` | `profile:read` | read | — | `profile` (username, display name, links, email, onboardingCompleted, url), `token` (name, prefix, scopes, createdAt), `projectCount`, `projects[]` (id, slug, name, isPublic, verification, totalUsers, url). Call first. |
| `usertrack_get_projects` | `projects:read` | read | — | Array of project summaries: metadata, `isPublic`, `verification {level,label,score}`, `metrics`, `ranks`, `lastSyncedAt`, `createdAt`, `urls`. |
| `usertrack_get_project` | `projects:read` | read | `ref` | Project summary + `urls` + `integrations[]` (role, provider, status, trust, lastError, timestamps, secret-free `publicConfig`) + `setup` (`hasUsersSource`, `usersSourceStatus`, `firstSyncDone`, `published`, `underReview`, `nextStep`). |
| `usertrack_create_project` | `projects:write` | write | `name`, `websiteUrl`, `description?`, `category?`, `tags?` (≤5), `logoUrl?`, `detectedStack?` | `created: true|false`, `project`, `recommendation` (best users source + optional extras), `warnings[]`. If the account already has a project for the same domain: `created: false`, `duplicateOf`, existing project. |
| `usertrack_update_project` | `projects:write` | write | `ref`, `name?`, `description?`, `websiteUrl?`, `category?`, `tags?`, `logoUrl?`, `newSlug?`, `isPublic?` | `updated[]` (changed fields), `project`. `isPublic: true` publishes and triggers a rerank. |
| `usertrack_get_supported_integrations` | `integrations:read` | read | `detectedProviders?[]`, `framework?` | `providers[]` (catalog of 11 providers incl. `postgres`: roles, trust, summary, detects, credential keys, permissions, reads, neverSent) + `recommendation` (`recommended`, `alternatives`, `optionalExtras`, `detected`, `reasoning`). |
| `usertrack_get_integration_setup` | `integrations:read` | read | `ref?`, `provider` (11 kinds incl. `postgres`), `role?`, `framework?`, `detectedProviders?[]` | Executable plan: `requirements[]` (where to find each credential, env var hints), `permissions`, `reads`, `steps[]` (`collect_credential` / `ask_user` / `modify_repo` / `deploy` / `call_tool` / `verify`), `securityRules`, `configShape`, `codeTemplates[]` (endpoint route per framework/ORM; `usertrack-readonly-role.sql` for `postgres` and for `supabase` when a Postgres driver was detected), `verification` call, `nextTool`. |
| `usertrack_configure_integration` | `integrations:write` | write | `ref`, `provider`, `role?` (default `users`), `config` | `integration` (secret-free view), `message`, `nextTool: usertrack_verify_integration`. Validates the config, encrypts secrets, starts the first sync. Replaces the existing source for that role. |
| `usertrack_verify_integration` | `integrations:write` | write | `ref`, `role?`, `provider?`, `config?` | `connected`, `status` (`connected` / `failed` / `missing` / `invalid_config`), `provider`, `role`, `mode` (`stored` / `inline`), `detected {count, metrics}`, `verificationLevel` (provider trust), `verificationLabel`, **`sourceVerification`** (`verified` / `partially_verified` / `self_reported`), **`capabilities`** (`totalUsers`, `createdUsers`, `historicalUsers`, `activationEvents`, `retention`, `traffic`, `trial`, `converted`, `identity`), `durationMs`, `stored`, `project`, `nextTool`, `hint`; on failure `error`, `retryable`, `missingRequirements`. Pass `provider` + `config` to test before saving. Database providers run in the Node runtime; errors are secret-free (`Host not found`, `Password authentication failed`, `Permission denied — grant SELECT…`). |
| `usertrack_sync_project` | `integrations:write` | write | `ref`, `role?` | `started` (number of sources), `message`, `nextTool`. |
| `usertrack_get_metrics` | `metrics:read` | read | `ref`, `timeframe?` (`24h` / `7d` default / `30d`) | `totalUsers`, `window` (new users vs previous window, `changeVsPreviousPct`, growth %, activated, trending score), `windows` (all three), `activated`, `retention`, `ranks` (+ movement, best), `verification`, `streakDays`, `lastSyncedAt`, `recentMilestones[]` (3). |
| `usertrack_get_growth_history` | `metrics:read` | read | `ref`, `range?` (`24h` `7d` `30d` default `90d` `1y` `all`) | `points[] { t, totalUsers, newUsers, activatedUsers?, visitors? }`. Snapshots for 24h/7d, daily rows otherwise. |
| `usertrack_get_rank` | `metrics:read` | read | `ref` | `eligible`, `reason` (why not ranked), leaderboard/trending positions with previous + movement, `best`, `boards` URLs, `trendingScore7d`. |
| `usertrack_get_milestones` | `metrics:read` | read | `ref`, `limit?` (1–50, default 20) | `milestones[] { id, key, kind, metric, value, title, copy, achievedAt, sharePage, shareImage }`. |
| `usertrack_get_share_url` | `metrics:read` | read | `ref` | `page`, `profile`, `badge`, `ogImage`, `api`, `share{users,growth,rank,trending,activation}`, `shareImages`, `milestoneShares[]`, `headline`, `nextSyncWithinMs`; `note` if not published. |
| `usertrack_get_provider_recommendation` **v0.4 / v0.5** | `integrations:read` | read | `detectedProviders?[]` (packages, env var names, e.g. `['@supabase/supabase-js', 'posthog-js', 'DATABASE_URL']`), `framework?`, `projectType?` (`web` / `mobile` / `hybrid`), `detectedAuth?[]`, `detectedAnalytics?[]`, `detectedPayments?[]` | The **lifecycle composition**: `recommended {role, provider, entry}` for the users source (Supabase → Clerk → Firebase → Auth0 → PostgreSQL → endpoint), `alternatives[]`, `optionalExtras[] {role: activation \| traffic \| conversion, provider, reason}`, `stages[]` that will be available, `authMethods[]` detected (Sign in with Apple, Google… — informational, never a user source), `detected[] {raw, provider}`, `reasoning[]`, `priority`, `signals`, `nextTool`. Mobile example: Firebase Auth + Sign in with Apple + PostHog + RevenueCat → Signed up: Firebase · Activated: PostHog · Trial / Converted: RevenueCat. Safe to call before a project exists. |
| `usertrack_get_activation_setup` **v0.4** | `integrations:read` | read | `ref?`, `detectedProviders?[]`, `candidateEvents?[]` (event names found in the repo) | `definition`, `examples[]` (`onboarding_completed`, `project_created`, …), `candidateEvents[] {event, looksLikeActivation}` (regex on complete/created/first/onboard/setup/run/sent/publish/deploy/invite), `project {id, slug, usersSource, activationSource}` when `ref` given, `recommended` + `options[] {provider, role: "activation", why, configShape}` in order PostHog (if detected) → Supabase (same connection) → PostgreSQL (same connection) → endpoint, `steps[]`, `optional: true`, `nextTool`. |
| `usertrack_get_funnel` **v0.4 / v0.5** | `metrics:read` | read | `ref`, `timeframe?` (`7d` / `30d` default / `90d`) | Owner funnel (every connected stage, including private ones): `timeframe`, `days`, `coverageDays`, `verification`, `basis: "aggregate"`, `identityQuality`, `stages[] {key: reached \| signed_up \| activated \| trial \| converted, label, value, previous, changePct, conversionPct, previousConversionPct, kind, source {provider, label, verification, updatedAt, status, trial, identity}, updatedAt, health: healthy \| attention \| stale}`, `rates[] {from, to, label, pct, previousPct, adjacent}`, `missingStages[]`, `hint` (connect activation / conversion), `visibility` (the owner's public keys) and `publicUrl`. |
| `usertrack_get_trending` **v0.4** | `metrics:read` | read | `ref?`, `window?` (`24h` / `7d` default / `30d`), `category?`, `limit?` (1–50, default 20) | Public trending board: `window`, `category`, `formula` (string), `rows[] {slug, name, category, totalUsers, newUsers, score, rank, previousRank, explain, url}`, `boardUrl`; with `ref`: `own` = the same row for the caller's project plus `eligible` and `factors {volume, growth, acceleration, trust, activation, freshness, history, signal}`. |
| `usertrack_get_benchmark` **v0.4** | `metrics:read` | read | `ref` | `eligible` (public + verified + not demo), `minCohortSize` (5), `cards[] {cohort, metric, metricLabel, value, percentile, median, p10, p90, medianMultiple, sampleSize, insight}` for the cohorts all / category / size bucket and the metrics `growth30dPct`, `newUsers30d`, `activationRatePct`, `growth7dPct`, `trendingScore7d` (only cohorts with a stored aggregate), `note` when not eligible or no data, `hiddenGemRules`. Private view; the public API exposes only the top-quarter statement. |
| `usertrack_compare_projects` **v0.4** | `metrics:read` | read | `slugs[]` (2–4, any public products), `days?` (`7` / `30` default / `90` / `365` / `0` = all) | `days`, `products[] {slug, name, category, totalUsers, newUsers7d, newUsers30d, growth30dPct, activationRatePct, trendingScore7d, trendingRank, rank, verification, windowGrowthPct, indexEnd, series[] {day, totalUsers, newUsers, index}, url}`, `url` (shareable `/compare?s=…&days=…`). `bad_request` below 2 slugs, `not_found` when fewer than two are public. Not owner-scoped: public data only. |
| `usertrack_get_share_card` **v0.4** | `metrics:read` | read | `ref`, `kind?` | `card {kind, page, image (1200×630), square (1080×1080), xIntent}` for `kind` (default `users`), `available[]` (`users`, `growth`, `week`, plus `rank` / `trending` / `activation` when backed by data), `milestones[]` (last 5 as `milestone-<id>` cards with `title`), `note` for drafts. `kind` may also be `milestone-<id>` or `spike-<id>`; anything else is `bad_request`. |
| `usertrack_get_conversion_setup` **v0.5** | `integrations:read` | read | `ref?`, `provider?` (`stripe` / `revenuecat` / `paddle` / `lemonsqueezy` / `chargebee` / `endpoint`; omitted → picked from `detectedProviders`, RevenueCat > Stripe > Paddle > Lemon Squeezy > Chargebee > endpoint), `detectedProviders?[]`, `projectType?` | `provider`, `definition` (what "converted" means: `active_paid` default, `ever_paid`, `first_payment`), `trialSupported`, `credential` (least-privilege **read-only** key, where to create it, permissions), `identityMatching` (`metadata.userId` / `app_user_id` / `custom_data.userId` …), `privacyRules` (no amounts, no customer PII, connection ≠ publication), `configShape`, `steps[]` and the exact `usertrack_configure_integration` / `usertrack_verify_integration` calls with `role: "conversion"`. Payment providers are read for conversion state only — never amounts. |
| `usertrack_get_identity_mapping` **v0.5** | `integrations:read` | read | `ref?`, `identitySource?`, `analyticsSource?`, `conversionSource?`, `projectType?` | `recommendedMapping` (one stable user id carried into `posthog.identify`, Stripe `metadata.userId`, RevenueCat `app_user_id`, Paddle `custom_data.userId`, Chargebee `meta_data.userId`…), `codeHints[]`, `hashing` (salted SHA-256 before storage), `qualityLevels` (`aggregate_only` / `partially_mapped` / `cohort_verified` + thresholds), `neverSend` (emails, names, phone numbers, amounts), `nextTool`. |
| `usertrack_get_funnel_history` **v0.5** | `metrics:read` | read | `ref`, `days?` (14–365, default 90) | `points[] {day, signupToActivatedPct?, signupToConvertedPct?, activatedToConvertedPct?, trialToConvertedPct?}` as trailing-7-day ratios. Graph-ready. |
| `usertrack_get_cohorts` **v0.5** | `metrics:read` | read | `ref` | `basis: "cohort"`, `identityQuality`, `label`, `explanation`, `coveragePct`, `cohorts[] {cohort (YYYY-MM), signedUp, activated, activationPct, activatedD7Pct, trial, trialPct, converted, convertedPct, convertedD30Pct, trialToConvertedPct, medianTimeToActivationMs, medianTimeToConversionMs, computedAt}`; `hint` when empty. |
| `usertrack_get_embed_code` **v0.4 · v0.7** | `metrics:read` | read | `ref`, `format?` (`badge` default / `widget`), `type?` (`users` default / `growth` / `trending` / `verified` / `chart`; widgets: no `trending`), `theme?` (badge: `dark` default / `light`; widget: `auto` default / `dark` / `light`), `window?` (`30d` default / `7d`), `compact?` (badge) | Badge: `imageUrl` (`/api/badge/<slug>.svg?type=…`), `html` (`<a><img height=28|120|96>`), `markdown`, `types[]`, `cache`. Widget: `script` (`<script async src=…/widget.js data-slug data-type …>`), `iframe`, `iframeSrc` (`/embed/<slug>?…`), `jsonUrl`, `width`, `height`, `types[]`, `themes[]`, `cache` (live, 5-minute refresh, auto theme, links back with `ref=embed`, embedding host counted). `note` for drafts. |

| `usertrack_get_native_setup` **v0.7** | `integrations:read` | read | `ref?`, `source?` (`better-auth` / `prisma` / `drizzle` / `convex` / `authjs` / `custom`; defaults to the project's existing integration or `better-auth`), `packageManager?` (`npm` / `pnpm` / `yarn` / `bun`, from the lockfile), `betterAuthVersion?`, `framework?`, `authConfigPath?` | Structured install plan for a native source: `package` (`@usertrack/better-auth` or `@usertrack/node`), `installCommand` (+ `installCommands` for all four managers), `files[]` (route file / plugin registration, optional push hook, `.env.example`), `configExample`, `notes` (adapter caveats: Convex count cap, Auth.js `createdAt`), `environmentVariables` (`USERTRACK_PROJECT_ID`, `USERTRACK_SECRET`), `codeModificationRules`, `whatIsSent`, `endpoint`, `supported` + `unsupportedReason` (better-auth < 1.3), `steps[]`, `verification`, `nextTool`; with `ref`: `project`, `integration` (state, `awaitingVerification`, `pluginVersion`). Never contains the secret. |
| `usertrack_get_better_auth_setup` **v0.6** | `integrations:read` | read | `ref?`, `packageManager?`, `betterAuthVersion?`, `framework?`, `authConfigPath?` | **Deprecated alias** of `usertrack_get_native_setup { source: "better-auth" }`; same output. |
| `usertrack_create_integration` **v0.6** | `integrations:write` | write | `ref`, `provider: "native"` (`"better_auth"` accepted as a deprecated alias of `native` + `source: "better-auth"`), `source?` (default `better-auth` for the alias, else `custom`), `url?` (Better Auth: base URL + basePath, default `<websiteUrl>/api/auth`; others: where the handler is mounted, default `<websiteUrl>/api/usertrack`, metrics at `<base>/metrics`; Convex: the `.convex.site` URL), `rotate?` | Creates the native integration and returns the credential **once**: `projectId`, `secret` (`ut_int_…`), `env` (ready-to-paste lines), `package`, `metricsUrl`, `integration` (secret-free view), `nextTool`. Idempotent: an existing native source returns `created: false, secret: null` (URL / source changes are patched; rotate with `rotate: true`, which invalidates the previous secret and re-keys attached activation / conversion rows). Activation and conversion reported by the same handler are attached automatically after the first sync. Audit action `create_integration` (prefix only, never the secret). |

| `usertrack_get_profile` **v0.8** | `profile:read` | read | — | `profile` (name, username, bio, links, canonical X handle, `xState`: `unavailable` · `handle_provided` · `connected_via_oauth`, location, `profilePublic`, `socialPrefs`), `aggregates` (Σ users, new users 7d / 30d, combined growth %, change vs previous 30d, **weighted** activation rate + contributing projects, published converted users, best rank, trending count, biggest-growth project), `projects[]`, `urls` (profile, card, api, settings), `formulas`. Public projects only. |
| `usertrack_update_profile` **v0.8** | `profile:write` | write | `displayName?`, `bio?` (≤160), `website?` (https), `x?` (`@name` / `name` / x.com URL → canonical), `github?`, `linkedin?`, `location?`, `avatarUrl?` (https), `profilePublic?` | `updated[]` + the same payload as `usertrack_get_profile`. Never touches the username or tokens. Audit `update_profile`. |
| `usertrack_get_share_events` **v0.8** | `metrics:read` | read | `ref?`, `status?` (`ready` default · `shared` · `dismissed`), `limit?` | `events[]` (strongest first: `score`, kind, category, title, detail, metric, value, rank, percentile, timeframe, `card {page, image, square}`, `draft {text, xIntent}`), `strongest` — the answer to "my best milestone this month". |
| `usertrack_create_share_card` **v0.8** | `profile:write` | write | `ref` or `shareEventId`, `kind?` (`users` · `growth` · `week` · `rank` · `trending` · `activation` · `conversion` (published only) · `benchmark` · `milestone-<id>` · `spike-<id>`), `style?` (`blueprint` · `aurora` · `minimal`), `size?` (`og` · `square`), `range?` (`7d` · `30d` · `90d` · `1y` · `all`), `chart?`, `logo?`, `founder?`, `verified?`, `dates?`, `title?` (≤60) | `config`, `card {page, image (PNG), square}`, `draft {text, xIntent}`, `verificationLine`, `styles`, `ranges`. Referencing a share event marks it `shared`. Drafts 404 until published. |
| `usertrack_get_x_draft` **v0.8** | `metrics:read` | read | `ref` + `kind?`, or `shareEventId` | `text` (≤280 incl. URL; says "verified" only for verified sources), `url`, `xIntent`. The agent hands the intent link back — it never posts on its own. |
| `usertrack_get_founder_url` **v0.8** | `profile:read` | read | — | `urls {profile, card, ogImage, api, history}`, `public`. |
| `usertrack_discover` **v0.9** | `metrics:read` | read | `category?`, `window?` (`24h` / `7d` default / `30d`) | Public discovery in one call: `sections {trending, fastestGrowing, newAndRising, hiddenGems, movers, mobile}` (compact rows: slug, name, category, verification, totalUsers, newUsers for the window, growth, rank + 7-day `movement`, trending rank + `trendingMovement`, url), `feed[]` (12 newest milestones / spikes / launches / verifications / rank jumps), `hiddenGemRules`, `newRisingRules`, `urls`. Not owner-scoped. |
| `usertrack_follow_project` **v0.9** | `follows:write` | write | `slug?` or `projectId?` | `{ following: true, created }` (idempotent — `created: false` when already followed), `target {type, id, slug, name, url}`, `watchlistUrl`. Only public projects can be followed (`not_found` otherwise). Audit `follow`. |
| `usertrack_unfollow_project` **v0.9** | `follows:write` | write | `slug?` or `projectId?` | `{ following: false, removed }`, `target`. Safe to repeat. Audit `unfollow`. |
| `usertrack_follow_founder` **v0.9** | `follows:write` | write | `username` (`jane` or `@jane`) | Same shape as `usertrack_follow_project` with `target.type: "profile"`. Every public project of the founder joins the watchlist (`via: "founder"`); `bad_request` when trying to follow yourself. |
| `usertrack_unfollow_founder` **v0.9** | `follows:write` | write | `username` | `{ following: false, removed }`. |
| `usertrack_get_watchlist` **v0.9** | `follows:read` | read | `days?` (1–90, default 30), `limit?` (1–200, default 60) | `saas[]` (followed products + public projects of followed founders: totals, 7d / 30d new users, growth, `rank`, `rank7dAgo`, `rankMovement7d`, `trendingRank`, `trendingMovement7d`, `via: direct \| founder`, `followed`, url), `founders[]`, `feed[]` (milestones, spikes, launches, verifications, rank jumps, `rank_change` ±5 places, `new_project` from followed founders), `urls.watchlist`, `note` when empty. |
| `usertrack_get_rank_history` **v0.9** | `metrics:read` | read | `ref`, `kind?` (`leaderboard` default / `trending`), `window?` (default `30d` / `7d`), `days?` (7–730, default 90) | Owner view (private projects allowed): `points[] {day, rank, score?}` one per UTC day from the append-only rank history, `current`, `best`, `rank7dAgo`, `movement7d`, `publicUrl` when published, `note` when unranked. |
| `usertrack_get_benchmark_history` **v0.9** | `metrics:read` | read | `ref`, `weeks?` (4–52, default 26) | Owner view: `history[] {week, day, computedAt, standings[] {cohort, metric, metricLabel, percentile, band, sampleSize, value, median}}` for every cohort / metric (not only top quarter), `changes[]` (the current cards' `changeInsight`, e.g. "Top 12% now, up from Top 27% last month"), `publicView` (whether standings are public), `note` when empty. |
| `usertrack_get_dataset` **v0.9** | `metrics:read` | read | `dataset` (`trending` / `fastest-growing` / `new-and-rising` / `hidden-gems` / `movers` / `category` / `rankings`), `category?`, `window?`, `platform?` (`web` / `mobile` / `hybrid`), `limit?` (≤100), `period?` (`YYYY-MM`, rankings), `board?` (rankings / category) | Board datasets: `rows[]` (position, slug, name, category, projectType, users, new users, growth, activation, ranks incl. `rank7dAgo` / `rankDelta7d`, trust, `verified`, lastSyncedAt, url), `board`, `window`, `updatedAt`, `methodology`, `urls {json, csv}` (the same dataset on the public API). `rankings` without `period`: `periods[]`; with `period`: the frozen ranking `rows[]`, `sampleSize`, `computedAt`, `url`. Public data only. |
| `usertrack_get_webhooks` **v0.9** | `webhooks:read` | read | — | `endpoints[] {id, url, description, events, saasId, status, disabledReason, secretMasked, consecutiveFailures, lastDeliveryAt, lastStatus, lastError, createdAt, updatedAt}`, `events[] {type, label, blurb}` (the catalog), `maxEndpoints` (10), `projects[]` (owned projects an endpoint can be scoped to), `docs`. Secrets are never returned. |
| `usertrack_create_webhook` **v0.9** | `webhooks:write` | write | `url` (public https), `events[]` (`milestone.reached`, `rank.changed`, `trending.rank_changed`, `growth.spike`, `integration.failed`, `integration.recovered`, `project.verified`), `description?`, `ref?` (scope to one project) | `endpoint`, **`secret`** (`whsec_…`, returned only here), `message`, `nextTool: usertrack_test_webhook`, catalog. Localhost / private / internal hosts, non-https URLs and empty event lists are `bad_request`; more than 10 endpoints is `bad_request`. Audit `create_webhook` (host + events, never the secret). |
| `usertrack_update_webhook` **v0.9** | `webhooks:write` | write | `endpointId`, `url?`, `events?`, `description?`, `status?` (`active` / `disabled` — re-enabling resets the failure counter), `projectId?` (id / slug, or `null` for all projects) | `updated[]`, `endpoint`. `bad_request` when nothing would change. Audit `update_webhook`. |
| `usertrack_test_webhook` **v0.9** | `webhooks:write` | write | `endpointId` | `deliveryId`, `eventId`, `nextTool: usertrack_get_webhook_deliveries`. Sends a signed `webhook.test` payload through the normal pipeline regardless of subscriptions. Audit `test_webhook`. |
| `usertrack_get_webhook_deliveries` **v0.9** | `webhooks:read` | read | `endpointId`, `limit?` (1–100, default 25), `failedOnly?` | `endpoint {id, url, status, consecutiveFailures}`, `deliveries[] {id, deliveryId, eventId, type, attempt, status: pending \| success \| failed \| exhausted, httpStatus, latencyMs, error, nextAttemptAt, createdAt, lastAttemptAt, deliveredAt}`. Response bodies are never stored. |

Rotation and deletion of endpoints are available through the gateway (`rotateWebhookSecretTool`, `deleteWebhookTool`, audit `rotate_webhook_secret` / `delete_webhook`) and the dashboard; they are deliberately not exposed as MCP tools so an agent cannot invalidate a secret or remove an endpoint without the founder.

### Discovery & watchlist flow

"What is trending in developer tools?" / "Follow the products I compete with": `usertrack_discover { category: "developer-tools" }` (or `usertrack_get_dataset { dataset: "hidden-gems" }` for full rows) → `usertrack_follow_project { slug }` / `usertrack_follow_founder { username }` (idempotent) → `usertrack_get_watchlist { days: 7 }` for movement and the personal feed. For the founder's own projects over time: `usertrack_get_rank_history` (daily positions, private projects included) and `usertrack_get_benchmark_history` (weekly standings + change insights).

### Webhook flow

"Notify my Slack when we hit a milestone": `usertrack_get_webhooks` (existing endpoints + the event catalog) → `usertrack_create_webhook { url, events, projectId? }` — the **secret is returned once**: hand it to the founder for their environment, never print or log it → `usertrack_test_webhook { endpointId }` → `usertrack_get_webhook_deliveries { endpointId }` to confirm `status: "success"` (or read `error` and fix the receiver). Endpoints must be public https URLs; every payload is signed (`UserTrack-Signature: v1=hex(HMAC-SHA256(secret, "<timestamp>.<body>"))`, see `docs/WEBHOOKS.md`) and retried five times over 14 hours.

### Share flow

"Create a share card for my strongest milestone this month": `usertrack_get_share_events` → pick `strongest` (or filter by project / month) → `usertrack_create_share_card { shareEventId, style, size, range }` → return `card.image` / `card.square` and `draft.xIntent`. `usertrack_get_x_draft` gives alternative wording. Founder identity: `usertrack_get_profile` / `usertrack_update_profile` / `usertrack_get_founder_url`.

### Prompt

`add_project_to_usertrack` — a single user message containing the agent prompt:

> Add this project to UserTrack. Detect the current authentication/user stack, choose the safest supported UserTrack integration, configure it, verify it, and return the public UserTrack URL.

`add_native_sdk_project_to_usertrack` **v0.7** — "Add this project to UserTrack with the native SDK": detect how the app stores users (Better Auth, Auth.js / NextAuth, Convex, Prisma, Drizzle, custom), `usertrack_create_integration { provider: "native", source }`, `usertrack_get_native_setup`, install `@usertrack/node` (or the Better Auth plugin), add the route file with a users count source (+ activation / conversion if the tables exist), env vars, typecheck, deploy, verify, sync, return the URL.

`add_better_auth_project_to_usertrack` **v0.6** — "Add this Better Auth project to UserTrack": create/find the project, `usertrack_create_integration`, install `@usertrack/better-auth` with the repo's package manager, append `userTrack()` to the existing plugins array without touching other auth options, add both env vars to `.env.example` and the local env (never commit the secret), typecheck, deploy, verify, sync, return the URL.

`add_mobile_app_to_usertrack` **v0.5** — the mobile variant ("Add this iOS / Android app to UserTrack"): detect the identity source (Firebase Auth, Supabase, Auth0, custom backend — **never** Sign in with Apple, which is an authentication method), the analytics SDK (PostHog, Firebase Analytics, Amplitude, Mixpanel) and the monetization SDK (RevenueCat, StoreKit, Google Play Billing, Stripe), create the project with `projectType: "mobile"`, then configure and verify each lifecycle source independently.

### Server instructions

The server sends instructions on `initialize` that describe UserTrack, the ordered 10-step setup workflow below, the mobile, native SDK, share, discovery & watchlist and webhook flows, and four rules: never print or log credentials; prefer verified providers over manual numbers; only aggregate counts are ever sent to UserTrack; ask the founder for any credential not found in the repo's env files.

## The agent-native setup flow

The workflow the server asks agents to run, in order (`SETUP_WORKFLOW` in `src/lib/mcp/tools.ts`):

1. `usertrack_get_account`
2. `usertrack_get_provider_recommendation` (pass `detectedProviders` + `framework` + `projectType` from the repo → the lifecycle composition: users source Supabase → Clerk → Firebase → Auth0 → PostgreSQL → endpoint, plus activation / reach / conversion sources)
3. `usertrack_create_project` (idempotent by domain)
4. `usertrack_get_integration_setup` (recommended provider)
5. edit the repo only if the instructions say so (endpoint provider)
6. `usertrack_configure_integration`
7. `usertrack_verify_integration` (wait ~5s, retry ≤3×)
8. `usertrack_update_project { isPublic: true }`
9. optional: `usertrack_get_activation_setup` → configure an activation source (PostHog event, Supabase/Postgres table) so the funnel shows activated users
10. optional: `usertrack_get_conversion_setup` → configure a conversion source (Stripe, RevenueCat, Paddle, Lemon Squeezy, Chargebee) with a read-only key so the funnel shows Trial / Converted users — conversion stays **private** until the founder switches the visibility keys on
11. optional: `usertrack_get_identity_mapping` → carry one stable user id across the sources so cohorts become *Cohort Verified*
12. `usertrack_get_share_url` → hand the public URL to the founder

What the agent does in the repository:

- Reads `package.json`, lock files and `.env*` names (not values it would print) to detect the auth/analytics stack: Clerk, Supabase, Firebase, Auth0, PostHog, Plausible, GA4, Stripe, a PostgreSQL driver or URL (`pg`, `postgres.js`, `DATABASE_URL`, `prisma:postgresql`, `drizzle-pg`, Neon, Vercel Postgres, …), or a generic database/auth library (Better Auth, NextAuth, Lucia, Convex, Prisma, Drizzle, Mongoose, …).
- Provider priority for the `users` role (`recommendIntegrations`): **native SDK → Supabase → Clerk → Firebase → Auth0 → PostgreSQL → JSON endpoint**; `manual` is never recommended. Native ranks first when the app owns its user store through Better Auth, Auth.js / NextAuth or Convex (`nativeSource` = `better-auth` / `authjs` / `convex`); ORM-only signals (Prisma, Drizzle, Lucia, Kysely, Mongoose … → `prisma` / `drizzle` / `custom`) rank after the hosted auth providers (read-only key, no code change) but before a raw database connection. The endpoint is the fallback when nothing is detected. `composition.users.source` / `nativeSource` carry the adapter; when the users source is native, activation and conversion are suggested from the same handler unless PostHog / a payment provider was detected.
- For **Supabase**, the preferred configuration is the database mode (session-pooler connection string with a `SELECT`-only role on `auth.users`); the service role key is the fallback. For **PostgreSQL**, the setup plan starts with a `modify_repo` step to create a read-only role from the `usertrack-readonly-role.sql` template and asks for a connection string with `sslmode=require`; the host must accept connections from the internet or via a pooler.
- For **native sources** the agent edits the repo: `usertrack_create_integration { provider: "native", source }` (secret returned once → local env + hosting env, never committed) → `usertrack_get_native_setup { source }` → Better Auth: install `@usertrack/better-auth` and append `userTrack({ projectId: process.env.USERTRACK_PROJECT_ID!, secret: process.env.USERTRACK_SECRET! })` to the existing `plugins` array; Prisma / Drizzle / Convex / Auth.js / custom: install `@usertrack/node` and add `app/api/usertrack/metrics/route.ts` exporting `createUserTrackHandler({ users, activation?, conversion? })` (Convex: an `httpAction` in `convex/http.ts`) — add both names to `.env.example`, typecheck, deploy → `usertrack_verify_integration` (404 = handler / plugin not deployed, 401 = env mismatch, both with hints) → `usertrack_sync_project`. Idempotent: re-running create returns the existing integration without a secret; verify marks a pending integration as connected and starts syncing; roles reported by the handler are attached automatically.
- For the **endpoint** provider only, the agent adds one read-only route (template provided per framework/ORM, e.g. `app/api/usertrack/route.ts`) that returns `{ "totalUsers": n }` behind a bearer token, adds `USERTRACK_ENDPOINT_TOKEN` to the environment, and asks the founder to deploy. The route is `verified` only when it lives on the product's domain.
- For every other provider it locates the credential (env var hints and dashboard paths are in the setup instructions), asks the founder if it is missing, and passes it straight into `usertrack_configure_integration`.
- **Activation (optional, step 9)**: `usertrack_get_activation_setup` explains what an activated user is, scores event names found in the repo (`candidateEvents`) and returns the configuration options — PostHog event (if detected), the same Supabase / Postgres connection with a table or one custom `SELECT count(...) WHERE … >= $1`, or the endpoint's `activatedUsers` keys — followed by the usual setup → configure → verify calls with `role: "activation"`. The verify result must be ≤ total users.
- **Conversion (optional, step 10)**: `usertrack_get_conversion_setup` returns the definition of "converted" (default *active paid*), the least-privilege read-only credential (Stripe restricted key with *Subscriptions: Read*; RevenueCat v2 secret key with *Charts & Metrics: Read* + project id; Paddle / Lemon Squeezy / Chargebee read-only API keys), the identity field to fill on the provider side and the configure + verify calls with `role: "conversion"`. UserTrack never needs amounts, prices or MRR — payment providers are used only to determine who converted, and the Conversion group is private by default (connection ≠ publication).
- **Mobile apps**: the identity source is Firebase Auth / Supabase / Auth0 / a custom backend, never Sign in with Apple or Google (those are recorded as `authMethods`). RevenueCat customers are never counted as registered users — RevenueCat owns Trial / Converted only.
- Other optional extras suggested by the recommendation: Plausible / GA4 / PostHog for reach (traffic stays private unless the founder opts in).

Security rules attached to every setup plan: least-privilege credentials only; credentials never printed, logged, committed or pasted into chat; only aggregate counts are sent; no changes to auth, billing or database code beyond the optional count endpoint (and the read-only database role); never guess or create credentials without telling the founder.

## Client configuration

Replace `ut_mcp_…` with your token.

**Claude Code** (run inside the SaaS repository, then start `claude`):

```bash
claude mcp add --transport http usertrack https://usertrack.dev/mcp --header "Authorization: Bearer ut_mcp_…"
```

**Cursor** (`.cursor/mcp.json` in the repository, or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "usertrack": {
      "url": "https://usertrack.dev/mcp",
      "headers": { "Authorization": "Bearer ut_mcp_…" }
    }
  }
}
```

**Codex CLI** (reads the token from the environment):

```bash
codex mcp add usertrack --url https://usertrack.dev/mcp --bearer-token-env-var USERTRACK_MCP_TOKEN
export USERTRACK_MCP_TOKEN=ut_mcp_…
```

**VS Code / Copilot** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "usertrack": {
      "type": "http",
      "url": "https://usertrack.dev/mcp",
      "headers": { "Authorization": "Bearer ut_mcp_…" }
    }
  }
}
```

**Any MCP client:** Streamable HTTP transport at `https://usertrack.dev/mcp`, token as a Bearer header. The same snippets, with the token filled in, are shown on `/app/developer` right after a token is created.

## Example conversations

**Onboarding**

> Add this project to UserTrack. Detect the current authentication/user stack, choose the safest supported UserTrack integration, configure it, verify it, and return the public UserTrack URL.

`add_mobile_app_to_usertrack` **v0.5** — the mobile variant ("Add this iOS / Android app to UserTrack"): detect the identity source (Firebase Auth, Supabase, Auth0, custom backend — **never** Sign in with Apple, which is an authentication method), the analytics SDK (PostHog, Firebase Analytics, Amplitude, Mixpanel) and the monetization SDK (RevenueCat, StoreKit, Google Play Billing, Stripe), create the project with `projectType: "mobile"`, then configure and verify each lifecycle source independently.

Agent: `get_account` → `get_provider_recommendation { detectedProviders: ["@clerk/nextjs", "posthog-js"], framework: "nextjs" }` → `create_project { name, websiteUrl, detectedStack }` → `get_integration_setup { provider: "clerk" }` → finds `CLERK_SECRET_KEY` in `.env.local` → `configure_integration { provider: "clerk", config: { secretKey } }` → waits 5 s → `verify_integration` → `update_project { isPublic: true }` → `get_activation_setup { slug, candidateEvents: ["project_created", "page_viewed"] }` → `configure_integration { provider: "posthog", role: "activation", config: { …, activationEvent: "project_created" } }` → `get_share_url` → "Your page is live at https://usertrack.dev/s/acme, activation is tracked from PostHog's `project_created`."

**Postgres-only repo**

> Add this project to UserTrack.

Agent: `get_provider_recommendation { detectedProviders: ["DATABASE_URL", "drizzle-orm", "pg"] }` → recommended `postgres` → `get_integration_setup { provider: "postgres" }` → shows the founder the `usertrack-readonly-role.sql` template and asks for a read-only connection string → `verify_integration { provider: "postgres", config: { connectionString, tableRef: "public.users", createdAtColumn: "created_at" } }` (inline test) → `configure_integration` → `update_project { isPublic: true }`.

**Weekly report**

> How did my SaaS perform this week?

Agent: `get_projects` → `get_metrics { slug: "acme", timeframe: "7d" }` → `get_funnel { slug: "acme", timeframe: "7d" }` → `get_trending { slug: "acme" }` → "312 new users this week vs 241 last week (+29%), 38% of them activated, moved from #6 to #4 on the leaderboard, #9 trending (2.1× prev period, short history)."

**Launch post**

> Write a post about my biggest milestone.

Agent: `get_milestones { slug: "acme", limit: 10 }` → picks the largest `users` threshold → `get_share_card { slug: "acme", kind: "milestone-<id>" }` → drafts the post with the milestone copy and attaches `card.image` (or `card.square` for Instagram/LinkedIn) and `card.xIntent`.

**README badge**

> Add a UserTrack badge to the README.

Agent: `get_embed_code { slug: "acme", type: "chart", theme: "light" }` → pastes `markdown` into `README.md`.

**Benchmark check**

> How do we compare with similar products?

Agent: `get_benchmark { slug: "acme" }` → reads `cards[].insight` ("Your 30-day growth is ahead of 80% of products with 1K – 10K users. Top 20%.") → optionally `compare_projects { slugs: ["acme", "rival"], days: 90 }` for a shareable `/compare` link → `get_benchmark_history { slug: "acme", weeks: 12 }` for "Top 12% now, up from Top 27% last month".

**Watchlist**

> Follow the fastest-growing AI products and tell me what moved this week.

Agent: `discover { category: "ai", window: "7d" }` → `follow_project { slug }` for each of the top rows (idempotent) → `get_watchlist { days: 7 }` → "You follow 6 products; Promptly climbed 13 places (#51 → #38), Globex entered the trending top 10, one new project from Jane."

**Webhook**

> Ping Slack when we hit a milestone.

Agent: `get_webhooks` → `create_webhook { url: "https://hooks.example.com/usertrack", events: ["milestone.reached", "rank.changed"], slug: "acme" }` → gives the founder the secret for their receiver (never logs it) → `test_webhook { endpointId }` → `get_webhook_deliveries { endpointId }` → "Endpoint active, test delivered (HTTP 200, 142 ms)."

## Idempotency

| Operation | Behaviour on repeat |
| --- | --- |
| `usertrack_create_project` | Same owner + same canonical domain (lowercased, `www.` stripped) returns the existing project with `created: false` and `duplicateOf`. No duplicates from retries. |
| `usertrack_configure_integration` | Replaces the source for that role. Historical snapshots are kept. |
| `usertrack_update_project` | Partial patch; unchanged fields are not touched. `bad_request` if nothing would change. |
| `usertrack_verify_integration` | Read-only against the provider; safe to repeat after the cooldown. |
| `usertrack_follow_*` / `usertrack_unfollow_*` | Already followed → `created: false`; not followed → `removed: false`. Never duplicates a follow. |
| `usertrack_create_webhook` | Creates a new endpoint every time (up to 10); check `usertrack_get_webhooks` first. `usertrack_test_webhook` queues one delivery per call. |
| Read tools | Pure reads. |

## Rate limits

Reads are generous, writes are conservative.

| Limit | Value | Error |
| --- | --- | --- |
| Daily quota | 5,000 tool calls per token per UTC day (counted per tool name) | `rate_limited`, `retryAfterSec` until midnight UTC |
| Burst | 60 tool calls per minute per token (in-process bucket) | `rate_limited` |
| Create project | ≤ 10 new projects per hour per token (duplicates returned via idempotency do not count) | `rate_limited`, `retryAfterSec: 3600` |
| Verify | 20 s cooldown per project | `rate_limited`, remaining seconds |
| Sync now | 60 s cooldown per data source | `rate_limited`, remaining seconds |

Rate-limit results include a hint telling the agent to wait and not to loop.

## Errors

Tool failures are returned as tool results with `isError: true`, so the agent can read them without the transport failing:

```json
{
  "error": {
    "code": "forbidden",
    "message": "This token is missing the integrations:write scope",
    "requiredScope": "integrations:write",
    "scopes": ["projects:read", "metrics:read"],
    "hint": "Ask the founder for a token with the integrations:write scope (UserTrack → Developer → MCP tokens)."
  }
}
```

| `code` | Meaning | Hint given to the agent |
| --- | --- | --- |
| `unauthorized` | Token unknown, wrong type, or gateway secret missing / mismatched (`UT_GATEWAY_SECRET` must be set identically on Railway and Convex) | Create a new MCP token and update the config; operators: check the env var on both sides |
| `revoked` | Token was revoked | same |
| `expired` | Token passed its expiry | same |
| `forbidden` | Missing scope (`requiredScope` is set) | Ask for a token with that scope |
| `rate_limited` | Quota, burst or cooldown (`retryAfterSec` is set) | Wait, do not loop |
| `not_found` | Project not found or not owned by this token | Call `usertrack_get_projects` |
| `bad_request` | Invalid input (unknown provider/role, invalid config, unknown category, nothing to update) | — |
| `conflict` | No free slug could be found | — |
| `internal` | Unexpected failure | — |

## Security model

- **Hashed tokens.** Secrets are 40 random base62 characters after the prefix (≈238 bits); only the SHA-256 hash is stored and looked up. Shown once at creation.
- **Scopes.** Every tool declares one scope; the gateway checks it on every call.
- **Ownership.** Every project reference (id or slug) is resolved and checked against the token owner. Ids alone are never trusted.
- **No deletion.** No tool deletes a project, an integration or a token.
- **Secrets never returned.** Provider credentials are validated, stored server-side and exposed only as a masked `publicConfig`. Tool results, audit entries and the dashboard never contain them. (They are stored as plain values in Convex — no application-level encryption yet, see `docs/BACKLOG.md`.)
- **Gateway secret.** Next.js sends `UT_GATEWAY_SECRET` with every backend call; the Convex gateway (`convex/lib/gateway.ts`, `requireGateway`) compares it in constant time and **fails closed** — a missing or different value on either side rejects the call with `unauthorized` — so token hashes cannot be replayed against the backend directly.
- **Aggregate data only.** Providers are read with count-only endpoints; no emails, names, sessions or per-user rows.

## Audit logging

Every token-authenticated write (`create_project`, `update_project`, `configure_integration`, `verify_integration`, `sync_project`, `create_integration`, `update_profile`, `follow`, `unfollow`, `create_webhook`, `update_webhook`, `rotate_webhook_secret`, `delete_webhook`, `test_webhook`) and every token lifecycle event (`mcp_token_created`, `api_key_created`, `token_revoked`) is recorded with the token, project, outcome and a short detail string. The developer page shows the last 50 entries; the onboarding page uses the same trail to render live setup progress ("Agent connected → Project created → Connecting clerk → Verifying data → First sync complete → Published"). Reads are counted in per-day usage buckets but not logged individually.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| HTTP `401` on every request | No `Authorization` header, token not starting with `ut_mcp_`, or an API key used for MCP | Create an MCP token at `/app/developer`; check the header reaches the server (some clients need the header in `headers`, Codex needs the env var) |
| Tool error `unauthorized` / `revoked` / `expired` | Token deleted, revoked or past expiry (onboarding tokens: 7 days) | Create a new token, update the client config, restart the client |
| Tool error `forbidden` | Token created with a subset of scopes | Create a token with the scope named in `requiredScope` |
| Tool error `rate_limited` | Burst, daily quota, project-creation cap or a verify/sync cooldown | Wait `retryAfterSec`; agents should not retry in a loop |
| Tool error `not_found` | Wrong slug/id, or the project belongs to another account | `usertrack_get_projects` |
| `verify_integration` returns `status: "failed"` with `retryable: false` | Wrong credential or insufficient permissions | Re-read `requirements`/`permissions` from `usertrack_get_integration_setup`, reconfigure |
| `verify_integration` returns `verificationLevel: "unverified"` for an endpoint | The endpoint host differs from the product domain | Host the route on the product domain; otherwise the project is labelled self-reported and never ranked |
| `verify_integration` fails for `postgres` / Supabase database mode with "Connection timed out" or "Connection refused" | The database is not reachable from the internet, or the port is wrong | Use the provider's pooler / allow inbound connections; the error is `retryable: true` only for timeouts |
| `verify_integration` fails with "Permission denied — grant SELECT…" or "Query tried to write" | The role cannot read the table, or the custom SQL is not a plain SELECT | Run the `usertrack-readonly-role.sql` template; keep custom SQL to one `SELECT` with `$1` |
| `capabilities.createdUsers` is `false` after verifying a database source | No timestamp column was mapped | Pass `createdAtColumn` (and `createdAtKind` for epoch columns); otherwise windows come from snapshot deltas and there is no history backfill |
| Public URL 404s | Project not published | `usertrack_update_project { isPublic: true }` |
| Client tries to open an SSE stream and fails | Server is stateless | Use a client that supports Streamable HTTP with JSON responses; the discovery document at `GET /mcp` confirms the transport |

## FAQ

**Does the agent need write access to my repo?** Only for the JSON-endpoint provider, where it adds one read-only route. For Clerk, Supabase, Firebase, Auth0, PostgreSQL and the analytics providers it only reads env var names to locate credentials (PostgreSQL additionally needs a read-only database role, created by the founder from the SQL template).

**Does UserTrack ever read rows from my database?** No. The PostgreSQL / Supabase database mode runs `count(*)`, per-day counts and catalog listings in a session forced to read-only (`default_transaction_read_only = on`); connection strings are stored server-side and never returned to the dashboard, the API or an agent.

**Can an agent delete my project?** No. There is no delete tool. `update_project` can unpublish (`isPublic: false`) but never removes data.

**What if the agent runs the setup twice?** `create_project` returns the existing project for the same domain; `configure_integration` replaces the source for that role. Nothing is duplicated.

**Can I use the same token in several agents?** Yes, but one token per agent or machine makes revocation and the audit trail cleaner.

**Does the MCP server return public data for other products?** Only what the website shows to everyone: `usertrack_get_trending`, `usertrack_compare_projects`, `usertrack_discover` and `usertrack_get_dataset` read the public projection (visibility applied). Every owner-scoped tool (metrics, history, rank / benchmark history, funnel, webhooks…) is limited to projects owned by the token. Use the public API (`docs/API.md`) for bulk reads and CSV downloads.

**Is there OAuth?** Not yet; bearer tokens created in the dashboard are the only auth method today. OAuth for MCP clients is on the roadmap.

**Where is the source?** `src/app/mcp/route.ts` (HTTP adapter), `src/lib/mcp/server.ts` (server + per-request transport), `src/lib/mcp/tools.ts` (tool definitions and `SETUP_WORKFLOW`), `convex/gateway.ts` (auth, scopes, quotas, audit, all tool backends), `convex/lib/integrationSetup.ts` (catalog, recommendation order and setup plans), `convex/domain/funnel.ts`, `convex/lib/trending.ts`, `convex/lib/benchmarks.ts` (the numbers behind the v0.4 tools).
