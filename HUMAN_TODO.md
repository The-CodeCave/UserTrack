# UserTrack Human To-Do

Everything the agent could not complete autonomously because it needs an external account, credential, DNS access or a human decision. Developer work is **not** listed here — it is done, tested and documented.

Last updated: 2026-09-04 · code state: **v1.0 launch hardening complete** (SEC-1..3, LEGAL-1..2, ANALYTICS-1, AUTH-1, PROFILE-1, IMPORT-1, SOCIAL-1, OPS-1..3, SHIP-1 — see `docs/RELEASE-v1.0.md`). Nothing is deployed: the v1.0 commits are on `main` locally and have **not** been pushed or shipped.

**TL;DR** — the code is launch-ready; 13 human steps stand between it and production. Do the *Required* list below **in order** — each one is a link to the detailed section further down, which has the exact commands and values. Everything under *Recommended* can wait until after launch. A separate branch `waitlist` (worktree `../UserTrack-waitlist`) holds an interim standalone waitlist app under `apps/waitlist/`, deployed as its own Railway service; it is not merged into `main` and is not part of this release.

---

## Launch checklist

### Required — in this order

| # | Step | Why it is here | Where the details are |
|---|---|---|---|
| 1 | **Confirm `UT_GATEWAY_SECRET` on both sides** | Since SEC-1 the gateway **fails closed**: if the value is missing or different on either side, every API key, MCP call, badge, embed and native event is rejected. It was set in v0.6 — this is a verification, not a new secret. | below, *1. Gateway secret* |
| 2 | **`RESEND_API_KEY` on Convex prod** | Since SEC-1 email+password accounts must verify their address before they can sign in. Without the key every new password sign-up is stuck at "Check your inbox". Google/GitHub/X sign-in is unaffected. | *Resend — verify `mail.usertrack.dev` and add the API key* |
| 3 | **`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`** | "Continue with GitHub" renders disabled until the OAuth App exists. | *GitHub sign-in + X sign-in callback (AUTH-1)* |
| 4 | **X callback + email permission on the existing X app** | Adds "Continue with X" (Better Auth `twitter`) to the existing Connect X app; no new variable. Without the email permission X sign-in fails with a clear `email_not_found`. | *GitHub sign-in + X sign-in callback (AUTH-1)* |
| 5 | **`TRUSTMRR_API_KEY` on Convex prod** | "Import from TrustMRR" shows "Not configured" and the MCP tool answers `not_configured` without it. Also: run one real import and paste the JSON into the fixtures (the mapper is written against the published example, not a live response). | *TrustMRR operator API key (IMPORT-1)* |
| 6 | **Rybbit goals + funnels (incl. `waitlist_join`)** | Rybbit has no API for goals/funnels. Without them every funnel in the dashboard stays empty — including the waitlist phase. | *Rybbit — site settings, goals, funnels and API key (ANALYTICS-1)* |
| 7 | **Google OAuth consent screen with `/privacy` + `/terms`** | Both pages exist since LEGAL-1. Google needs them before the app can leave "Testing" (100 manually added users). | *Google sign-in — create the OAuth client*, step 2 |
| 8 | **Lawyer review of the legal texts** | `/impressum`, `/privacy`, `/terms` were written by an agent from the code. They are accurate about the software; they are not legal advice. | *Legal pages — lawyer review + effective date (LEGAL-1)* |
| 9 | **`npx convex deploy --yes`** + one manual `leaderboard:rerank` | Backend first: new tables (`profilePrefills`, `publicStats`, `jobRuns`, `rankScratch`), 30 new indexes, the `@convex-dev/rate-limiter` component, the new crons and functions. The rerank materializes `growth24hPct` on rows listed before v1.0, without which the 24h "fastest growing" board is short until the first cron. | *9. Deploy Convex* |
| 10 | **`npx convex run --prod migrations:nativeV1`** | The one migration that may still be pending from v0.7. Idempotent and paged — safe to run again. | *10. Run the pending migration* |
| 11 | **`railway up --service usertrack --ci`** | Then the app. Also: set the Railway health-check path to `/api/health` (OPS-3 changed it in `railway.toml`; a service created with the path in the dashboard needs it there too). | *11. Deploy the app* |
| 12 | **Domain / DNS** (+ `UT_TRUST_CF_HEADERS`) | `usertrack.dev` has Cloudflare nameservers but **no A/CNAME record**, so nothing resolves. During the interim phase point it at the **waitlist** service, then switch the record to the main app. The moment the record is **proxied** (orange cloud), set `UT_TRUST_CF_HEADERS=1` on Railway or every visitor shares one rate-limit bucket. | *12. Domain / DNS (interim waitlist → main app)* |
| 13 | **Post-deploy checks** | Health, headers, one real sign-up, one real import, one real X connect. | *13. Post-deploy checks* |

