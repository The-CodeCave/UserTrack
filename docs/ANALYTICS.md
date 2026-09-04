# Analytics (Rybbit)

**TL;DR** — UserTrack tracks product usage with a self-hosted, cookieless [Rybbit](https://rybbit.com) instance (`https://rybbit.internal.thecodecave.de`, site `753f44fa9c50`). No consent banner: no cookies, no session replay, IP hashed daily. The browser sends page views + a **typed event catalog** (`src/lib/analytics.ts`), route handlers and Convex actions send a handful of **server-side events** (`/api/track`), signed-in founders are linked by their **pseudonymous Better Auth id** (never an email). Goals and funnels can only be created in the Rybbit dashboard — the table at the end lists what to create.

## How it is wired

| Piece | Where | Notes |
|---|---|---|
| Tracker script | `src/components/analytics/analytics.tsx` → `<AnalyticsScript/>` in `src/app/layout.tsx` | `next/script` (`afterInteractive`), `data-site-id`, `data-skip-patterns='["/api/**","/embed/**","/mcp"]'`, `data-mask-patterns='["/email/preferences*","/reset-password*"]'` (tokens never reach analytics). Rendered only when `ANALYTICS_ENABLED` (site id non-empty and `NODE_ENV !== "test"`). |
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
| `NEXT_PUBLIC_RYBBIT_SITE_ID` | Next.js | `753f44fa9c50` | **Empty string disables** the script and every Next.js server event |
| `RYBBIT_API_KEY` | Next.js + Convex | — | Optional bearer for `/api/track` |
| `RYBBIT_SITE_ID` / `RYBBIT_HOST` | Convex deployment | — / same host | Enables `webhook_delivered` + `sync_completed` |

### Rybbit site settings (dashboard, not script attributes)

SPA navigation, initial page view, outbound links, web vitals, error tracking and autocapture (button clicks, form submits, copy) are **site settings** fetched by the script; only skip/mask patterns are script attributes. Required state: SPA **on**, outbound **on**, web vitals **on**, error tracking **on**, button clicks + form submits **on**, copy **on** (badge / MCP snippets), URL parameters **off** (keeps `?next=`, `?ref=` out of paths), **session replay off**, track IP **off**, user-id salting **on**, bot filtering **on**, hostname exclusion `localhost*`. See `HUMAN_TODO.md`.

## Event catalog (browser)

All props are primitives. Never emails, handles, URLs of third parties or secrets.

| Event | Props | Fired from |
|---|---|---|
| `cta_click` | `location: hero \| how-it-works \| footer \| pricing` | Landing CTAs (`CtaLink`) — only `hero` and `footer` exist today |
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
| `sign_up_completed` | `method` | Account created (email; social completions land on the identify) |
| `sign_in` | `method` | Successful password sign-in, Google button on sign-in |
| `email_verification_resent` | — | “Resend verification email” |
| `sign_out` | — | App shell + settings sign-out |
| `onboarding_step` | `step, platform?` | Every `setStep` in `/app/onboarding` (`Profile … Publish`, `done`) |
| `onboarding_completed` | — | Publish step + AI flow completion |
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
| `follow` / `unfollow` | `targetType: saas \| profile` | `FollowButton`, `FollowChip` |
| `token_created` | `type: api \| mcp, origin` | Developer dialogs (`dashboard`) |
| `token_revoked` | — | Token list |
| `mcp_config_copied` | `client` (`claude-code \| cursor \| codex \| vscode \| generic`) | MCP token dialog, `/developers` snippet tabs |
| `webhook_created` | `events` (comma-joined) | Webhook dialog |
| `webhook_test_sent` | — | “Send test” |
| `notification_pref_changed` | `key, value` | `/app/settings/notifications` |
| `account_export_downloaded` | — | Settings → Data & privacy |
| `account_deleted` | — | After the delete mutation succeeds |

## Server-side events

| Event | Props | From |
|---|---|---|
| `api_request` | `category, status, authenticated` | every `/api/v1` handler via `withApi` (including 401 / 429) |
| `mcp_tool_called` | `tool, ok, code?` | every MCP tool call |
| `badge_rendered` | `type` | `/api/badge/[slug].svg` (found only) |
| `embed_rendered` | `widget` | `/embed/[slug]` iframe document |
| `native_event_ingested` | — | accepted (non-duplicate) native SDK event |
| `webhook_delivered` | `ok, attempt` | Convex `webhooks.deliver` after each HTTP attempt |
| `sync_completed` | `provider, role, ok` | Convex `sync.runOne` |

## Goals & funnels to create in the dashboard

Rybbit has no API for goals or funnels. Create these once (Rybbit → site → Goals / Funnels):

| Goal | Type | Value |
|---|---|---|
| Signed up | Custom event | `sign_up_completed` |
| Project created | Custom event | `project_created` |
| Source connected | Custom event | `integration_connected` |
| Page published | Custom event | `project_published` |
| Token created | Custom event | `token_created` |
| Webhook created | Custom event | `webhook_created` |
| Visited sign-up | Page | `/sign-up` |
| Reached onboarding | Page | `/app/onboarding` |
| Viewed a growth page | Page | `/s/*` |

| Funnel | Steps |
|---|---|
| Founder activation | `/` (page) → `/sign-up` (page) → `onboarding_completed` → `project_created` → `integration_connected` → `project_published` |
| Developer | `/developers` (page) → `token_created` → `mcp_tool_called` |

## Verifying locally

```bash
PORT=3100 pnpm build && PORT=3100 pnpm start
node scripts/analytics-check.mjs http://localhost:3100   # prints every request to the Rybbit host
```

Unit tests: `src/lib/analytics.test.ts`, `src/lib/analytics-server.test.ts`, `convex/lib/analytics.test.ts`.
