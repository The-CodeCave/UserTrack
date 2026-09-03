# UserTrack Human To-Do

Everything the agent could not complete autonomously because it needs an external account, credential, DNS access or a human decision. Developer work is **not** listed here — it is done, tested and deployed.

Last updated: 2026-09-03 (v0.9: discovery v3, follow + watchlists, ranking / trending / benchmark history, benchmarks v2, public datasets + SEO pages, webhooks — see the v0.9 section; v0.8: founder profiles, Share Card Studio, share engine, X handles / intents / drafts, flagged X OAuth + auto-posting + bot pathway — see the v0.8 section; v0.7: native SDK integrations — `@usertrack/protocol`, `@usertrack/node`, `@usertrack/better-auth` 0.2.0, provider `native`; v0.6: Better Auth native integration + `@usertrack/better-auth`; v0.5: lifecycle model Growth → Activation → Conversion, conversion providers Stripe / RevenueCat / Paddle / Lemon Squeezy / Chargebee, identity + cohorts, visibility model, mobile projects, API/MCP extensions).

**v1.0 launch hardening (SEC-1).** Two things to know, nothing new to create: (1) `UT_GATEWAY_SECRET` is now **required on both Convex prod and Railway** and the gateway fails closed without it — it is already set on both per the v0.6 note, so no action; if it is ever rotated, rotate it on both sides in the same minute (`npx convex env set --prod UT_GATEWAY_SECRET <value>` and the Railway variable). (2) `RESEND_API_KEY` moved from "for email" to **Required**: email+password accounts must verify their address before they can sign in, and the verification mail goes through Resend — until the key exists on Convex prod, every new password sign-up is locked out at "Check your inbox" (Google sign-in is unaffected). The Resend item below is therefore the first thing to do.

**v0.9 needs no new human action for production.** The schema additions are all new tables / optional fields (no migration), the crons (`webhook retry sweep`, monthly ranking snapshot inside the daily sweep) and every page, API route and MCP tool are deployed and smoke-tested by the agent. Three things only a human can do are listed under **v0.9** below: submit the new public pages once the domain is live (Search Console is part of the domain task), optionally register UserTrack webhooks with Zapier / Make, and optionally point a real endpoint at a test delivery to see the signed payload end to end. History-based features fill up on their own: the first Biggest Movers appear ~7 days after the deploy (stored daily positions), the first `/rankings` archive on the 1st of the next month, benchmark cards once a cohort has 10 verified products.

**v0.7 (native SDK) needs three human actions, in this order.** (1) **Deploy + migrate**: `npx convex deploy` (schema adds the `native` provider literal and the new event types; nothing is removed), then `npx convex run --prod migrations:nativeV1` (idempotent, paged; rewrites the existing `better_auth` integration(s) to `native` + `source: "better-auth"` and their snapshot / sync-run provenance — until it ran, rows are normalised on read and keep working), then the Railway deploy (`git push` → Railway builds `pnpm railway:build`, which runs `convex deploy` again — harmless). Check afterwards: `/developers/integrations/native` renders, `/mcp` lists 30 tools, the dashboard shows the existing Better Auth source as "Better Auth" under "My app (SDK)", and `/api/integrations/better-auth/events` still answers 405 on GET (the 0.1.x plugin path). (2) **Publish the packages, in this order**: `@usertrack/protocol@0.1.0` → `@usertrack/node@0.1.0` → `@usertrack/better-auth@0.2.0` — the plugin now depends on the other two (`workspace:^` becomes `^0.1.0` at pack time), so `0.2.0` cannot be installed before they exist; all steps (scope, first publish per package, trusted publishing / `NPM_TOKEN`, tags `protocol-v*` / `node-v*` / `better-auth-v*` for `.github/workflows/release-packages.yml`) are in **`packages/better-auth/HUMAN_TODO.md`** (scope, tokens, ownership — shared by all three) and **`packages/node/HUMAN_TODO.md`** (publish order + first publish of protocol and node). Until then founders can install from a `pnpm pack` tarball. (3) **Verify one real founder integration after the deploy**: create a test project, pick "My app (SDK)" → Prisma (or Custom), mount the handler from the wizard in any app you own (a throwaway Next.js + Prisma app on Neon, or `packages/node/e2e/serve.mjs` behind a tunnel), click Verify, then check the Sync log, the auto-attached activation / conversion rows and the "Live events" line after one signup. The Prisma / Drizzle / Convex / Auth.js adapters are tested against in-memory fakes and rendered SQL, not live databases — a Postgres (Neon free tier) and a Convex starter deployment are the only third-party accounts needed for that; nothing else is required from you. No new UserTrack-side environment variable.