### Recommended — after launch

| Step | Why | Where |
|---|---|---|
| **Sentry EU project + `NEXT_PUBLIC_SENTRY_DSN`** | Without a DSN the SDK is never initialised or downloaded — crashes render the branded error boundary but nobody is notified. | *Sentry — create the EU project and set the DSN (OPS-3)* |
| **Convex → Sentry log stream** | Backend function errors land in the same project. | *Optional: Convex → Sentry log stream (OPS-3)* |
| **Cloudflare cache rules** | OPS-2 already sends `Cache-Control: public, s-maxage=300` on every public route; a "Cache Everything" rule makes Cloudflare honour it. | *Cloudflare "Cache Everything" for `/api/v1/*` and `/s/*` (OPS-2, optional)* |
| **npm publishes** (`@usertrack/protocol` → `@usertrack/node` → `@usertrack/better-auth`) | Until then founders install the SDK from a `pnpm pack` tarball. Order matters: the plugin depends on the other two. | `packages/node/HUMAN_TODO.md`, `packages/better-auth/HUMAN_TODO.md` |
| **Search Console + directory submissions** | Only worth doing once the domain resolves. | *Search Console: submit the new public pages*, *Submit the UserTrack MCP server to agent directories* |
| **Decide on the demo listings** | The 5 `demo-*` products stay in production until `npx convex run --prod seed:clear`. | *Decide what to do with the demo listings* |

---

### 1. Gateway secret

**Why** — `convex/lib/gateway.ts` compares `UT_GATEWAY_SECRET` in constant time and rejects the call when it is missing on either side (SEC-1, fail closed). Symptom of a mismatch: the public API and MCP answer `502` / `internal`, `/api/health?deep=1` reports `"convex":"down"`, badges and embeds stop rendering.

```bash
npx convex env get --prod UT_GATEWAY_SECRET     # must print a value
railway variables --service usertrack | grep UT_GATEWAY_SECRET
```
Both must be **byte-identical**. If it was never set, or you rotate it, set both within the same minute:
```bash
SECRET=$(openssl rand -hex 32)
npx convex env set --prod UT_GATEWAY_SECRET "$SECRET"
railway variables --service usertrack --set "UT_GATEWAY_SECRET=$SECRET"
railway up --service usertrack --ci
```

**Status** — * [ ] Verify (already set in v0.6; nothing to create)

---

### 9. Deploy Convex

**Why** — the app calls functions that do not exist on the current production deployment (`public.boardRows`, `public.stats`, `jobs.health`, `retention.sweep`, `trustmrr.*`, `social.refreshNow`, `account.*`, `rateLimits.check`). Deploy the **backend first**, then the app — the other order produces 404s on those functions until the app deploy finishes.

```bash
npx convex env list --prod           # UT_GATEWAY_SECRET + RESEND_API_KEY present (steps 1 and 2)
npx convex deploy --yes
```
Adds four tables (`profilePrefills`, `publicStats`, `jobRuns`, `rankScratch`), 30 indexes, the `@convex-dev/rate-limiter` component tables and optional fields on `saas` / `profiles`. **Nothing is removed or renamed**, so the currently deployed app keeps working while this runs. Rollback: `npx convex deploy --yes` from the previous commit (`docs/RELEASE-v1.0.md` → Rollback).

Then, in the same session, kick one ranking pass by hand:
```bash
npx convex run --prod leaderboard:rerank '{}'
```
**Why it cannot wait for the cron** — the board indexes sort on materialized fields, and `saas.growth24hPct` is only written by a rerank. Every product listed before v1.0 therefore has no key on `by_public_growth24h` and sorts last, so `/fastest-growing-saas?window=24h` stays short until the first rerank after deploy. The next cron (`20 */4 * * *`) fixes it within four hours anyway; running it manually makes the first public hour correct. The command returns immediately — it starts a scheduler chain; watch `jobRuns` in the dashboard (`job = "rerank leaderboard"`, `finishedAt` set, `errors = 0`) and confirm `rankScratch` is empty afterwards.

