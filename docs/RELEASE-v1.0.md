# Release v1.0 — launch hardening (+ v1.0.1 review fixes)

**TL;DR** — v1.0 adds no new product surface. It makes the v0.9 product safe to put in front of strangers:
the gateway fails closed, every public entry point is rate limited, every founder-supplied host is checked for SSRF,
the legal pages exist, accounts can be exported and deleted, analytics is cookieless, sign-in has three social providers,
projects have a real profile (and an anonymous mode), profiles can be imported from TrustMRR, X follower counts are read
from the founder's own token, every cron is paged, every public page is cached, logs expire, errors are tracked and
`/api/health` is the health check. Deploy order: **Convex first, then Railway.** Rollback is a redeploy of the previous
commit — the schema only added optional fields and new tables.

Verified on the release commit: `pnpm lint` (0 errors, 8 warnings), `pnpm typecheck`, `pnpm test` **635 tests / 82 files**,
`pnpm packages:build`, `pnpm packages:test` **61 tests** (9 protocol · 22 node · 30 better-auth), `pnpm build`,
`node scripts/smoke.mjs`, `node scripts/cache-check.mjs` (16/16 routes), `node scripts/shots-ship1.mjs`
(screenshots in `docs/screenshots/v1/ship/`).

---

## v1.0.1 review fixes

**TL;DR** — v1.0.1 adds no product surface either. It closes every finding of the post-v1.0 code review: the rate limits
key on the *right* IP behind Cloudflare, no cron can start twice, the rerank no longer depends on an action's clock, the
homepage read is bounded again, `/api/auth/*` has a limit that survives a redeploy, analytics stays out of dev and preview
builds, and `/api/health` tells the truth about which side is down. Two tables are added (`rankScratch`, `authRateLimits`);
nothing is removed or renamed, so the v1.0 rollback story below is unchanged.

Verified on the release commit, from clean (`rm -rf .next && pnpm install --frozen-lockfile`): `pnpm lint`
(**0 errors, 8 warnings**), `pnpm typecheck`, `pnpm test` **666 tests / 84 files**, `pnpm packages:build`,
`pnpm packages:typecheck`, `pnpm packages:test` **61 tests** (9 protocol · 22 node · 30 better-auth), `pnpm build`,
`node scripts/smoke.mjs`, `node scripts/shots-ship2.mjs` — screenshots in `docs/screenshots/v1/ship2/`, the header /
health / rate-limit transcript in `docs/screenshots/v1/ship2/api-checks.txt`.

