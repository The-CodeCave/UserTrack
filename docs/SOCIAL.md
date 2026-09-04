# Social: X handles, X connection, auto-posting, the UserTrack account

**TL;DR** — Phase 1 works without any X API access: canonical handles, X intents with tasteful data-driven drafts, and share cards that unfurl. X OAuth (connect account, import handle/avatar) and opt-in auto-posting are fully implemented behind a feature flag (`X_CLIENT_ID` + `X_CLIENT_SECRET` on Convex); the UserTrack-owned account is a separate pathway (OAuth 1.0a env credentials). **Every automatic post is off by default.** When in doubt, nothing posts.

## Handles (`src/lib/social.ts`)

`normalizeXHandle("@ada" | "ada" | "https://x.com/ada/" | "twitter.com/ada?s=20") → "ada"`; valid = `^[A-Za-z0-9_]{1,15}$`; stored canonically in `profiles.x`, always displayed as `@ada`. Accepted in onboarding (optional), `/app/profile`, `/app/settings/social`, MCP `usertrack_update_profile`. A typed handle is state `handle_provided` and is never shown as verified.

## Drafts (`src/lib/x-drafts.ts`)

`xDraft({ kind, name, value, totalUsers, newUsers30d, rank, percentile, verified, author, founderHandle, projectHandle, seed })` — a small set of templates per kind, rotated deterministically by `seed` (the event key), always built from real numbers, ≤ 280 chars including the 23-char URL. Founder-authored posts end with `Verified by @usertrack` (verified sources) or `Tracked on @usertrack`; UserTrack-authored posts speak in the third person, say "verified" only for verified data and append `Built by @founder` only when tagging is allowed. Founder and product handles are separate inputs and never conflated.

## X intent

`xIntentUrl(text, url)` → `https://x.com/intent/post?text=…&url=…`. Used by the Studio, Share Center, share pages and MCP. Clicking it from the Share Center marks the event `shared`.

## OAuth 2.0 (founder-connected account)

Flag: `X_CLIENT_ID` + `X_CLIENT_SECRET` on the Convex deployment. Without them `social.status.oauthEnabled = false`, the settings page explains the connection is not enabled, and nothing else changes.

Flow (PKCE, confidential client):

1. `GET /api/social/x/connect` (Next, session required) generates `state` (24 random bytes) and a PKCE verifier/challenge, calls `social.beginOAuth` (stores `oauthStates {state, profileId, codeVerifier, redirectTo, createdAt}`) and redirects to `https://x.com/i/oauth2/authorize` with scopes `tweet.read tweet.write users.read offline.access`.
2. X redirects to `GET /api/social/x/callback?code&state` (`callbackPath` in `convex/lib/xApi.ts`; production `https://usertrack.dev/api/social/x/callback`). The route (per-IP 10/min) calls `social.completeOAuth` **with the founder's session**; `consumeState` deletes the state row and rejects it unless it belongs to that profile and is < 10 min old (CSRF binding + single use).
3. The action exchanges the code (`Authorization: Basic client_id:client_secret`), fetches `/2/users/me`, and `storeConnection` upserts `socialConnections {providerUserId, handle, name, avatarUrl, accessToken, refreshToken, expiresAt, scopes, status: active}`, sets `profiles.x` to the connected handle, `xUserId`, `xConnectedAt`, and imports the avatar only if the profile has none (connecting is the explicit permission).

Tokens: only in `socialConnections` (server-side, Convex at-rest encryption), never returned by `social.status` (which returns handle/name/avatar/timestamps/status/lastError only), never logged, never in audit rows. Refresh happens a minute before expiry inside the posting action; a 401 marks the connection `error` so the UI asks to reconnect. **Disconnect** revokes at X (best effort) and deletes the row; the typed handle stays.

## Follower count — `social.refreshFollowers`, daily

Free tier only exposes `public_metrics` on `GET /2/users/me` (the token owner). `X_ME_URL` therefore requests `profile_image_url,name,username,public_metrics`; `followersOf()` extracts `followers_count`.