**Status** — * [ ] Pending

---

### 10. Run the pending migration

**Why** — `migrations:nativeV1` rewrites v0.6-era `better_auth` integrations to `native` + `source: "better-auth"` including their snapshot / sync-run provenance. Rows are normalised on read until it runs, so this is not urgent — but it should not stay pending forever. It is idempotent and paged.

```bash
npx convex run --prod migrations:nativeV1
# → {"status":"done", ...}; run it again if it reports a cursor
```

**Status** — * [ ] Pending (skip if it already reports `done`)

---

### 11. Deploy the app

```bash
railway up --service usertrack --ci
```
Then, **once**: Railway → project `usertrack` → service `usertrack` → Settings → Deploy → **Health check path = `/api/health`** (OPS-3 moved it from `/leaderboard`; `railway.toml` already says so, but a dashboard-set path overrides the file). `/api/health` answers without reading Convex, so a Convex blip no longer restarts the service.

**Status** — * [ ] Pending

---

### 12. Domain / DNS (interim waitlist → main app)

**Why** — `usertrack.dev` uses Cloudflare nameservers but has **no A or CNAME record**, so the name does not resolve at all. Two phases:

**Phase A — interim waitlist** (do this now)
1. Railway → service **`usertrack-waitlist`** → Settings → Networking → Custom Domain → add `usertrack.dev` (+ `www.usertrack.dev`). Railway prints a CNAME target.
2. Cloudflare → `usertrack.dev` → DNS → add
   `CNAME  @    usertrack-waitlist-production.up.railway.app`  (or the exact target Railway prints)
   `CNAME  www  usertrack-waitlist-production.up.railway.app`
   Proxy status **DNS only** until Railway issues the certificate (`.dev` is HSTS-preloaded, HTTPS is mandatory); switch to proxied afterwards with SSL mode **Full (strict)**.
3. Leave the main app on `usertrack-production.up.railway.app`.

**Phase B — switch to the main app** (when you launch)
1. Remove the custom domain from `usertrack-waitlist`, add it to service `usertrack`.
2. Repoint both CNAMEs at the target Railway prints for `usertrack`.
3. ```bash
   railway variables --service usertrack --set "NEXT_PUBLIC_SITE_URL=https://usertrack.dev"
   railway variables --service usertrack --set "NEXT_PUBLIC_RYBBIT_SITE_ID=753f44fa9c50"
   npx convex env set --prod SITE_URL https://usertrack.dev
   railway up --service usertrack --ci     # the public URL is baked into the client bundle
   ```
4. Update the exact-match callbacks that contain the host: Google (`https://usertrack.dev/api/auth/callback/google`), GitHub (`/api/auth/callback/github`), X (`/api/auth/callback/twitter` **and** `/api/social/x/callback`).
5. Google Search Console → add property `usertrack.dev` → submit `https://usertrack.dev/sitemap.xml`.

**Phase C — trust the Cloudflare client-IP headers** (the moment the DNS record is switched from *DNS only* to **proxied / orange cloud**, for either service)

```bash
railway variables --service usertrack --set "UT_TRUST_CF_HEADERS=1"   # then redeploy / restart
```

Behind a proxied record the last `x-forwarded-for` hop is Cloudflare's own address, so without this flag every visitor
shares one rate-limit bucket (60 anonymous API requests per minute for the whole internet). With it, `clientIp()` reads
`cf-connecting-ip` / `true-client-ip` first. **Do not set it while the record is grey-cloud / DNS only** — the origin is
then reachable directly and anyone can forge those headers. Unset it again if you ever turn the proxy off.

Everything else (OG images, badges, embed snippets, MCP config snippets, email links, the OpenAPI server URL) renders `NEXT_PUBLIC_SITE_URL` / `SITE_URL` and becomes correct automatically.

**Status** — * [ ] Phase A pending · * [ ] Phase B pending · * [ ] Phase C pending (`UT_TRUST_CF_HEADERS=1` when the record is proxied)

---

### 13. Post-deploy checks