| Ticket | Change |
|---|---|
| **FIX-0** | Branch setup: `landing-v2` fast-forwarded into `main` (pink scale + `trust` / `positive` / `negative` / `new` semantic tokens, `public.landing`, list-first homepage with New & hot + Top 100), `.codecraft-loop-*.md` gitignored. Baseline green with no fixes needed. |
| **FIX-1** | (a) **Trusted client IP** — `clientIp()` reads `cf-connecting-ip` → `true-client-ip` → the last `x-forwarded-for` hop, but the first two only when **`UT_TRUST_CF_HEADERS=1`** (new env, default off). Without it a proxied `usertrack.dev` collapses every visitor into one rate-limit bucket; with it set while the origin is still directly reachable, both headers are forgeable. (b) **MCP profile publish gate** — `updateProfileTool` calls `requireVerifiedToPublish` before flipping `profilePublic: true`, as `profiles.upsert` already did. (c) **Analytics only in production** — `resolveSiteId()` implies the production Rybbit site id only for `NODE_ENV=production` **and** a `NEXT_PUBLIC_SITE_URL` starting `https://usertrack.dev`; an explicit **`NEXT_PUBLIC_RYBBIT_SITE_ID`** always wins (empty = kill switch), so `pnpm dev`, CI and preview services no longer write into the production site. (d) **Health-check accuracy** — `?deep=1` runs the `public.stats` and `jobs.health` probes separately, so `convex` reflects Convex alone and a missing gateway secret reports `jobs: "unavailable: …"` instead of a false `down`. (e) **`jobRuns.finishedAt`** — patched only when the run is really done; an explicit `undefined` deletes the field in Convex, which silently un-finished an already-closed run. |
| **FIX-2** | **Running lock on `jobRuns`.** `startRun` is now an *acquire*: it returns `null` while the previous chain of that job is still open, so a cron firing while its predecessor is still paging does nothing at all — no second run, no second digest, no duplicate emails. A run held past its per-job `LOCK_TTL_MS` is closed as `abandoned (lock expired)` and a fresh one starts. Applied to every paged driver. |
| **FIX-3** | **Scheduler-chained rerank + bounded homepage.** `leaderboard.rerank` went from one `internalAction` looping `runQuery` / `runMutation` — killable mid-ranking by the action time limit — to a three-phase scheduler chain of mutations over the new `rankScratch` table: byte-identical ranking, same `runId` lock, same `pages` / `items` accounting, stale scratch rows swept before the next run. `public.landing` reads a bounded slice instead of walking the table. |
| **FIX-4** | **Durable Better Auth rate limit.** `/api/auth/*` is served by Better Auth inside a Convex isolate, so its default in-memory limiter counted per isolate — a limit in name only. `rateLimit.customStorage.consume` is now one Convex mutation over the new `authRateLimits` table (check and increment in one transaction): `/sign-in/*` 20 per 10 min, `/sign-up/*` 10 per hour, verification / password-reset mail 5 per 10 min, everything else 100/min. The bucket key is `<ip>` + `<path>`, where the IP is the FIX-1-trusted one stamped as `x-ut-client-ip` by the Next.js `/api/auth/[...all]` proxy. Plus: a regression test that evaluates the real `next.config.ts` `headers()` entries with Next's own matcher (embeddable routes keep `frame-ancestors *` and no `X-Frame-Options`), IPv6 normalisation in the SSRF guard, auth on `trustmrr.status`, and the board-ISR note (A225). |
| **SHIP-2** | Consolidation: `apps/waitlist/` merged into `main` as a separate deployable (root `tsconfig.json` / `eslint.config.mjs` now exclude `apps`, matching how `packages` is already handled — without it the root type-check and lint fail on the waitlist's own toolchain), full clean re-verification, and these release notes. |

### New environment variables

| Var | Where | Value |
|---|---|---|
| `UT_TRUST_CF_HEADERS` | Railway service `usertrack` | `1` **only once the Cloudflare record is proxied** (orange cloud). Then `cf-connecting-ip` / `true-client-ip` key the rate limits instead of Cloudflare's own address; unset or `0` = ignored. Setting it while the Railway origin is still reachable directly lets a caller choose their own bucket. |
| `NEXT_PUBLIC_RYBBIT_SITE_ID` | Railway service `usertrack` (build **and** runtime) | `753f44fa9c50`. Since FIX-1 the id is only *implied* for a production build of `https://usertrack.dev`; set it explicitly so analytics never depends on that inference. Empty string disables the tracker and every server-side event. |

Exact commands for both: `HUMAN_TODO.md` steps 6 and 12; reference table in `docs/DEPLOYMENT.md`.

### Deploy delta vs. v1.0

Same order — **Convex first, then Railway** — with two new tables and one new step:

```bash
npx convex deploy --yes                        # + rankScratch (FIX-3) and authRateLimits (FIX-4)
npx convex run --prod leaderboard:rerank '{}'  # NEW — run it right here, see below
railway up --service usertrack --ci
```

**Why the rerank cannot wait for the cron.** The board indexes sort on materialized fields and `saas.growth24hPct` is only
ever written by a rerank, so every product listed before v1.0 has no key on `by_public_growth24h` and sorts last —
`/fastest-growing-saas?window=24h` stays short until the first rerank. The cron (`20 */4 * * *`) fixes it within four hours
anyway; running it by hand makes the first public hour correct. It returns immediately because it starts a scheduler chain:
watch `jobRuns` for `job = "rerank leaderboard"` with a `finishedAt` and `errors: 0`, and confirm `rankScratch` is empty
afterwards.

### Residual risks after v1.0.1

These fixes were correctness bugs, not the accepted trade-offs, so nothing in the v1.0 list is closed by them; the FIX-4
row was rewritten to describe what is left rather than the whole gap. In short:

1. **Provider credentials are plaintext at rest** (`integrations.config`, A120) — nothing returns them; envelope encryption is backlog.
2. **DoH TOCTOU** on webhook and provider fetches (A111) — hosts are re-resolved and private ranges refused immediately before each request, but `fetch` resolves again itself.
3. **The first-line rate limiter is in-memory, per instance** — exact at one Railway replica; before scaling out, move the burst check to `rateLimits.check` (the Convex path already exists).
4. **TrustMRR's response shape is unverified** (A173) — the mapper is written against the published example; a different real shape lands fields in `unmapped[]`, never in the wrong field and never a revenue field.
5. **Better Auth's durable limit can still be side-stepped** by calling `<deployment>.convex.site/api/auth/*` directly and forging `x-ut-client-ip` (A223) — the same shape as the directly reachable Railway origin (A212); closing it needs a shared secret between the proxy and the Convex auth routes.

Full wording and mitigations: *Residual risks* at the bottom of this document.

---

## What changed

| Ticket | Change |
|---|---|
| **SEC-1** | `UT_GATEWAY_SECRET` is compared in constant time and **rejected when missing on either side**; every "encrypted" claim about `integrations.config` replaced with what the code guarantees; `safeInternalPath` for every `next` / `redirectTo`; security headers + CSP in `next.config.ts` (embeddable routes stay frameable); `requireEmailVerification: true` with inbox / resend states and a verified-email gate on publishing. |
| **SEC-2** | `@convex-dev/rate-limiter` component + gateway-gated `rateLimits.check`, a named limit catalog (`convex/lib/rateLimits.ts`), `limit(req, name, key?)` with an in-memory first line, trusted client IP (last `x-forwarded-for` hop), `429` + `Retry-After` + `no-store` everywhere. |
| **SEC-3** | Shared `convex/lib/ssrf.ts` (webhooks re-use it): validate-time host policy for endpoint / native / PostHog / Plausible / Supabase / Auth0, fetch-time DoH guard in `providerRun`, `redirect: "manual"` + 15 s timeout on every provider request, `dns.lookup` guard before every Postgres connection (`UT_ALLOW_PRIVATE_DB=1` for local dev only). |
| **LEGAL-1** | `/impressum` (DE, CodeCave operator data), `/privacy` (EN + DE summary, code-accurate categories, legal bases, processors, retention), `/terms` (German law, CC BY 4.0 for public growth data), `/imprint` redirect, footer in every layout, sign-up consent line, `src/lib/legal.ts`. |
| **LEGAL-2** | Self-service GDPR export (`GET /api/account/export`, MCP `usertrack_export_account`) and deletion — paged hard delete across all 32 user-owned tables, Better Auth rows last, confirmation email, no grace period. |
| **ANALYTICS-1** | Self-hosted, cookieless Rybbit (no banner), typed catalog of 44 client events fired at their real call sites, pseudonymous identify, server events from route handlers and Convex. `docs/ANALYTICS.md` lists the goals / funnels a human must create. |
| **AUTH-1** | GitHub + X sign-in next to Google (conditional on env, disabled buttons when unconfigured), account linking, Settings → Connected accounts, provider profile import on first login. |
| **PROFILE-1** | Markets / tech stack / marketing channels, cofounders, country, funding, team size, product texts, logo upload, **anonymous mode** (server-side stripping on every public surface incl. OG, share cards and the API), hide from Google, `/stacks/<slug>` boards. Never a revenue field. |
| **IMPORT-1** | "Import from TrustMRR" on the project forms and MCP `usertrack_import_from_trustmrr` — one operator key, diff-style preview, revenue fields excluded by construction. |
| **SOCIAL-1** | `profiles.xFollowers` read only from the founder's own X token, refreshed daily in pages, shown on the founder page, owner chips, project "Built by" and the cards; never leaked for anonymous projects or hidden profiles. |
| **OPS-1** | Every cron / full-table job is paged (`convex/jobs.ts`, `PAGE` catalog, `jobRuns` ledger). Per-project failures are caught and counted instead of killing the run. |
| **OPS-2** | ISR + `Cache-Control: public, s-maxage=300` on every public page, no cookie read under `(public)`, boards served from 15 new per-sort-key `saas` indexes with an early-exit walk, directory counters materialized in `publicStats`, `publicSet` and the sitemap capped at 5,000. |
| **OPS-3** | `convex/retention.ts` (ten tables, periods shared with `/privacy` through `RETENTION_DAYS`), `@sentry/nextjs` behind the DSN with full scrubbing, `error.tsx` / `global-error.tsx` + degraded public pages, `GET /api/health` (+ `?deep=1`) as the Railway health check, `.github/workflows/ci.yml` without secrets. |

Full detail per ticket: `docs/CHANGELOG.md` → *v1.0 launch hardening*.

## Migration / deploy steps, in order

Nothing here is destructive and every step is idempotent.

```bash
# 0. from the release commit, clean
rm -rf .next && pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm packages:build && pnpm packages:test && pnpm build

# 1. required Convex prod variables (see HUMAN_TODO.md → Launch checklist for the values)
npx convex env list --prod            # UT_GATEWAY_SECRET and RESEND_API_KEY must be present

# 2. backend first: schema (new tables + indexes), functions, crons, rate-limiter component
npx convex deploy --yes

# 3. materialize the board sort keys (v1.0.1 / FIX-3 — do this in the same session as step 2)
npx convex run --prod leaderboard:rerank '{}'

# 4. the one migration that may still be pending from v0.7 (idempotent, paged)
npx convex run --prod migrations:nativeV1

# 5. then the app
railway up --service usertrack --ci

# 6. post-deploy checks
curl -s https://usertrack.dev/api/health
curl -s "https://usertrack.dev/api/health?deep=1"      # "convex":"ok" + a jobs array
curl -sI https://usertrack.dev/leaderboard             # HSTS, CSP, X-Frame-Options, Cache-Control: public, s-maxage=300
curl -sI https://usertrack.dev/api/v1/leaderboard      # x-ratelimit-limit / -remaining / -window
curl -sI https://usertrack.dev/api/badge/demo-northwind.svg   # frame-ancestors *
```

**Why Convex first:** the Next.js build calls no Convex function, but the running app does. Deploying the backend first means
the new queries (`public.boardRows`, `public.stats`, `jobs.health`, `retention.sweep`, `trustmrr.*`, `social.refreshNow`)
exist before the app that calls them. Deploying the app first would produce 404s on those functions until step 4 finishes.

**Schema additions (no data migration).** Three new tables — `profilePrefills` (AUTH-1), `publicStats` (OPS-2), `jobRuns`
(OPS-1) — the `@convex-dev/rate-limiter` component's own tables, 29 new indexes (15 board sort keys, 9 retention time
indexes, the rest for the new tables and the AUTH-1 / SEC-2 lookups) and optional fields on `saas` / `profiles` (`markets`, `techStack`,
`marketingChannels`, `cofounders`, `country`, `funding`, `teamSize`, `foundedAt`, `about*`, `logoStorageId`, `anonymous`,
`hideFromSearch`, `trustmrrSlug`, `growth24hPct`, `xFollowers`, `xFollowersAt`). Nothing is removed or renamed, so an old
deployment reads the new documents and a new deployment reads the old ones.

