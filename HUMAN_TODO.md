# UserTrack Human To-Do

Everything the agent could not complete autonomously because it needs an external account, credential, or a human decision. Developer work is **not** listed here — it is done.

Last updated: 2026-09-02 (v0.2 deployment).

## Critical Before Production

_None blocking._ The v0.2 release is deployed and smoke-tested with the credentials that already existed. The items below unlock optional capabilities.

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

### Custom domain for production

**Why this is needed**
Public pages, OG images, badges and the API currently live on `usertrack-production.up.railway.app`. A real domain improves sharing, SEO and trust (and the `SITE_URL` shows up in every badge embed founders paste on their sites, so switching later means old embeds keep pointing at the Railway URL).

**Where**
Railway → project `usertrack` → service `usertrack` → Settings → Networking → Custom Domain; your DNS provider.

**Steps**
1. Add the domain in Railway and create the CNAME it shows.
2. Update `NEXT_PUBLIC_SITE_URL` on Railway (service variables) to `https://yourdomain.com`.
3. Update `SITE_URL` on Convex prod: `npx convex env set --prod SITE_URL https://yourdomain.com` (Better Auth trusted origin + digest links).
4. Redeploy (`railway up --service usertrack --ci`) so the new URL is baked into the client bundle.
5. Google Search Console → add property → submit `https://yourdomain.com/sitemap.xml`.

**Value to provide**
The domain name.

**Where to put it**
Railway → usertrack → Variables (`NEXT_PUBLIC_SITE_URL`); Convex prod env (`SITE_URL`)

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

There is no privacy policy / terms page yet. UserTrack stores founder email + password (Better Auth), provider API keys (encrypted at rest by Convex) and aggregate counts only — no end-user PII. A short privacy page is recommended before public launch. **Status** [ ] Optional