```bash
# health + headers
curl -s https://usertrack.dev/api/health                       # {"ok":true,"version":"<sha>","uptime":N}
curl -s "https://usertrack.dev/api/health?deep=1"              # + "convex":"ok" and a jobs array
curl -sI https://usertrack.dev/leaderboard                     # HSTS · CSP · X-Frame-Options: DENY · Cache-Control: public, s-maxage=300
curl -sI https://usertrack.dev/api/v1/leaderboard              # x-ratelimit-limit / -remaining / -window
curl -sI https://usertrack.dev/api/badge/demo-northwind.svg    # frame-ancestors * (badges must stay embeddable)
```
Then, in the browser:
1. **Sign-up e2e**: create a real account with email+password → the verification mail arrives (Resend → Emails shows *Delivered*) → the link signs you in → onboarding → publish → `/s/<slug>` renders with an `og:image`.
2. **One real import**: project settings → *Import from TrustMRR* → paste a real startup URL → Apply. Then paste the observed JSON into `convex/lib/trustmrr.fixtures.ts` and re-run `pnpm test` (step 5).
3. **One real X connect**: `/app/settings/social` → Connect X → the handle and the follower count appear → *Refresh now* once.
4. Convex dashboard → Data → `jobRuns`: after the next 03:30 UTC daily sweep there is one row per job with `finishedAt` and `errors: 0`, including `retention sweep`.
5. Convex dashboard → Data → `publicStats`: one row, written by the next `rerank leaderboard` (every 4 h). Until then the directory counters render zero.

**Status** — * [ ] Pending

---

## Detailed sections

The tables above link into these. They also carry the earlier phases' items; anything already done is marked as such.



## v0.9 — Discovery, datasets, webhooks

### Search Console: submit the new public pages (after the domain is live)

**Why**
v0.9 adds high-intent pages (`/hidden-gems`, `/biggest-movers`, `/fastest-growing-developer-tools`, `/fastest-growing-mobile-apps`, `/best-activation-rate-saas`, `/best-converting-mobile-apps`, `/rankings/*`, `/developers/webhooks`) and dataset endpoints. They are in the sitemap and have canonicals, metadata, JSON-LD and methodology sections, but until `usertrack.dev` points at the main app (Launch checklist step 12, phase B) every canonical renders the Railway hostname and nothing is worth submitting.

**Where**
Google Search Console → property `usertrack.dev` (created in Launch checklist step 12) · Bing Webmaster Tools (optional)

**Steps**
1. Finish Launch checklist step 12 phase B (sets `NEXT_PUBLIC_SITE_URL` / `SITE_URL`, redeploys).
2. Search Console → Sitemaps → submit `https://usertrack.dev/sitemap.xml` (it already lists the new pages and, from the first month on, the `/rankings/<year>/<month>/<category>` archives).
3. URL inspection → request indexing for `/discover`, `/hidden-gems`, `/biggest-movers`, `/fastest-growing-mobile-apps`, `/developers/webhooks`.
4. After a week, check Coverage for "Duplicate, Google chose different canonical" — every board page uses its bare path as canonical on purpose; filter combinations (`?window=`, `?size=`, `?platform=`) are not separate canonicals.

**Required values** — none. **Where to enter them** — Search Console UI.

**Status**
* [ ] Pending (blocked by Launch checklist step 12, phase B)

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
`tweet.read`, `tweet.write`, `users.read`, `offline.access` (requested by the app; the portal permission level must allow write). `users.read` also covers the follower count (SOCIAL-1, `public_metrics` on `/2/users/me`, free tier) — nothing extra to enable. Verify after connecting: the settings page shows `𝕏 <count> followers · refreshed just now`, `/u/<username>` shows "followers on X", and `npx convex run --prod social:refreshFollowers` returns `{ refreshed: ≥1, failed: 0 }`.

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
   - Privacy policy `https://usertrack.dev/privacy` and Terms `https://usertrack.dev/terms` links (both live since LEGAL-1) are required for the app to leave "Testing" — paste them, then **Publish app**. While in "Testing" only up to 100 test users you add manually can sign in.
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
5. Make sure `SITE_URL` on Convex prod is exactly `https://usertrack.dev` (the redirect URI is derived from it and must match Google byte for byte). See Launch checklist step 12.
6. Test: `https://usertrack.dev/sign-in` → Continue with Google → `/app/onboarding` (new user) or `/app` (existing).

**Values**
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

**Where to put them**
Convex dashboard → usertrack → Development *and* Production → Settings → Environment Variables

**Status**
* [ ] Pending

---

### TrustMRR operator API key (IMPORT-1)

