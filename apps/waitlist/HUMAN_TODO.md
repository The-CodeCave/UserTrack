# Human TODO — UserTrack waitlist

Everything else is done and deployed. These need a human:

## 1. Point the domain (Cloudflare, not touched by the agent)

Option A — apex for the interim phase:
```bash
cd apps/waitlist
railway domain usertrack.dev --service usertrack-waitlist      # registers the custom domain on Railway
```
Then in Cloudflare DNS: `usertrack.dev` → **CNAME** `usertrack-waitlist-production.up.railway.app`, proxied (orange cloud),
SSL/TLS mode "Full". Railway prints the exact target/status; wait for the cert. When the main app goes live, switch the CNAME
to the `usertrack` service's domain and remove the custom domain from `usertrack-waitlist`.

Option B — subdomain, leave the apex alone:
```bash
railway domain waitlist.usertrack.dev --service usertrack-waitlist
```
Cloudflare: `waitlist` → CNAME `usertrack-waitlist-production.up.railway.app`, proxied.
If you choose B, update `canonical`/`og:url` in `apps/waitlist/index.html` and `public/robots.txt` + `public/sitemap.txt`, rebuild, `railway up`.

## 2. Rybbit goal

In Rybbit (site id `753f44fa9c50`) add a goal of type "event" named `waitlist_join` (optionally also `waitlist_join_failed`).
Verify the events appear after one test signup; remove the test row afterwards:
```bash
cd apps/waitlist && npx convex run --prod waitlist:remove '{"email":"your-test@example.com"}'
```

## 3. Optional

- Add an X/Twitter handle to the footer (`src/Shell.tsx`) — skipped because unknown.
- If fake signups appear: add `@convex-dev/rate-limiter` or a Cloudflare rate-limit rule on `POST` to the Convex URL.
- Merge `waitlist` into `main` when convenient (see README "Merging").
