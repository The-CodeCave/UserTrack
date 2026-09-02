# UserTrack Human To-Do

Everything the agent could not complete autonomously because it needs an external account, credential, DNS access or a human decision. Developer work is **not** listed here — it is done, tested and deployed.

Last updated: 2026-09-02 (v0.6: Better Auth native integration + `@usertrack/better-auth`; v0.5: lifecycle model Growth → Activation → Conversion, conversion providers Stripe / RevenueCat / Paddle / Lemon Squeezy / Chargebee, identity + cohorts, visibility model, mobile projects, API/MCP extensions).

**v0.6 (Better Auth) needs no new human action for production.** The provider, credentials, verification, sync, events route, dashboard wizard, MCP tools and docs are deployed and smoke-tested; no new UserTrack-side environment variable is required (`UT_GATEWAY_SECRET` was already set). What *does* need a human is **publishing the npm package** — until `@usertrack/better-auth` is on npm, `npm install @usertrack/better-auth` fails for founders (the plugin itself works from a `pnpm pack` tarball or the repository). Every publish step is listed in **`packages/better-auth/HUMAN_TODO.md`** (claim the `@usertrack` npm scope, first manual publish of `0.1.0`, trusted publishing / `NPM_TOKEN` for the tag-driven workflow, Better Auth community-plugin PR). Cross-reference only — those items are not repeated here.

**v0.5 needs no new human action for production.** Everything in this phase is configured and deployed by the agent: the Convex schema migration (`migrations:lifecycleV1`, ran to `done` on production on 2026-09-02), `IDENTITY_SALT` on both Convex deployments, the demo seed refresh (the 5 demo products now carry labelled, never-synced demo sources for users / activation / conversion so the public funnel, cohorts and conversion boards are demonstrable), rerank and daily sweep. Production was verified after the Railway deploy: `/s/demo-northwind`, `/best-conversion`, `/api/v1/saas/{slug}/funnel|conversion|engagement|cohorts`, `/api/openapi.json` (15 paths) and `/mcp` (27 tools) all respond. Payment-provider credentials (Stripe restricted keys, RevenueCat v2 keys, Paddle / Lemon Squeezy / Chargebee API keys) are entered **by each founder** for their own product in the dashboard or via MCP — they are not operator secrets and nothing is required from you. The only optional item is a sandbox key for a live end-to-end test of the Stripe adapter (see "Optional / Future").

**v0.4 needed no new human action.** Everything in this phase (PostgreSQL / Supabase / Clerk / Firebase providers, activation + funnel, Trending Score v2, discovery feed, share cards + embeds, benchmarks, compare, API + MCP) is configured and deployed. The items below are unchanged from earlier phases; the domain item is now the most important one because every share card, embed snippet and MCP config snippet renders the Railway URL until `usertrack.dev` points at production.

## Critical Before Production

### Resend — verify `mail.usertrack.dev` and add the API key

**Why this is needed**
The whole email system (welcome, verification, password reset, setup reminders, integration alerts, milestones, spike alerts, monthly report, weekly digest) is implemented and deployed. It sends from `UserTrack <noreply@mail.usertrack.dev>` through Resend. Until `RESEND_API_KEY` exists on the Convex production deployment, every email is **logged as `failed: email not configured`** in the `emailEvents` table and nothing is sent — sign-up, sign-in and the app keep working, but users get no welcome mail and **password reset by email does not work**.

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
* [ ] Pending

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

Benchmark cards and the public "Top X% …" statement only appear once a cohort (all / category / size bucket) has at least 5 verified, non-demo products (`MIN_SAMPLE` in `convex/lib/benchmarks.ts`). Nothing to configure — this is a reminder that the dashboard shows "Not enough benchmark data yet" until enough founders have connected. Consider raising the threshold to 10 once the public set is larger. **Status** [ ] Nothing to do

### Legal pages

No privacy policy / terms page yet. UserTrack stores founder email + password or Google account id/name/avatar (Better Auth), provider API keys (encrypted at rest by Convex), email preferences, an email delivery log (recipient, type, status, Resend message id — never content or auth tokens) and aggregate counts only. A short privacy page is recommended before public launch and required by Google before the OAuth consent screen can leave "Testing". **Status** [ ] Recommended
