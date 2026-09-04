# UserTrack waitlist (interim landing)

A tiny, fully standalone waitlist page for https://usertrack.dev, used while the main app is not public yet.
Vite + React 19 + Tailwind v4 + Convex (own project, own deployment). No auth, no email sending, no cookies.

- Live: https://usertrack.dev (+ www) → Railway service `usertrack-waitlist` in project `usertrack`; fallback URL https://usertrack-waitlist-production.up.railway.app
- Convex project: `thecodecave/usertrack-waitlist` — prod `glad-lynx-143` (https://glad-lynx-143.eu-west-1.convex.cloud), dev `judicious-canary-549`
- Dashboard: https://dashboard.convex.dev/t/thecodecave/usertrack-waitlist
- Routes: `/` (waitlist), `/impressum` (DE), `/privacy` (EN + DE header). Client-side routing, `serve -s` rewrites everything to `index.html`.

## Isolation

This folder is its own package root: `pnpm-workspace.yaml` here contains `packages: []`, which stops pnpm from
climbing to the repo-root workspace. It has its own `package.json`, `pnpm-lock.yaml`, `node_modules`, `convex/` and
Convex project. Nothing outside `apps/waitlist/` is referenced or modified. Brand assets and fonts were copied from
`brand/` and `public/fonts/` of the main app.

## Run locally

```bash
export PATH=/opt/homebrew/bin:$PATH
cd apps/waitlist
pnpm install                 # local node_modules, ignores the root workspace
npx convex dev               # dev deployment, writes VITE_CONVEX_URL into .env.local (gitignored)
pnpm dev                     # http://localhost:3101  (3000 is reserved for the AI harness)
```

Production-like preview: `pnpm build && pnpm start` (serves `dist/` on `$PORT` or 3101).

## Env vars

| Where | Var | Value |
|---|---|---|
| `.env.local` (dev) | `VITE_CONVEX_URL` | dev deployment URL, written by `npx convex dev` |
| `.env.local` (dev) | `CONVEX_DEPLOYMENT` | `dev:judicious-canary-549` |
| Railway service `usertrack-waitlist` | `VITE_CONVEX_URL` | `https://glad-lynx-143.eu-west-1.convex.cloud` (build-time — Vite inlines it) |

## Deploy

```bash
cd apps/waitlist
npx convex deploy -y                              # backend → prod glad-lynx-143
railway link --workspace "The CodeCave GbmH" --project usertrack --environment production   # once per machine/dir
railway service link usertrack-waitlist
railway up --service usertrack-waitlist --ci      # uploads this folder (root dir = apps/waitlist), Railpack builds `pnpm build`, runs `pnpm start`
```

`railway.toml` pins Railpack, `pnpm build` and `serve -s dist -l $PORT`. Deploys are CLI uploads, not GitHub-triggered,
so the service has no repo/root-directory setting to maintain. If you later connect the repo instead, set
Root Directory = `apps/waitlist` and Branch = `waitlist` (or `main` after merge).

## Export emails

```bash
cd apps/waitlist
npx convex run --prod waitlist:exportAll                                  # first 500, oldest first
npx convex run --prod waitlist:exportAll '{"paginationOpts":{"numItems":500,"cursor":"<continueCursor>"}}'
npx convex run --prod waitlist:count
```

Or open the table in the dashboard and use "Export". `exportAll` is an `internalQuery` — not callable from the client.

## Remove an entry (withdrawal / GDPR)

```bash
npx convex run --prod waitlist:remove '{"email":"person@example.com"}'   # → {"removed": true}
```

## Data & abuse notes

- Stored per signup: normalised email, `createdAt`, `consentAt`, optional `utm_source` (≤64 chars), referrer hostname (≤128), device family `mobile|desktop`. No IPs, no user-agent strings.
- Honeypot field `website`: if filled, the mutation returns `ok:true` and stores nothing.
- Flood guard is minimal: email regex + 254-char cap, 2 KB arg cap, dedupe on `by_email`, Convex's built-in rate limits.
  **Residual risk:** a scripted client can still insert many unique fake emails. If that happens, add
  `@convex-dev/rate-limiter` keyed by nothing/global, or put Cloudflare's WAF/rate-limit in front of the domain.
- Analytics: Rybbit (`data-site-id=753f44fa9c50`), cookieless. Events: `waitlist_join {already}`, `waitlist_join_failed {reason}`.

## Screenshots

`pnpm build && pnpm start` in one shell, then `node scripts/shot.mjs http://localhost:3101` → `docs/screenshots/*.png`
(375/768/1440 × landing idle/error/success, impressum, privacy). Uses local Chrome via playwright-core.
The success shots create `shot-<w>@example.com` rows in the **dev** deployment; remove them with `npx convex run waitlist:remove …`.
`node scripts/og.mjs` regenerates `public/og.png`.

## DNS (human step, not done)

Interim: in Cloudflare set `usertrack.dev` → CNAME `usertrack-waitlist-production.up.railway.app` (proxied), and add the
custom domain on the Railway service (`railway domain usertrack.dev --service usertrack-waitlist`). Later switch the
CNAME to the main `usertrack` service. Alternative: use `waitlist.usertrack.dev` and leave the apex alone.
See `HUMAN_TODO.md`.

## Merging the `waitlist` branch into `main`

The branch only adds `apps/waitlist/` — nothing else in the repo is touched, so the merge is trivial:

```bash
cd /Users/aleksmacmini/Projects/UserTrack
git merge waitlist            # or: git merge --no-ff waitlist
git worktree remove ../UserTrack-waitlist
```

Keep it that way: never add `apps/waitlist` to the root `pnpm-workspace.yaml` and never import from it.