**v0.6 (Better Auth) needs no new human action for production** beyond what v0.7 lists above (the package is now `0.2.0` and depends on `@usertrack/protocol` + `@usertrack/node`, so those must be published first; the release workflow file was renamed to `release-packages.yml`). The provider, credentials, verification, sync, events route, dashboard wizard, MCP tools and docs are deployed and smoke-tested; no new UserTrack-side environment variable is required (`UT_GATEWAY_SECRET` was already set). What *does* need a human is **publishing the npm packages** — until they are on npm, `npm install @usertrack/better-auth` / `@usertrack/node` fails for founders (both work from a `pnpm pack` tarball or the repository). Every publish step is listed in **`packages/better-auth/HUMAN_TODO.md`** (claim the `@usertrack` npm scope, first manual publish, trusted publishing / `NPM_TOKEN` for the tag-driven workflow, Better Auth community-plugin PR) and **`packages/node/HUMAN_TODO.md`**. Cross-reference only — those items are not repeated here.

**v0.5 needs no new human action for production.** Everything in this phase is configured and deployed by the agent: the Convex schema migration (`migrations:lifecycleV1`, ran to `done` on production on 2026-09-02), `IDENTITY_SALT` on both Convex deployments, the demo seed refresh (the 5 demo products now carry labelled, never-synced demo sources for users / activation / conversion so the public funnel, cohorts and conversion boards are demonstrable), rerank and daily sweep. Production was verified after the Railway deploy: `/s/demo-northwind`, `/best-conversion`, `/api/v1/saas/{slug}/funnel|conversion|engagement|cohorts`, `/api/openapi.json` (15 paths) and `/mcp` (27 tools) all respond. Payment-provider credentials (Stripe restricted keys, RevenueCat v2 keys, Paddle / Lemon Squeezy / Chargebee API keys) are entered **by each founder** for their own product in the dashboard or via MCP — they are not operator secrets and nothing is required from you. The only optional item is a sandbox key for a live end-to-end test of the Stripe adapter (see "Optional / Future").

**v0.4 needed no new human action.** Everything in this phase (PostgreSQL / Supabase / Clerk / Firebase providers, activation + funnel, Trending Score v2, discovery feed, share cards + embeds, benchmarks, compare, API + MCP) is configured and deployed. The items below are unchanged from earlier phases; the domain item is now the most important one because every share card, embed snippet and MCP config snippet renders the Railway URL until `usertrack.dev` points at production.


## v0.9 — Discovery, datasets, webhooks

### Search Console: submit the new public pages (after the domain is live)

**Why**
v0.9 adds high-intent pages (`/hidden-gems`, `/biggest-movers`, `/fastest-growing-developer-tools`, `/fastest-growing-mobile-apps`, `/best-activation-rate-saas`, `/best-converting-mobile-apps`, `/rankings/*`, `/developers/webhooks`) and dataset endpoints. They are in the sitemap and have canonicals, metadata, JSON-LD and methodology sections, but until `usertrack.dev` points at Railway (task "Point usertrack.dev at production") every canonical renders the Railway hostname and nothing is worth submitting.

**Where**
Google Search Console → property `usertrack.dev` (created in the domain task) · Bing Webmaster Tools (optional)

**Steps**
1. Finish "Point usertrack.dev at production (Cloudflare)" below (sets `NEXT_PUBLIC_SITE_URL` / `SITE_URL`, redeploys).
2. Search Console → Sitemaps → submit `https://usertrack.dev/sitemap.xml` (it already lists the new pages and, from the first month on, the `/rankings/<year>/<month>/<category>` archives).
3. URL inspection → request indexing for `/discover`, `/hidden-gems`, `/biggest-movers`, `/fastest-growing-mobile-apps`, `/developers/webhooks`.
4. After a week, check Coverage for "Duplicate, Google chose different canonical" — every board page uses its bare path as canonical on purpose; filter combinations (`?window=`, `?size=`, `?platform=`) are not separate canonicals.

