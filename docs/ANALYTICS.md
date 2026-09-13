# Analytics (Rybbit)

**TL;DR** — UserTrack tracks product usage with a self-hosted, cookieless [Rybbit](https://rybbit.com) instance (`https://rybbit.internal.thecodecave.de`, site `753f44fa9c50`). No consent banner: no cookies, no session replay, IP hashed daily. The browser sends page views + a **typed event catalog** (`src/lib/analytics.ts`), route handlers and Convex actions send a handful of **server-side events** (`/api/track`), signed-in founders are linked by their **pseudonymous Better Auth id** (never an email). Goals and funnels are created via Rybbit's API — the table at the end lists what exists.

## How it is wired

| Piece | Where | Notes |
|---|---|---|
| Tracker script | `src/components/analytics/analytics.tsx` → `<AnalyticsScript/>` in `src/app/layout.tsx` | `next/script` (`afterInteractive`), `data-site-id`, `data-skip-patterns='["/api/**","/embed/**","/mcp"]'`, `data-mask-patterns='["/email/preferences*","/reset-password*"]'` (tokens never reach analytics); `/api/**` also covers Railway's `/api/health` poll. Rendered only when `ANALYTICS_ENABLED` (site id non-empty and `NODE_ENV !== "test"`). Since FIX-1 the site id is **not** defaulted outside production `usertrack.dev` — see the env table. |
| Identity | `<AnalyticsIdentity/>` (same file, inside the Convex/Better Auth provider) | `authClient.useSession()` → `identify(user.id)`; `reset()` (→ `clearUserId`) once the session is gone. Calls made before the script loads are replayed from `onLoad`. No traits are ever sent. |
| Client SDK | `src/lib/analytics.ts` | `track(event, props)` — typed against `Events`, no-op without `window.rybbit`, booleans → `"true"`/`"false"`, `undefined` dropped. `EVENTS` is the catalog as a value. `CtaLink`, `TrackedA`, `TrackOnMount` let server components attach tracking to links / page views. |
| Server events (Next) | `src/lib/analytics-server.ts` → `serverTrack(req, event, props)` | Queued with `after()` (runs once the response is sent), `POST {host}/api/track` with `type: "custom_event"`, `hostname: SITE_HOST`, the request **path only** (no query string, no headers, no IP forwarded), `properties` as a JSON string, 2 s timeout, never throws. `RYBBIT_API_KEY` (optional) is sent as `Authorization: Bearer` — with it Rybbit skips bot detection and domain validation for server calls. |
| Server events (Convex) | `convex/lib/analytics.ts` → `trackEvent(event, props)` | Same payload, `pathname: "/_convex"`. **Opt-in per deployment**: silent until `RYBBIT_SITE_ID` is set (`RYBBIT_HOST`, `RYBBIT_API_KEY` optional), so the dev deployment never pollutes production numbers. |
| CSP | `next.config.ts` | `script-src` / `connect-src` include `NEXT_PUBLIC_RYBBIT_HOST`. |
| Privacy policy | `/privacy#analytics` | Describes exactly what is enabled: cookieless, no replay, events, web vitals, errors, masked paths, pseudonymous id in local storage while signed in, `localStorage.setItem("disable-rybbit", "1")` opt-out. |

### Environment

| Variable | Where | Default | Effect |
|---|---|---|---|
| `NEXT_PUBLIC_RYBBIT_HOST` | Next.js | `https://rybbit.internal.thecodecave.de` | Script origin, `/api/track` target, CSP entry |
| `NEXT_PUBLIC_RYBBIT_SITE_ID` | Next.js | `753f44fa9c50` **only when** `NODE_ENV=production` **and** `NEXT_PUBLIC_SITE_URL` starts with `https://usertrack.dev`; otherwise `""` | **Empty string disables** the script and every Next.js server event. Without this variable, `pnpm dev`, CI builds and Railway preview services send nothing (they used to report into the production site). Set it explicitly on the Railway prod service |
| `RYBBIT_API_KEY` | Next.js + Convex | — | Optional bearer for `/api/track` |
| `RYBBIT_SITE_ID` / `RYBBIT_HOST` | Convex deployment | — / same host | Enables `webhook_delivered` + `sync_completed` |

### Rybbit site settings (dashboard, not script attributes)

SPA navigation, initial page view, outbound links, web vitals, error tracking and autocapture (button clicks, form submits, copy) are **site settings** fetched by the script; only skip/mask patterns are script attributes. Required state: SPA **on**, outbound **on**, web vitals **on**, error tracking **on**, button clicks + form submits **on**, copy **on** (badge / MCP snippets), URL parameters **off** (keeps `?next=`, `?ref=` out of paths), **session replay off**, track IP **off**, user-id salting **on**, bot filtering **on**, hostname exclusion `localhost*`. See `HUMAN_TODO.md`.

## Event catalog (browser)

All props are primitives. Never emails, handles, URLs of third parties or secrets.

| Event | Props | Fired from |
|---|---|---|
| `cta_click` | `location: hero \| how-it-works \| footer \| pricing` | Landing CTAs (`CtaLink`) — since the URL-first hero only the ghost / secondary links use it |
| `preview_started` | — | `PreviewForm` submit on `/` (hero + footer) and on `/preview` itself |
| `preview_ready` | `detected` (comma list of `identity` / `analytics` / `monetization`) | `/api/preview` answered; the props say which stack keys the founder's own `<head>` gave away |
| `preview_failed` | `reason` (`invalid_input`, `bad_request`, `upstream`, `network`, HTTP status) | Bad input, an unreachable / bot-blocking domain, or the request itself failing |
| `preview_signup_click` | — | "Claim this page" on `/preview` → `/sign-up?next=/app/onboarding` |
| `board_filter_change` | `board, window, category` | `BoardFilters` (board / window links, category / size / platform selects) |
| `search` | `termLength, results` | `SearchBox`, once per query with results |
| `compare_opened` | — | `ComparePicker` when ≥ 2 products are selected |
| `share_card_viewed` | `kind` | Share Studio open, `/s/[slug]/share/[kind]` mount |
| `share_card_downloaded` | `kind, range` | Studio “Download PNG”, share page PNG / Square |
| `share_intent_opened` | `network` (`x`) | Studio “Post to X”, `ShareButtons` |
| `badge_snippet_copied` | — | Public badge block + badge configurator (HTML / Markdown / Image URL) |
| `embed_snippet_copied` | `widget` | Widget configurator (script / iframe / JSON) |
| `dataset_downloaded` | `dataset, format: json \| csv` | `/developers` dataset links |
| `sign_up_started` | `method: email \| google \| github \| x` | Sign-up submit / Google button |
| `sign_up_completed` | `method, ref?` | Account created (email; social completions land on the identify). `ref` is the stored first-touch `ref` (below), if any |
| `sign_in` | `method` | Successful password sign-in; for OAuth, fired from `AnalyticsIdentity` once the redirect actually lands with a session (`withSignInMarker` tags `next`, not fired on click — an abandoned/failed OAuth attempt is not a sign-in) |
| `email_verification_resent` | — | “Resend verification email” |
| `sign_out` | — | App shell + settings sign-out |
| `password_reset_requested` | — | `/forgot-password` submit, success only |
| `password_reset_completed` | — | `/reset-password` submit, after the password is actually changed |
| `onboarding_step` | `step, platform?` | Every `setStep` in `/app/onboarding` (`Profile … Publish`, `done`) |
| `onboarding_completed` | — | Publish step + AI flow completion |
| `onboarding_skipped` | `hasProduct: yes \| no` | "Skip for now" / "Finish this later" in `/app/onboarding` |
| `project_created` | `source: form \| mcp \| trustmrr` | `SaasForm` (`form`); `mcp` / `trustmrr` reserved (an import prefills the form, the save is still `form`) |
| `project_updated` | `fields` (comma-joined names) | `SaasForm` edit |
| `project_published` / `project_unpublished` | — | Publish switch, onboarding publish |
| `trustmrr_import_started` / `_succeeded {unmappedCount}` / `_failed {reason}` | — / count of source values that matched nothing / error code (`not_configured`, `bad_request`, `not_found`, `rate_limited`, `upstream`) | `TrustmrrImport` on the new / edit project forms (IMPORT-1) |
| `integration_connect_opened` | `provider, role` | Provider tile picked in `ConnectSource` |
| `integration_test` | `provider, ok` | “Test connection” |
| `integration_connected` | `provider, role, verification` | Successful connect (`verified \| conditional \| self-reported`) |
| `integration_removed` | `provider` | Disconnect |
| `sync_triggered` | `role` | “Sync now” |
| `backfill_triggered` | — | “Backfill last 30 days” |
| `postgres_wizard_step` | `step` (2–4) | PostgreSQL / Supabase DB wizard advancing |
| `x_connected` / `x_disconnected` | — | `/app/settings/social` |
| `x_followers_refreshed` | — | `/app/settings/social` → Refresh now (success only) |
| `follow` / `unfollow` | `targetType: saas \| profile` | `FollowButton`, `FollowChip` |
| `token_create_opened` | `type: api \| mcp` | API key / MCP token dialog opened |
| `token_created` | `type: api \| mcp, origin` | Developer dialogs (`dashboard`) |
| `token_revoked` | — | Token list |
| `mcp_config_copied` | `client` (`claude-code \| cursor \| codex \| vscode \| generic`) | MCP token dialog, `/developers` snippet tabs |
| `webhook_create_opened` | — | Webhook dialog opened |
| `webhook_created` | `events` (comma-joined) | Webhook dialog |
| `webhook_test_sent` | — | “Send test” |
| `webhook_updated` | `action: deleted \| secret_rotated \| enabled \| disabled` | Endpoint list, success only |
| `notification_pref_changed` | `key, value` | `/app/settings/notifications` |
| `account_export_downloaded` | — | Settings → Data & privacy |
| `account_deleted` | — | After the delete mutation succeeds |
| `outbound_click` | `target: website \| trustmrr \| app_store \| play_store \| x \| github` | Public growth page (`/s/[slug]`) outbound links, via `TrackedA` |

## Server-side events

| Event | Props | From |
|---|---|---|
| `api_request` | `category, status, authenticated` | every `/api/v1` handler via `withApi` (including 401 / 429) |
| `mcp_tool_called` | `tool, ok, code?` | every MCP tool call |
| `badge_rendered` | `type` | `/api/badge/[slug].svg` (found only) |
| `embed_rendered` | `widget` | `/embed/[slug]` iframe document |

Badge and widget loads additionally record the referring host into `embedSites` (see *Attribution*); that is a product signal shown to the founder, not an analytics event.
| `native_event_ingested` | — | accepted (non-duplicate) native SDK event |
| `webhook_delivered` | `ok, attempt` | Convex `webhooks.deliver` after each HTTP attempt |
| `sync_completed` | `provider, role, ok` | Convex `sync.runOne` |

## Attribution

Every link that leaves UserTrack's own surfaces carries `ref` (read by the app) plus `utm_source` / `utm_medium` / `utm_campaign` (Rybbit parses UTMs natively). Canonical URLs — `alternates.canonical`, OG `url`, `shareUrl`, `saasUrl`, API `urls.*` — stay clean; only the *outbound* copy is attributed. `attributedUrl(url, { ref, source, medium, campaign })` in `src/lib/site.ts` is the one helper (Convex imports it too); `shareLinkUrl(slug, kind, channel)` wraps the share page.

| Surface | `ref` | `utm_source` | `utm_medium` | `utm_campaign` | Where |
|---|---|---|---|---|---|
| Live widget | `embed` | `embed` | `widget` | widget type | `widgetPageUrl` (`src/lib/embed.ts`) |
| SVG badge snippets (HTML / Markdown, configurator, public badge block, MCP `usertrack_get_embed_code`) | `badge` | `badge` | `image` | badge type | `attributedUrl(saasUrl(slug), …)` |
| Share buttons (product page, share page, compare) | `share` | `x` · `link` | `share-card` | `page` · share kind · `compare` | `ShareButtons` |
| Share Card Studio (Copy link / Post to X) · Share Center | `share` | `x` · `link` | `share-card` | share kind | `share-studio.tsx`, `/app/share` |
| X auto-posts | `share` | `x-founder` · `x-bot` | `share-card` | share kind | `convex/social.ts` |
| MCP share objects (`xIntent`, X drafts) | `share` | `mcp` | `share-card` | share kind | `convex/gateway.ts` |
| Emails (product, share, dashboard, board, report links) | `email` | `email` | email type (e.g. `user-milestone`) | `product` · `manage` · share kind · path slug (`app`, `share`, `onboarding`, `leaderboard`, `report`) | `link()` in `convex/email/templates/index.ts` — signed prefs / unsubscribe / verify / reset links are untouched |

**Badge host detection is best effort.** `/api/badge/[slug]` reads the `Referer` exactly like `/embed/[slug]` (`src/lib/embed-host.ts`) and records `kind: "badge"` into the same `embedSites` row (`badgeLoads`). The SVG is edge-cached for an hour, so only cache misses reach origin, and GitHub proxies README images through camo without a Referer: it discovers badges on the founder's own site and docs, not READMEs.

**Sign-up first touch.** `<Attribution/>` (`src/components/analytics/attribution.tsx`, mounted in the root layout) stores `{ ref, source, medium, campaign, at }` from the first page load's `?ref` / `utm_*` in `localStorage["ut:attribution"]` — only when nothing is stored yet (first touch wins). Values are sanitized to `[a-z0-9_-]`, max 40 chars each (`src/lib/attribution.ts`, unit-tested); records older than 30 days are ignored when read. `ProfileForm` sends it to `profiles.upsert` as `attribution`; the mutation re-validates it server-side and writes it **only on insert** (never patched, never overwritten) as `profiles.attribution`. It is never public: `publicProfile` picks explicit fields, the API and MCP never see it. `sign_up_completed` carries the stored `ref` as an event prop, so the funnel can be split by source in Rybbit.

**Why UTMs and `ref`.** Rybbit's *URL parameters off* setting strips `?ref=` (and `?next=`) from recorded paths, so paths stay clean and `ref` is only for the app; UTMs are parsed by Rybbit natively and survive that setting as the session's source / medium / campaign.

## Goals & funnels

Rybbit's site settings, goals and funnels below were created via its API (Site settings API, Goals API, Funnels API all exist — the dashboard is not the only way in).

| Goal | Type | Value | id |
|---|---|---|---|
| Signed up | Custom event | `sign_up_completed` | 88 |
| Project created | Custom event | `project_created` | 89 |
| Source connected | Custom event | `integration_connected` | 90 |
| Page published | Custom event | `project_published` | 91 |
| Token created | Custom event | `token_created` | 92 |
| Webhook created | Custom event | `webhook_created` | 93 |
| Joined the waitlist | Custom event | `waitlist_join` | 94 |
| Onboarding completed | Custom event | `onboarding_completed` | 95 |
| Visited sign-up | Page | `/sign-up` | 96 |
| Reached onboarding | Page | `/app/onboarding` | 97 |
| Viewed a growth page | Page | `/s/*` | 98 |

| Funnel | Steps | id |
|---|---|---|
| Startseite → Waitlist | (pre-existing, waitlist app) | 35 |
| Founder Activation | `/` (page) → `/sign-up` (page) → `onboarding_completed` → `project_created` → `integration_connected` → `project_published` | 36 |
| Developer | `/developers` (page) → `token_created` → `mcp_tool_called` | 37 |

**The URL-first entry (v1.0.2).** The landing hero is no longer a sign-up button but a URL field: the visitor types their own domain, `/preview` reads that site's public `<head>` through `/api/preview` and shows the page they would get — real name, description, logo, the providers their own HTML gives away, and real category peers off the public board. **No metric of theirs is ever invented or blurred**, because "numbers you cannot type in" is the product. Only then does `/sign-up?next=/app/onboarding` appear. The step order in Rybbit is therefore `/` → `preview_started` → `preview_ready` → `preview_signup_click` → `/sign-up` → `sign_up_completed` → … , and the `Founder Activation` funnel (id 36) still measures the same tail. The three preview events are new drop-off points worth watching before touching the funnel definition — **no Rybbit configuration was changed for this**; funnel 36 is untouched and any new funnel has to be created deliberately via the API.

**The waitlist app.** `apps/waitlist` is a separate Vite app (own Railway service) that ran before the main app launched and still exists for the pre-launch page. It hardcodes `data-site-id="753f44fa9c50"` in `apps/waitlist/index.html` — the same Rybbit site as UserTrack itself — and fires `waitlist_join` / `waitlist_join_failed` straight off `window.rybbit`, bypassing the typed catalog entirely (it is a different app with its own `package.json`, not part of this Next.js build). Those two events are **intentionally not** in `EVENTS`: this codebase never fires them, and adding untyped-elsewhere strings to the catalog would be misleading.

## Verifying locally

```bash
PORT=3100 pnpm build && PORT=3100 pnpm start
node scripts/analytics-check.mjs http://localhost:3100   # prints every request to the Rybbit host
```

Unit tests: `src/lib/analytics.test.ts`, `src/lib/analytics-server.test.ts`, `convex/lib/analytics.test.ts`.
