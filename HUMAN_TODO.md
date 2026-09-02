# UserTrack Human To-Do

Everything the agent could not complete autonomously because it needs an external account, credential, or a human decision. Developer work is **not** listed here — it is done.

Last updated: 2026-09-02 (Google sign-in + usertrack.dev).

## Critical Before Production

### Google sign-in — create the OAuth client

**Why this is needed**
"Continue with Google" is implemented on `/sign-in` and `/sign-up` (Better Auth social provider, callback proxied through `/api/auth/callback/google`). It only works once Google knows the app: without `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on the Convex deployment the button sends users to a Google `invalid_client` error page. Email + password keeps working regardless.

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
   - Authorized JavaScript origins:
     - `https://usertrack.dev`
     - `http://localhost:3000`
   - Authorized redirect URIs (exact, no trailing slash):
     - `https://usertrack.dev/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google`
   - Copy **Client ID** and **Client secret**.
4. Set them on **both** Convex deployments (Better Auth runs inside Convex, not Railway):
   ```bash
   npx convex env set GOOGLE_CLIENT_ID        "xxx.apps.googleusercontent.com"   # dev
   npx convex env set GOOGLE_CLIENT_SECRET    "GOCSPX-xxx"
   npx convex env set --prod GOOGLE_CLIENT_ID     "xxx.apps.googleusercontent.com"
   npx convex env set --prod GOOGLE_CLIENT_SECRET "GOCSPX-xxx"
   ```
   No redeploy needed — Convex env changes apply immediately.
5. Make sure `SITE_URL` on Convex prod is exactly `https://usertrack.dev` (the redirect URI is derived from it and must match Google byte for byte). See the domain item below.
6. Test: open `https://usertrack.dev/sign-in` → Continue with Google → you land on `/app/onboarding` (new user) or `/app` (existing). Existing email+password users with the same Gmail address are linked automatically on first Google sign-in (Better Auth trusts Google's verified email).

**Value to provide**
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

**Where to put it**
Convex dashboard → usertrack → Development *and* Production → Settings → Environment Variables (or the CLI above)

**Status**
* [ ] Pending

---

### Point usertrack.dev at production

**Why this is needed**
The domain is decided: `usertrack.dev`. Public pages, OG images, badges, the API and — new — the Google OAuth redirect URI all depend on it. Until this is done the app lives on `usertrack-production.up.railway.app` and Google sign-in on production cannot be configured correctly.

**Where**
Railway → project `usertrack` → service `usertrack` → Settings → Networking → Custom Domain; your DNS provider (registrar for `usertrack.dev`).

**Steps**
1. Railway → Custom Domain → add `usertrack.dev` (and `www.usertrack.dev` if you want the redirect). Create the CNAME / ALIAS records Railway shows at your DNS provider. `.dev` is HSTS-preloaded, so HTTPS is mandatory — Railway issues the certificate automatically once DNS resolves.
2. Railway variables: `NEXT_PUBLIC_SITE_URL=https://usertrack.dev`.
3. Convex prod: `npx convex env set --prod SITE_URL https://usertrack.dev` (Better Auth base URL, trusted origin, OAuth redirect, digest links).
4. Redeploy so the URL is baked into the client bundle: `railway up --service usertrack --ci`.
5. Google Search Console → add property `usertrack.dev` → submit `https://usertrack.dev/sitemap.xml`.

**Value to provide**
Nothing — just perform the steps.

**Where to put it**
Railway → usertrack → Variables (`NEXT_PUBLIC_SITE_URL`); Convex prod env (`SITE_URL`)

**Status**
* [ ] Pending

---

## Recommended

### Enable weekly digest emails (Resend)

**Why this is needed**
The weekly growth digest is generated every Monday 08:00 UTC and is always readable in-app (`/app/digest`). Sending it by email needs a transactional email provider. Without these variables the sender logs `email not configured` and skips delivery — nothing breaks.

**Where**
Resend dashboard → https://resend.com

**Steps**
1. Create a Resend account (free tier is enough to start).
2. Domains → Add domain → add the DNS records Resend shows (SPF, DKIM, DMARC) at your DNS provider and wait for "Verified".
3. API Keys → Create API key with "Sending access".
4. Set the two variables on the **Convex production deployment** (the sender runs inside Convex, not Railway):
   ```bash
   npx convex env set --prod RESEND_API_KEY re_xxxxxxxx
   npx convex env set --prod DIGEST_FROM_EMAIL "UserTrack <digest@yourdomain.com>"
   ```
5. Optional test: `npx convex run --prod digest:generate` then check Resend → Emails.

**Value to provide**
`RESEND_API_KEY`, `DIGEST_FROM_EMAIL`

**Where to put it**
Convex dashboard → usertrack → Production → Settings → Environment Variables (or the CLI above)

**Status**
* [ ] Pending

---

### Decide what to do with the demo listings

**Why this is needed**
Production still contains the 5 labelled demo products (owner `@demo`) seeded for the MVP so the board is not empty. They are marked "Demo", never ranked, excluded from trending ranks, benchmarks, milestones and the API's `demo: false` filter is available. This is a product decision: keep them until the first real listings arrive, or remove them now.

**Where**
Terminal with Convex access.

**Steps**
1. To remove: `npx convex run --prod seed:clear`
2. To keep: nothing to do. They can be removed at any time with the same command.

**Status**
* [ ] Decide

---

## Optional / Future

### CI deploy key for Convex

**Why this is needed**
Today Convex production is deployed from a logged-in laptop (`npx convex deploy`). To deploy from Railway/CI instead, a deploy key is required.

**Steps**
1. Convex dashboard → usertrack → Production → Settings → Deploy keys → Generate.
2. Railway → usertrack → Variables → add `CONVEX_DEPLOY_KEY`.
3. Change `railway.toml` `buildCommand` to `pnpm railway:build` (already defined in `package.json`).

**Value to provide** `CONVEX_DEPLOY_KEY` · **Where** Railway variables · **Status** [ ] Optional

### Edge rate limiting for the public API

The API has an in-process token bucket (60 req/min/IP). It resets on deploy and is per instance, which is fine for one Railway replica. If you scale to multiple replicas or get abused, put Cloudflare (or Railway's proxy rules) in front of `/api/v1/*`. No code change needed. **Status** [ ] Optional

### Provider credentials for end-to-end testing

The Firebase, Auth0, PostHog, Plausible, GA4 and Stripe adapters are unit-tested against recorded API shapes, but were not exercised against live accounts (the agent has none). First real connection of each provider should be watched in the SaaS "Sync log" panel; any API shape mismatch surfaces there as a clear error. Known assumption to verify: Auth0 `per_page=0` on `/api/v2/users` (some tenants require `per_page=1`). **Status** [ ] Optional

### Legal pages

There is no privacy policy / terms page yet. UserTrack stores founder email + password or Google account id/name/avatar (Better Auth), provider API keys (encrypted at rest by Convex) and aggregate counts only — no end-user PII. A short privacy page is recommended before public launch, and Google requires a privacy policy URL before the OAuth consent screen can leave "Testing" mode (see the Google sign-in item). **Status** [ ] Recommended