| Source | When | Writes |
|---|---|---|
| `completeOAuth` → `storeConnection { followers }` | Connect X | `profiles.xFollowers`, `xFollowersAt` |
| `authProfile.applyProviderProfile` (X sign-in / link, Better Auth `account.accessToken`) | every login / link | same fields (count always replaced; handle / avatar still only fill empty fields; `profilePrefills.xFollowers` until the profile exists) |
| `refreshFollowers` (internal action, `daily.run` +35 s) | daily | pages `socialConnections` with `status: active` in pages of 50 (`FOLLOWERS_PAGE_SIZE`), one action per page chained through the scheduler; refreshes the token when `needsRefresh`; 401 / dead refresh token → `status: error` + `lastError` (Settings asks to reconnect, same as posting); 429 → the run ends, tomorrow catches up; any other failure → `lastError`, next founder. Returns `{ refreshed, failed }`; no-op without `X_CLIENT_ID`. |
| `refreshNow` (action, Settings → "Refresh now") | on click | same read path, once per minute per founder (`FOLLOWERS_REFRESH_COOLDOWN_MS`, checked against `xFollowersAt`) |

`disconnect` clears the count with the tokens. Display: `docs/PROFILES.md` → "X follower count". Never looked up by handle (paid tier), never for cofounders, never on anonymous projects.

## Auto-posting (founder account) — `social.autoPost`, hourly

Preconditions per event: `shareEvents.status = ready`, ≤ 48 h old, project public and not demo, founder has `socialPrefs.autoShare[category] = true` (default **false** for all five categories), an `active` connection, no existing `socialPosts` row for `(event, founder)`, and no founder post in the last 24 h. Then a `socialPosts` row (`queued`) is written and `deliverPost` posts once (`POST /2/tweets`, text = draft + share URL; the card image comes from the URL's OG unfurl, no media upload). Success → `posted` + `providerPostId`, event `shared`, `connection.lastPostAt`. Failure → `failed` + secret-free error, **no aggressive retry**; the card stays in the Share Center and the error is shown on the settings page. Rate limits: one automatic post per founder per day, one attempt per event per account.

## UserTrack account (bot) — separate pathway

Credentials: `X_BOT_CONSUMER_KEY`, `X_BOT_CONSUMER_SECRET`, `X_BOT_ACCESS_TOKEN`, `X_BOT_ACCESS_SECRET` (OAuth 1.0a user context of the @usertrack account; long-lived, nothing to refresh or persist). Signing lives in `convex/lib/xApi.ts` (`oauth1Header`, pinned by the X documentation test vector). Never shares code paths or tokens with founder connections.

Rules (`botWorthy` in `convex/lib/shareRules.ts`): verified data only; user milestones ≥ 1,000, new best rank ≤ #3, Top 10 entries. Founder opt-outs: `allowPromotion` (default on; off → never mentioned), `allowTagging` (default on; off → no `@founder`). Cap: 3 bot posts per day platform-wide, one per event. Without the env credentials `botEnabled = false` and nothing is queued.

## Settings (`/app/settings/social`)

X handle (state chip; typed-handle founders see "Connect X below to show your follower count"), Connected X account (Connect / Disconnect, follower count + refreshed-ago + Refresh now, last post, last error), Auto-share per category (disabled until connected, all off), UserTrack account (promote / tag), recent automatic posts with status and errors.

## Data model

`profiles.x / xUserId / xConnectedAt / xFollowers / xFollowersAt / socialPrefs {allowTagging?, allowPromotion?, autoShare{…}}` · `socialConnections` · `socialPosts` · `oauthStates` (expired rows cleaned by the hourly job).

## Security checklist

State bound to the profile and single-use · PKCE S256 · callback rate-limited · tokens server-only · secret-free error strings (`describeXError`) · no token in audit logs / scheduler args (revoke runs inside the action) · founder and bot credentials isolated · posting requires explicit per-category opt-in · bot requires explicit env credentials and respects per-founder opt-outs.

## Human setup

See `HUMAN_TODO.md`: "Create X Developer App" (client id/secret, callback URL, scopes) and "UserTrack X account" (OAuth 1.0a credentials). Until then production runs Phase 1 (handles, intents, drafts, cards) with the flags off.