**Required values** — none. **Where to enter them** — Search Console UI.

**Status**
* [ ] Pending (blocked by the domain task)

---

### Optional: verify one real webhook delivery end to end

**Why**
The delivery pipeline (signature, retries, ledger, SSRF policy) is unit- and integration-tested, and the "Send test event" button runs the real action against a real HTTPS endpoint. A human can confirm the signed payload arrives on a third-party receiver and that the documented verification snippet accepts it.

**Where**
`https://<site>/app/developer/webhooks` (any founder account) · a receiver such as https://webhook.site or a small Node handler using the snippet from `/developers/webhooks`

**Steps**
1. Sign in, open Developer → Webhooks → Create endpoint with the receiver URL (must be `https://`; private / local hosts are refused by design), pick any events, copy the `whsec_…` secret (shown once).
2. Click "Send test event". The Deliveries panel shows the attempt with HTTP status and latency; the receiver shows headers `UserTrack-Signature`, `UserTrack-Timestamp`, `UserTrack-Event: webhook.test`, `UserTrack-Delivery`, and a payload with `"test": true`.
3. Paste the raw body + headers into the verification snippet with the secret → `true`. Change one byte → `false`.
4. Delete the endpoint afterwards (or keep it for real events).

**Status**
* [ ] Optional

---

### Optional: list UserTrack webhooks with automation platforms

**Why**
Zapier / Make / n8n users could react to `milestone.reached` or `growth.spike` without writing code. Everything they need exists (signed payloads, docs at `/developers/webhooks`, stable event ids), but a listing needs a partner account and review that only a human can go through.