**Why this is needed**
"Import from TrustMRR" (new / edit project forms, MCP `usertrack_import_from_trustmrr`) reads a startup's public profile through the TrustMRR API with **one operator key** — founders never enter a key. Without `TRUSTMRR_API_KEY` the button is disabled ("Not configured") and the MCP tool returns `not_configured`. Creating a key requires accepting TrustMRR's API Acceptable Use Policy (prefilling a founder's own profile is normal use; bulk republication is not — the import stores nothing on its own and only the founder's Apply / save writes the profile).

**Where**
https://trustmrr.com/dashboard-dev (TrustMRR account → developer dashboard → create API key; keys start with `tmrr_` and are shown once)

**Steps**
1. Create the key (standard tier = 10 requests / minute, which matches the built-in `trustmrrGlobal` limit).
2. Set it on Convex (the fetch runs in a Convex action, not on Railway):
   ```bash
   npx convex env set --prod TRUSTMRR_API_KEY "tmrr_xxxxxxxxxxxxxxxxxxxxxxxx"
   npx convex env set        TRUSTMRR_API_KEY "tmrr_xxxxxxxxxxxxxxxxxxxxxxxx"   # dev — replaces the placeholder value `fixture`
   ```
   No redeploy needed — `trustmrr.status` flips to `configured: true` and the button enables.
3. Confirm the response shape once: sign in, open any project → Settings · Details → Import from TrustMRR → `https://trustmrr.com/startup/shipfast` → the preview should list name, description, website, logo, category, markets, tech stack, channels, cofounders, country, funding, team size, founded, value proposition, problem, audience, pricing model. Then fetch the raw JSON and paste it over `DOCS_SHAPE` in `convex/lib/trustmrr.fixtures.ts` (keep the revenue keys — the test proves they are ignored):
   ```bash
   curl -s https://trustmrr.com/api/v1/startups/shipfast -H "Authorization: Bearer tmrr_…" | jq .
   pnpm test convex/lib/trustmrr.test.ts
   ```
   If a test fails, the live shape differs from the docs — adjust the expectations, not the mapper's tolerance (docs/ASSUMPTIONS.md A173).

**Values**
`TRUSTMRR_API_KEY` (Convex dev + prod). Never commit it; never put it in Railway.

**Status**
* [ ] Pending

---

### GitHub sign-in + X sign-in callback (AUTH-1)

**Why this is needed**
"Continue with GitHub", "Continue with X" and Settings → Connected accounts are deployed and feature-flagged: a provider whose credentials are missing on the Convex deployment is rendered disabled. GitHub needs its own OAuth App. X reuses the app from *Create X Developer App* above (`X_CLIENT_ID` / `X_CLIENT_SECRET`) — it only needs one more callback URL and the email permission. A GitHub or X sign-up prefills the founder profile (handle + avatar, editable).