**First data appears over time.** `publicStats` is written by the next `rerank leaderboard` (every 4 h) — until then the
directory counters read zero; the first `retention sweep` row appears with the next `daily sweep` (03:30 UTC).

## Rollback

1. **App only** (a UI or route regression): `railway up` from the previous commit, or roll back the deployment in the Railway
   dashboard. The v1.0 Convex functions stay deployed; they are backwards compatible with the v0.9 app.
2. **Backend too**: check out the previous commit and `npx convex deploy --yes`. Convex replaces the whole function bundle,
   so the previous crons, queries and mutations come back as they were.
3. **The schema stays.** Only optional fields and new tables were added, so a v0.9 deployment ignores them; there is no
   down-migration and none is needed. Do **not** delete `publicStats` / `jobRuns` on a rollback — a re-deploy of v1.0 would
   just recreate them, and `jobRuns` is the only record of what the crons did.
4. **What a rollback loses**: retention stops expiring logs, boards go back to the in-memory sort (correct, just slower),
   public pages go back to uncached, `/api/health` disappears — so **change the Railway health-check path back to
   `/leaderboard`** if you roll back past OPS-3.
5. `UT_GATEWAY_SECRET` must keep matching on both sides through any rollback; the fail-closed check exists in both versions.

## The interim waitlist (`apps/waitlist/`)