**Where**
Zapier Developer Platform (https://developer.zapier.com) · Make Custom Apps · n8n community node

**Steps**
1. Decide whether the listing is worth the review effort at the current user count (recommendation: wait until at least 20 founders have webhooks enabled — see `webhookEndpoints` in the Convex dashboard).
2. If yes: create the integration with a "Catch webhook" trigger per event type, using the payload examples from `/developers/webhooks`; the API key (`ut_api_`) can be used for the polling-based "Get project metrics" action.

**Status**
* [ ] Decide later

---

## v0.8 — Founder identity & sharing (X)

Everything in this phase that runs without X API credentials is live: founder profiles, X handles, the Share Card Studio, automatic share events, the Share Center, X intents with generated drafts, OG images, API + MCP extensions. The two items below unlock the **optional** X account connection / auto-posting (founder accounts) and the **optional** UserTrack-owned posting account. Until they are done the features stay behind their flags and production behaves exactly as Phase 1 (no broken buttons: the settings page says the connection is not enabled).

### Create X Developer App (founder "Connect X" + opt-in auto-posting)

**Why**
`/app/settings/social → Connect X` (OAuth 2.0 PKCE), import of handle/avatar and the opt-in auto-share categories need an X app with **user authentication settings** and the ability to post. X's free tier allows writes for a single app; reading `/2/users/me` and posting `/2/tweets` are covered. The code is deployed and feature-flagged on `X_CLIENT_ID` / `X_CLIENT_SECRET` (Convex prod env).

**Where**
X Developer Portal → https://developer.x.com/en/portal/dashboard (log in with the @usertrack account or your own)

**Steps**
1. Create a project + app (name e.g. `UserTrack`). Choose the free tier unless you already have Basic.
2. App → **User authentication settings → Set up**:
   - App permissions: **Read and write** (needed for posting; choose Read if you only want "Connect X" for handle/avatar import — auto-posting then fails with a clear 403 and stays off).
   - Type of App: **Web App, Automated App or Bot** (confidential client).
   - Callback URI / Redirect URL: `https://usertrack.dev/api/social/x/callback` (exact; add `http://localhost:3000/api/social/x/callback` for local testing).
   - Website URL: `https://usertrack.dev` · Terms / Privacy: the legal pages once they exist.
3. Save → copy **OAuth 2.0 Client ID** and generate a **Client Secret** (shown once).
4. Set them on Convex **production** (the OAuth exchange and posting run in Convex actions, not on Railway):
   ```bash
   npx convex env set --prod X_CLIENT_ID "xxxxxxxxxxxxxxxxxxxxxx"
   npx convex env set --prod X_CLIENT_SECRET "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   ```
   No redeploy needed; `social.status.oauthEnabled` flips to true immediately.
5. Test: `https://usertrack.dev/app/settings/social` → **Connect X** → authorize → back on the page with "Connected" and your handle. Then switch one auto-share category on and (optionally) trigger `npx convex run --prod social:autoPost` once a share event is ready.

**Required scopes**
`tweet.read`, `tweet.write`, `users.read`, `offline.access` (requested by the app; the portal permission level must allow write).

**Callback URL**
`https://usertrack.dev/api/social/x/callback`

**Environment variables**
`X_CLIENT_ID`, `X_CLIENT_SECRET`

**Where to put them**
Convex dashboard → usertrack → **Production** → Settings → Environment Variables (or the CLI above). Not Railway.

**Status**
- [ ] Pending

---

### UserTrack X account (@usertrack) — bot posting credentials

**Why**
The separate "UserTrack-owned account" pathway posts major **verified** milestones (1K+ users, Top 10, new best rank ≤ #3, at most 3 posts/day platform-wide) and tags founders who allow it. It uses OAuth 1.0a user-context credentials of the @usertrack account (long-lived, no refresh), completely separate from founder connections. Off until all four variables exist.

**Where**
X Developer Portal → the same app → **Keys and tokens**; the account that owns the app must be @usertrack (or the account you want the posts to come from).

**Steps**
1. Register / secure the @usertrack handle (or decide on the brand account) and make it the owner of the developer app from the item above.
2. Keys and tokens → **API Key and Secret** (consumer key/secret) → regenerate if unsure, copy both.
3. Keys and tokens → **Access Token and Secret** → generate **with Read and Write** permissions (regenerate after changing app permissions), copy both.
4. ```bash
   npx convex env set --prod X_BOT_CONSUMER_KEY "…"
   npx convex env set --prod X_BOT_CONSUMER_SECRET "…"
   npx convex env set --prod X_BOT_ACCESS_TOKEN "…"
   npx convex env set --prod X_BOT_ACCESS_SECRET "…"
   ```
5. Verify: `npx convex run --prod social:autoPost` — with no qualifying event nothing happens; the settings page shows "UserTrack account" as active. The first real post appears in `socialPosts` (account `usertrack`) with its X id.

**Required values**
Consumer key + secret, access token + secret (OAuth 1.0a, Read and Write).

**Where to enter them**
Convex prod env (see above).

**Status**
- [ ] Pending

---

## Critical Before Production

### Resend — verify `mail.usertrack.dev` and add the API key

**Why this is needed**
The whole email system (welcome, verification, password reset, setup reminders, integration alerts, milestones, spike alerts, monthly report, weekly digest) is implemented and deployed. It sends from `UserTrack <noreply@mail.usertrack.dev>` through Resend. Until `RESEND_API_KEY` exists on the Convex production deployment, every email is **logged as `failed: email not configured`** in the `emailEvents` table and nothing is sent. **Since SEC-1 this blocks email+password accounts entirely**: sign-in requires a verified address, the verification link only arrives through Resend, so new password sign-ups stay at "Check your inbox" and cannot publish anything. Google sign-in keeps working. Password reset by email does not work either.

The agent has no Resend account and no Cloudflare API token, so the domain cannot be created or verified automatically. `EMAIL_FROM`, `EMAIL_REPLY_TO` and `EMAIL_TOKEN_SECRET` are already set on both Convex deployments.

**Where**
Resend dashboard → https://resend.com/domains · Cloudflare dashboard → DNS for `usertrack.dev`

**Steps**
1. Create / log in to the Resend account (team: CodeCave). Free tier (3,000 mails/month) is enough to start.
2. **Domains → Add Domain** → `mail.usertrack.dev` → region **Ireland (eu-west-1)** (Convex prod is also in eu-west-1, and EU data residency).
   Using a subdomain keeps the root domain's reputation and any future Google Workspace / hello@ mailbox untouched.
3. Resend shows 3–4 DNS records. Add them in **Cloudflare → usertrack.dev → DNS → Records**, all with **Proxy status: DNS only (grey cloud)** — proxied records break DKIM/MX:
   | Type | Name (Cloudflare shows without the zone) | Content | Notes |
   |---|---|---|---|
   | TXT | `resend._domainkey.mail` | `p=MIGfMA0GCS…` (copy from Resend) | DKIM — value is account-specific |
   | MX | `send.mail` | `feedback-smtp.eu-west-1.amazonses.com` priority `10` | bounces / return-path |
   | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | SPF for the return-path |
   | TXT | `_dmarc.mail` | `v=DMARC1; p=none; rua=mailto:hello@usertrack.dev` | DMARC (Resend recommends starting with `p=none`; move to `p=quarantine` after a week of clean reports) |
   If Resend also offers "Click tracking / Open tracking" leave them **off** — tracking rewrites links, which hurts deliverability for transactional mail.
4. Back in Resend click **Verify DNS records**. Cloudflare propagates in ~1–5 minutes; Resend marks the domain **Verified**.
5. **API Keys → Create API key** → name `usertrack-prod`, permission **Sending access**, domain `mail.usertrack.dev`. Copy it once.
6. Set it on the Convex production deployment (the mailer runs inside Convex, not on Railway — Railway needs nothing):
   ```bash
   npx convex env set --prod RESEND_API_KEY re_xxxxxxxxxxxx
   ```
   No redeploy needed. For local development create a second key and `npx convex env set RESEND_API_KEY re_dev_xxx` (dev deployment).
7. Smoke test from production without touching real users:
   ```bash
   npx convex run --prod email/testSend:run '{"to":"you@thecodecave.de"}'
   ```
   This sends the welcome template to that address only and writes an `emailEvents` row (`dedupeKey: test:<timestamp>`). Check Resend → Emails → status *Delivered*, and the mail's headers show `DKIM: PASS`, `SPF: PASS`.

**Values**
`RESEND_API_KEY` (starts with `re_`)

**Where to put them**
Convex dashboard → usertrack → **Production** → Settings → Environment Variables (or the CLI above)

**Status**
* [ ] **Required** — blocks email+password sign-in (SEC-1)

---

### Resend webhook — delivery, bounce and complaint events

**Why this is needed**
Delivery state (`delivered`, `bounced`, `complained`, `failed`) is persisted per email and hard-bounced / complaining addresses are automatically suppressed for all non-essential mail. The endpoint is live and signature-verified (Svix HMAC, 5-minute tolerance) but rejects every call with `503 webhook not configured` until the signing secret is set.

**Where**
Resend dashboard → https://resend.com/webhooks

**Steps**
1. **Add Webhook** → Endpoint URL: `https://handsome-warthog-21.eu-west-1.convex.site/webhooks/resend`
   (this is the Convex **site** URL of the production deployment, *not* usertrack.dev).
2. Events: tick `email.delivered`, `email.bounced`, `email.complained`, `email.failed` (others are ignored, `email.delivery_delayed` is optional noise).
3. Create → copy the **Signing secret** (`whsec_…`).
4. ```bash
   npx convex env set --prod RESEND_WEBHOOK_SECRET whsec_xxxxxxxx
   ```
5. Resend → the webhook → **Send test event** → expect `200 ok`. Convex dashboard → Logs shows `resend webhook email.delivered … matched=false` (test events have no matching message id, which is fine).

**Values**
`RESEND_WEBHOOK_SECRET`

**Where to put them**
Convex prod env

**Status**
* [ ] Pending

---

### Google sign-in — create the OAuth client

**Why this is needed**
"Continue with Google" is implemented on `/sign-in` and `/sign-up` (Better Auth social provider, callback proxied through `/api/auth/callback/google`). It only works once Google knows the app: without `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on the Convex deployment the button sends users to a Google `invalid_client` error page. Email + password keeps working regardless. Google users are verified at signup, so they receive the plain welcome mail immediately (no verification step).

**Where**
Google Cloud Console → https://console.cloud.google.com

**Steps**
1. Create (or pick) a project, e.g. `usertrack`.
2. **APIs & Services → OAuth consent screen** (now "Google Auth Platform → Branding/Audience"):
   - User type: **External**. App name `UserTrack`, support email, developer email.
   - App domain: `https://usertrack.dev`. Authorized domain: `usertrack.dev`.
   - Privacy policy / Terms links are required for the app to leave "Testing" — see the Legal pages item below. While in "Testing" only up to 100 test users you add manually can sign in.
   - Scopes: leave default (`email`, `profile`, `openid` are all Better Auth requests).
   - When ready for everyone: **Publish app** (no verification needed for these basic scopes, only a brand review if you upload a logo).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**, name `UserTrack web`.
   - Authorized JavaScript origins: `https://usertrack.dev`, `http://localhost:3000`
   - Authorized redirect URIs (exact, no trailing slash): `https://usertrack.dev/api/auth/callback/google`, `http://localhost:3000/api/auth/callback/google`
   - Copy **Client ID** and **Client secret**.
4. Set them on **both** Convex deployments (Better Auth runs inside Convex, not Railway):
   ```bash
   npx convex env set GOOGLE_CLIENT_ID        "xxx.apps.googleusercontent.com"   # dev
   npx convex env set GOOGLE_CLIENT_SECRET    "GOCSPX-xxx"
   npx convex env set --prod GOOGLE_CLIENT_ID     "xxx.apps.googleusercontent.com"
   npx convex env set --prod GOOGLE_CLIENT_SECRET "GOCSPX-xxx"
   ```
5. Make sure `SITE_URL` on Convex prod is exactly `https://usertrack.dev` (the redirect URI is derived from it and must match Google byte for byte). See the domain item below.
6. Test: `https://usertrack.dev/sign-in` → Continue with Google → `/app/onboarding` (new user) or `/app` (existing).

**Values**
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

**Where to put them**
Convex dashboard → usertrack → Development *and* Production → Settings → Environment Variables

**Status**
* [ ] Pending

---

### Point usertrack.dev at production (Cloudflare)

**Why this is needed**
Public pages, OG images, badges, the API, the Google OAuth redirect URI and **every link inside every email** (`SITE_URL`) depend on the final domain. Until this is done the app — and all email CTAs — live on `usertrack-production.up.railway.app`. Emails already send from `mail.usertrack.dev` independently of this step.

**Where**
Railway → project `usertrack` → service `usertrack` → Settings → Networking → Custom Domain · Cloudflare → usertrack.dev → DNS


> **Also depends on this:** the MCP endpoint (`https://usertrack.dev/mcp`, printed in every agent config snippet), `/api/v1`, `/api/openapi.json` and `/developers`. As of 2026-09-02 `usertrack.dev` has no DNS records at all, so everything — including the new API and MCP — is only reachable on `usertrack-production.up.railway.app`. All docs and discovery documents render `NEXT_PUBLIC_SITE_URL`, so they become correct automatically once the variables are changed. Afterwards re-run: `curl https://usertrack.dev/api/v1/leaderboard?limit=1`, `curl https://usertrack.dev/mcp`, open `https://usertrack.dev/developers`.

**Steps**
1. Railway dashboard → service `usertrack` → Settings → Networking → Custom Domain → add `usertrack.dev` (and `www.usertrack.dev` if you want the redirect). Railway shows a CNAME target. (The agent tried `railway domain usertrack.dev --service usertrack` on 2026-09-02; the CLI answered `Unauthorized` although `railway whoami` / `railway up` work, so this has to be done in the dashboard.)
2. Cloudflare → DNS → add `CNAME` `@` → `<target>.up.railway.app` and `CNAME` `www` → same target. Proxy status: **DNS only** first until the Railway certificate is issued (`.dev` is HSTS-preloaded, HTTPS is mandatory); you can switch to proxied afterwards, with SSL mode **Full (strict)**.
3. Railway variables: `NEXT_PUBLIC_SITE_URL=https://usertrack.dev`.
4. Convex prod: `npx convex env set --prod SITE_URL https://usertrack.dev` (Better Auth base URL, trusted origin, OAuth redirect, all email links).
5. Redeploy so the URL is baked into the client bundle: `railway up --service usertrack --ci`.
6. Google Search Console → add property `usertrack.dev` → submit `https://usertrack.dev/sitemap.xml`.

**Values**
Nothing — just perform the steps.

**Status**
* [ ] Pending

---

### `hello@usertrack.dev` reply-to mailbox

**Why this is needed**
Every email sets `Reply-To: hello@usertrack.dev` (`EMAIL_REPLY_TO`, already configured). Replies land nowhere until that address exists. Options: Cloudflare **Email Routing** (free: Cloudflare → usertrack.dev → Email → Email Routing → route `hello@usertrack.dev` → your inbox; Cloudflare adds its own MX records on the **root** domain, which do not clash with Resend's `send.mail` MX) or Google Workspace. If you prefer no mailbox, `npx convex env set --prod EMAIL_REPLY_TO noreply@mail.usertrack.dev`.

**Status**
* [ ] Decide

---

## Recommended

### Submit the UserTrack MCP server to agent directories

**Why this is needed**
The MCP server is live (`/mcp`, Streamable HTTP, Bearer `ut_mcp_…` tokens) and documented at `/developers#mcp` and `docs/MCP.md`. Listings in the public MCP registries make "Add UserTrack MCP" a one-click action in Cursor / Claude / VS Code and are a real acquisition channel — but every registry requires a human-owned account, a GitHub login or a manual review, so the agent cannot submit.

**Where**
- Official MCP Registry → https://registry.modelcontextprotocol.io (publish via the `mcp-publisher` CLI with a GitHub login)
- Cursor MCP directory → https://cursor.com/directory (submission form)
- Smithery → https://smithery.ai (GitHub login)
- Glama / PulseMCP / mcp.so — submission forms

**Steps**
1. Wait until `usertrack.dev` points at production (item above) so the endpoint URL is final.
2. Use these values in every listing: name `UserTrack`, endpoint `https://usertrack.dev/mcp`, transport `streamable-http`, auth `Bearer token` (create at `https://usertrack.dev/app/developer`), docs `https://usertrack.dev/developers#mcp`, description "The growth data layer for SaaS: let your coding agent add your SaaS to UserTrack, configure verified user tracking and read growth metrics, ranks and milestones."
3. Official registry: install `mcp-publisher` → `mcp-publisher login github` → create `server.json` with `"remotes": [{ "type": "streamable-http", "url": "https://usertrack.dev/mcp" }]` → `mcp-publisher publish`.
4. Paste the resulting listing URLs into `docs/MCP.md` under "Where to find it".

**Values required**
GitHub account with rights to publish under an `io.github.<org>/usertrack` (or DNS-verified `dev.usertrack/…`) namespace.

**Where to enter them**
The registry CLIs / web forms above (nothing in the codebase).

**Status**
* [ ] Pending

---


### Remove the leftover Better Auth smoke-test account (optional)

**Why this is needed**
The production smoke test on 2026-09-02 verified the Better Auth integration end to end (real signed pull through a temporary tunnel, first sync, live events); the verified test project was deleted afterwards. One earlier attempt left a throwaway founder account (`ba-*@example.com`, project "BA SaaS …", private, never synced, integration still *awaiting verification* — it is skipped by the scheduler and invisible publicly). The agent cannot delete another account's project.

**Where**
Convex dashboard → usertrack → Production → Data → `saas` (filter name "BA SaaS") and the matching `integrations` row, or leave it.

**Status**
* [ ] Optional

---

### Decide what to do with the demo listings

**Why this is needed**
Production still contains the 5 labelled demo products (owner `@demo`) seeded for the MVP so the board is not empty. They are marked "Demo", never ranked, excluded from trending ranks, benchmarks, milestones, **all emails**, and the API's `demo: false` filter is available. Keep them until the first real listings arrive, or remove them now.

**Steps**
1. To remove: `npx convex run --prod seed:clear`
2. To keep: nothing to do.

**Status**
* [ ] Decide

---

## Optional / Future

### CI deploy key for Convex

Today Convex production is deployed from a logged-in laptop (`npx convex deploy`). To deploy from Railway/CI: Convex dashboard → Production → Settings → Deploy keys → Generate; Railway → Variables → `CONVEX_DEPLOY_KEY`; change `railway.toml` `buildCommand` to `pnpm railway:build`. **Status** [ ] Optional

### Edge rate limiting for the public API and MCP

Per-key / per-token daily quotas live in Convex (`apiUsage`, survive deploys). The burst buckets (60 req/min per IP anonymous, 120/min per API key, 60 tool calls/min per MCP token) are in-process and reset on deploy, which is fine for one Railway replica. If you scale to multiple replicas or get abused, put Cloudflare (or Railway's proxy rules) in front of `/api/v1/*` and `/mcp`. No code change needed. **Status** [ ] Optional

### Stripe sandbox key — live end-to-end test of the conversion adapter

**Why this is needed**
The Stripe conversion adapter (`convex/providers/stripe.ts`: subscriptions by status → trial / converted users, no amounts) is unit-tested against Stripe's documented response shape. A live read against a real (sandbox) account would confirm pagination and status handling end to end. The agent can read your Stripe accounts through the Stripe MCP servers but cannot create API keys, and a restricted key is what UserTrack needs.

**Where**
Stripe Dashboard → the **SEOMap sandbox** (or any test-mode account) → Developers → API keys

**Steps**
1. Create restricted key → name `usertrack-e2e` → Permissions: **Subscriptions: Read**, everything else None.
2. In UserTrack (`https://usertrack.dev/app` → your product → Integrations → Conversion → Stripe) paste the `rk_test_…` key, "Converted means" = Active paid, click **Test connection**, then Save.
3. Check the Conversion group on the dashboard ("Healthy", converted / trial counts) and the Sync log. Delete the key afterwards if you don't keep the integration.

**Required value**
`rk_test_…` (restricted, read-only) — stored only in `integrations.config`, never displayed again.

**Where to enter it**
UserTrack dashboard (or MCP `usertrack_configure_integration` with `role: "conversion"`).

**Status**
* [ ] Optional

---

### Provider credentials for end-to-end testing

Clerk, Supabase (API + read-only database mode), Firebase (createdAt scan), PostgreSQL (Node runtime, wizard introspection), Auth0, PostHog, Plausible, GA4, Stripe, RevenueCat, Paddle, Lemon Squeezy and Chargebee adapters are unit-tested against recorded API shapes and SQL builders, not live accounts — the agent has no third-party credentials. For RevenueCat the founder needs a v2 secret key with only *Charts & Metrics → Read* and the project ID; for Paddle / Lemon Squeezy / Chargebee a read-only API key. All conversion adapters are read-only by construction and never request amounts. To exercise them for real: connect one of your own products through the dashboard wizard ("Test connection" runs a live read before anything is stored) or via MCP `usertrack_verify_integration`, and watch the SaaS "Sync log" panel. Known assumptions: Auth0 `per_page=0` on `/api/v2/users`; Firebase signup windows need ≤ 100k accounts (larger projects fall back to snapshot deltas and are labelled so). **Status** [ ] Optional

### Benchmarks need real cohorts

Benchmark cards and the public "Top X% …" statement only appear once a cohort (all / category / category × size / size bucket / platform / age) has at least **10** verified, non-demo products (`MIN_SAMPLE` in `convex/lib/benchmarks.ts`, raised from 5 in v0.9). Nothing to configure — this is a reminder that the dashboard shows "Not enough benchmark data yet" until enough founders have connected; the weekly benchmark history and the "up from Top 27 % last month" sentences start accumulating from the first day a cohort exists. **Status** [ ] Nothing to do

### Legal pages

No privacy policy / terms page yet. UserTrack stores founder email + password or Google account id/name/avatar (Better Auth), provider API keys (stored server-side in Convex, never returned to the dashboard, the API or an agent), email preferences, an email delivery log (recipient, type, status, Resend message id — never content or auth tokens) and aggregate counts only. A short privacy page is recommended before public launch and required by Google before the OAuth consent screen can leave "Testing". **Status** [ ] Recommended