**Where**
GitHub → Settings → Developer settings → OAuth Apps → New OAuth App (https://github.com/settings/developers) · X Developer Portal → your app → User authentication settings

**Steps**
1. GitHub OAuth App: Application name `UserTrack`, Homepage URL `https://usertrack.dev`, Authorization callback URL `https://usertrack.dev/api/auth/callback/github`. A GitHub OAuth App accepts one callback URL, so while the domain is pending create a second app (`UserTrack (Railway)`) with `https://usertrack-production.up.railway.app/api/auth/callback/github`, and a third for local dev (`http://localhost:3000/api/auth/callback/github`) if you want it. Generate a client secret.
2. Set the values on Convex (Better Auth runs inside Convex, not Railway):
   ```bash
   npx convex env set --prod GITHUB_CLIENT_ID     "Ov23lixxxxxxxxxxxxxx"
   npx convex env set --prod GITHUB_CLIENT_SECRET "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   npx convex env set GITHUB_CLIENT_ID     "…"   # dev (the local-dev app)
   npx convex env set GITHUB_CLIENT_SECRET "…"
   ```
   No redeploy needed — `auth.providers.github` flips to true and the button enables.
3. X: in the existing app add a second **Callback URI** `https://usertrack.dev/api/auth/callback/twitter` (keep `/api/social/x/callback`), and under **App permissions** tick **Request email from users** (X requires the Terms and Privacy URLs for that: `https://usertrack.dev/terms`, `https://usertrack.dev/privacy`). Without the permission X never shares an email: a *sign-up* with X then fails with the message "X did not share an email address…", while *linking* X from Settings still works for users who signed up another way.
4. Test: `/sign-in` → Continue with GitHub → `/app/onboarding` shows the GitHub handle and avatar prefilled · `/app/settings` → Connected accounts → Connect X → the row shows "Connected" · Disconnect is disabled while it is the only sign-in method.

**Values**
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (Convex dev + prod). X: no new variable.

**Status**
* [ ] Pending

---

### Legal pages — lawyer review + effective date (LEGAL-1)

**Why this is needed**
`/impressum`, `/privacy` and `/terms` exist and are linked from every footer and the sign-up form (agent-written, based on the code and on https://thecodecave.de/impressum). Google's OAuth consent screen needs the two URLs to leave "Testing" (see the Google item above). The texts have **not** been reviewed by a lawyer.

**Steps**
1. Have a lawyer review `src/app/(public)/impressum/page.tsx`, `src/app/(public)/privacy/page.tsx`, `src/app/(public)/terms/page.tsx` — in particular the liability clause (§ 521 BGB-style), the Köln venue, the CC BY 4.0 licence for public growth data and the processor list (Convex, Railway, Resend, Cloudflare, Google, GitHub, X, self-hosted Rybbit). Sign the DPAs / SCCs with Convex, Railway and Resend if not yet done.
2. Confirm the effective date: `EFFECTIVE_DATE` in `src/lib/legal.ts` (currently `2026-09-04`) — set it to the launch date, `pnpm build`, deploy.
3. Google Cloud Console → OAuth consent screen → Privacy policy `https://usertrack.dev/privacy`, Terms `https://usertrack.dev/terms` → Publish app.
4. If the Impressum data changes, change it on thecodecave.de first and mirror it in `OPERATOR` (`src/lib/legal.ts`).

**Status**
* [ ] Lawyer review pending · [ ] Effective date confirmed · [ ] Google links pasted

---

### Point usertrack.dev at production (Cloudflare)

**Moved** — this is now step **12. Domain / DNS (interim waitlist → main app)** in the *Launch checklist* at the top, which
covers both phases: point `usertrack.dev` at the interim waitlist service first, then switch the record to the main app and
update `NEXT_PUBLIC_SITE_URL` / `SITE_URL` and the exact-match OAuth callbacks. State as of 2026-09-04: Cloudflare
nameservers exist, **no A or CNAME record does**, so the name does not resolve.

---

### `hello@usertrack.dev` reply-to mailbox

**Why this is needed**
Every email sets `Reply-To: hello@usertrack.dev` (`EMAIL_REPLY_TO`, already configured). Replies land nowhere until that address exists. Options: Cloudflare **Email Routing** (free: Cloudflare → usertrack.dev → Email → Email Routing → route `hello@usertrack.dev` → your inbox; Cloudflare adds its own MX records on the **root** domain, which do not clash with Resend's `send.mail` MX) or Google Workspace. If you prefer no mailbox, `npx convex env set --prod EMAIL_REPLY_TO noreply@mail.usertrack.dev`.

**Status**
* [ ] Decide

---

### Rybbit — site settings, goals, funnels and API key (ANALYTICS-1)

**Why this is needed**
The tracker, the event catalog (`docs/ANALYTICS.md`) and the server-side events are deployed. Rybbit exposes no API for site settings, goals or funnels, and the script only takes skip / mask patterns as attributes — everything else is a dashboard toggle. Until the goals exist the events are collected but no conversion rate is shown.

**Where**
`https://rybbit.internal.thecodecave.de` → site **usertrack.dev** (id `753f44fa9c50`) → Settings / Goals / Funnels

**Steps**
1. **Site settings → Tracking**: SPA navigation **on**, initial page view **on**, outbound links **on**, web vitals **on**, error tracking **on**, autocapture: button clicks **on**, form submissions **on**, copy **on**, input changes **off**; URL parameters **off**; **Session replay OFF** (the privacy policy promises this); Track IP **off**; User-ID salting **on**; Block bot traffic **on**.
2. **Traffic filtering → Hostname exclusions**: add `localhost*`. Since FIX-1 local dev / CI / preview builds send nothing at all (the production site id is only implied for a production build of `https://usertrack.dev`), so this is now belt and braces for anyone who sets `NEXT_PUBLIC_RYBBIT_SITE_ID` locally.
3. **Goals → Create goal** (name · type · value):
   | Name | Type | Value |
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
   | Joined the waitlist | Custom event | `waitlist_join` |

   `waitlist_join` comes from the interim waitlist app on the `waitlist` branch (own Railway service, same Rybbit site), so the interim phase and the launched app are measured in one place. Create the goal even before the waitlist is live — an unused goal costs nothing.
4. **Funnels → Create funnel**:
   | Funnel | Steps |
   |---|---|
   | Founder activation | page `/` → page `/sign-up` → event `onboarding_completed` → event `project_created` → event `integration_connected` → event `project_published` |
   | Developer | page `/developers` → event `token_created` → event `mcp_tool_called` |
5. **API key** (Site settings → API keys → create, name `usertrack-server`) so server-side events bypass bot detection / domain validation:
   ```bash
   railway variables --service usertrack --set "NEXT_PUBLIC_RYBBIT_SITE_ID=753f44fa9c50"   # belt and braces: FIX-1 only infers it for a production build of https://usertrack.dev
   railway variables set RYBBIT_API_KEY=rb_xxx            # Next.js server events (api_request, mcp_tool_called, badge_rendered, embed_rendered, native_event_ingested)
   npx convex env set --prod RYBBIT_SITE_ID 753f44fa9c50   # enables webhook_delivered + sync_completed from Convex
   npx convex env set --prod RYBBIT_API_KEY rb_xxx
   ```
6. Verify: open https://usertrack.dev, then Rybbit → Realtime shows the page view; `curl https://usertrack.dev/api/v1/categories` → an `api_request` event appears under Events within a minute.

**Legal note for the lawyer review (LEGAL-1 item above)**
`identify()` stores the pseudonymous Better Auth user id in the visitor's local storage while signed in (cleared on sign-out). `/privacy` §7 + §8 describe it; counsel should confirm this stays within the consent-free § 25 TDDDG / Art. 6(1)(f) reading. If not, remove `<AnalyticsIdentity/>` from `src/app/layout.tsx` — nothing else depends on it.

**Values**
`NEXT_PUBLIC_RYBBIT_SITE_ID=753f44fa9c50` + `RYBBIT_API_KEY` (Railway), `RYBBIT_SITE_ID=753f44fa9c50` + `RYBBIT_API_KEY` (Convex prod)

**Status**
* [ ] **Required** — without the goals the funnels in the dashboard stay empty

---

## Recommended

### Sentry — create the EU project and set the DSN (OPS-3)

**Why**
Errors in production are currently only visible in Railway's log stream. `@sentry/nextjs` is wired for the browser, the Node server and the edge runtime, but it is feature-flagged on the DSN: **without `NEXT_PUBLIC_SENTRY_DSN` the SDK is never initialised and never even downloaded**, so nothing is reported until a human creates the project. Only a human can create a Sentry account.

**Where**
https://sentry.io → sign up / log in with the **EU data region** (`https://<org>.sentry.io`, ingest host `*.ingest.de.sentry.io` — the CSP allows exactly that host) → Projects → Create project → platform **Next.js** → name `usertrack`.

**Steps**
1. Create the organisation in the **EU** region (the region cannot be changed later) and the `usertrack` project.
2. Copy the DSN (Project → Settings → Client Keys (DSN)).
3. Railway → service `usertrack` → Variables:
   ```bash
   railway variables --service usertrack --set NEXT_PUBLIC_SENTRY_DSN="https://<key>@o<org>.ingest.de.sentry.io/<project>"
   ```
   That single variable covers the browser, the server and the edge runtime. Redeploy (a `NEXT_PUBLIC_*` value is baked into the build).
4. Optional, source maps: Sentry → Settings → Auth Tokens → create a token with `project:releases` + `org:read`, then add `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` **to the build environment only** (Railway variables, or GitHub Actions secrets if the build ever moves there). Without the token the build never talks to Sentry.
5. Verify: open any page, run `throw new Error("sentry smoke test")` in the browser console, and check the issue appears. Then confirm the scrubbing: the issue must have no request body, no cookies and no `Authorization` header, and any `?token=…` in the URL must read `token=[redacted]`.
6. Set `NEXT_PUBLIC_APP_VERSION` (optional) if the release name should be something nicer than the commit sha.

**Required values** — Sentry EU DSN (and optionally org / project / auth token). **Where to enter them** — Railway variables.

**Status**
* [ ] Pending (recommended before launch)

---

### Optional: Convex → Sentry log stream (OPS-3)

**Why**
Sentry above covers the Next.js side. Errors thrown inside Convex functions (crons, actions, mutations) are logged in the Convex dashboard; streaming them into the same Sentry project puts backend and frontend errors in one place. It is a dashboard-only setting — no code, no new UserTrack variable.

**Where**
Convex dashboard → your production deployment → **Settings → Integrations → Sentry** → paste the **same EU DSN** as above (optionally a separate `usertrack-convex` project, still EU) → save.

**Steps**
1. Convex dashboard → Production deployment → Settings → Integrations → Sentry → *Add integration* → paste the DSN → Save.
2. Trigger one failure (for example `npx convex run --prod jobs:health '{}'` without the gateway secret) and confirm the event arrives.
3. Optional: repeat for the dev deployment if backend errors during development are worth collecting.

**Required values** — the Sentry EU DSN. **Where to enter them** — Convex dashboard (not an env var).

**Status**
* [ ] Optional

---

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

Since SEC-2 every per-minute limit is durable in Convex (`@convex-dev/rate-limiter`, installed by the normal `npx convex deploy` — no dashboard step, no new env var) and keyed on the trusted client IP (last `x-forwarded-for` hop). Per-key / per-token daily quotas stay in `apiUsage`. Application-level limiting is not DDoS protection: if the app is flooded at the network layer, put Cloudflare (or Railway's proxy rules) in front of `/api/v1/*`, `/mcp`, `/api/badge/*` and `/embed/*`. No code change needed. **Status** [ ] Optional

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

---

### Cloudflare "Cache Everything" for `/api/v1/*` and `/s/*` (OPS-2, optional)

Every public page now answers with `Cache-Control: public, s-maxage=300, stale-while-revalidate=1800` and the JSON API with `public, s-maxage=300, stale-while-revalidate=600`, so any CDN in front of Railway caches them without further configuration. Cloudflare's *free* plan ignores `s-maxage` on HTML by default — it only caches static extensions — so if you want the HTML edge-cached too, add a Cache Rule once the domain is live:

```
# Cloudflare dashboard → Caching → Cache Rules → Create rule
Name:       UserTrack public HTML
Expression: (http.host eq "usertrack.dev" and not starts_with(http.request.uri.path, "/app")
             and not starts_with(http.request.uri.path, "/api/auth")
             and not starts_with(http.request.uri.path, "/sign-"))
Action:     Cache eligibility → Eligible for cache
            Edge TTL → Use cache-control header if present
            Browser TTL → Respect origin
```

Verify afterwards with `curl -sI https://usertrack.dev/leaderboard | grep -i cf-cache-status` (expect `HIT` on the second request). Do **not** add `/app`, `/sign-in`, `/sign-up`, `/api/auth/*` or `/api/account/export` — they carry session cookies.

**Status**
* [ ] Optional

---

### Split the sitemap once the directory passes 5,000 public products (OPS-2)

`public.sitemap` caps at 5,000 products (`SITEMAP_CHUNK` in `convex/public.ts`) and returns `hasMore: true` when it is full — one Convex query may read at most 8,192 documents, so the cap is a hard limit rather than a preference. Check it occasionally:

```bash
export PATH=/opt/homebrew/bin:$PATH
npx convex run --prod public:sitemap '{}' | head -c 200   # look for "hasMore": true
```

When it flips to `true`, split `src/app/sitemap.ts` with Next's `generateSitemaps` (one file per 5,000 URLs) and give `public.sitemap` a cursor argument; `/sitemap/:id.xml` then needs adding back to `CACHEABLE_PUBLIC` in `src/lib/public-cache.ts`.

**Status**
* [ ] Nothing to do yet

---

### Re-run the rerank once after deploying OPS-2 (production)

The new `publicStats` counters and the materialized `saas.growth24hPct` are written by the rerank job. It runs every 20 minutes on its own, so this is only to avoid one cycle of live-counted stats (identical numbers, just slower) and a 24-hour "fastest growing" board ordered from stale values:

```bash
export PATH=/opt/homebrew/bin:$PATH
npx convex run --prod leaderboard:rerank '{}'
npx convex data --prod publicStats          # one row, key "public"
```

**Status**
* [ ] Recommended right after the deploy