Merged into `main` in SHIP-2 (`apps/waitlist/`, previously the `waitlist` branch). It is a **separate deployable that this
release does not build or deploy**: its own `pnpm-workspace.yaml` (`packages: []`), lockfile, `node_modules`, Convex project
(`usertrack-waitlist`, prod `glad-lynx-143`) and Railway service (`usertrack-waitlist`). The repo root excludes `apps` from
`tsconfig.json`, `eslint.config.mjs` and `vitest.config.ts`, and CI has `paths-ignore: ["apps/**", …]`, so `pnpm build` /
`pnpm test` at the root neither see it nor break on it.

It exists so `usertrack.dev` can collect signups while the main app is pre-launch. The domain plan is `HUMAN_TODO.md` →
step 12: point `usertrack.dev` at the waitlist service during the interim phase, then switch the record to the main app at
launch. Both phases share one Rybbit site, so the waitlist's `waitlist_join` goal and the launched funnel are measured
together. Deploy / retire commands: `docs/DEPLOYMENT.md` → *The interim waitlist*.

## Residual risks

| Risk | What it means | Mitigation / when it goes away |
|---|---|---|
| **Provider credentials are plaintext at rest** | `integrations.config` (Clerk keys, service accounts, read-only DSNs, Stripe restricted keys) is stored in Convex without application-level encryption. Convex encrypts its storage, but anyone with deployment access can read a config document. Nothing returns it — not the dashboard, the API, MCP or the audit log (A120). | Backlog: envelope encryption with a KMS-style key from env. Until then: keep the Convex dashboard access list short, and prefer read-only credentials (which is what every wizard asks for). |
| **DoH TOCTOU on webhooks and provider fetches** | Hostnames are re-resolved through DNS-over-HTTPS immediately before every delivery / provider request and private ranges are refused, but `fetch` resolves again itself — a DNS record that flips between the two lookups is not caught (A111). | Backlog: an egress proxy with IP pinning. The window is milliseconds and requires an attacker who controls both a DNS record and the timing. |
| **The first-line rate limiter is per instance** | `limit()` keeps an in-memory bucket per Next.js process; the durable per-day quotas live in Convex. With one Railway replica this is exact; with N replicas the burst limit is effectively N × the configured value. | Correct as long as the service runs a single replica. Before scaling out, move the burst check to `rateLimits.check` (the Convex path already exists). |
| **TrustMRR's response shape is unverified** | The mapper is written against the published example (`docs/api/get-startup`, fetched 2026-09-04) and its fixtures, not against a live key (A173). A different real shape means fields land in `unmapped[]` — never in the wrong field, and never a revenue field. | First real import after `TRUSTMRR_API_KEY` is set: paste the observed JSON into `convex/lib/trustmrr.fixtures.ts` and re-run `pnpm test` (`HUMAN_TODO.md`). |
| **Better Auth's durable limit can be side-stepped on the Convex endpoint** | FIX-4 gives `/api/auth/*` a Convex-backed limiter (`authRateLimits`; sign-in 20 per 10 min, sign-up 10 per hour, verification / reset mail 5 per 10 min, else 100/min) keyed on the `x-ut-client-ip` the Next.js proxy stamps from the FIX-1 trust rules. `<deployment>.convex.site/api/auth/*` stays publicly reachable, so a caller who goes straight there can forge that header and pick a bucket (A223). | Same shape as the directly reachable Railway origin (A212). Closing it needs a shared secret between the proxy and the Convex auth routes. Email verification (SEC-1) already blocks the value of mass sign-ups. |
| **Error tracking is off until a DSN exists** | Without `NEXT_PUBLIC_SENTRY_DSN` the Sentry SDK is neither initialised nor downloaded — crashes still render the branded error boundary, but nobody is notified. | `HUMAN_TODO.md` → *Recommended*: create the Sentry EU project and set the DSN on Railway. |
| **History-based features start empty** | Biggest Movers needs ~7 days of stored positions, the first monthly ranking archive lands on the 1st of the next month, benchmark cards need 10 verified products per cohort. | Time. Nothing is broken in the meantime; the boards render their empty states. |
