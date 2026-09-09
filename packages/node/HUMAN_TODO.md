# @usertrack/node — Human To-Do

Publishing needs a human-owned npm account; the code, tests, docs and release workflow are done. The package works from the repository (`pnpm add ../packages/node` or a `pnpm pack` tarball) before it is on npm.

Last updated: 2026-09-03.

### Publish order

`@usertrack/node` depends on `@usertrack/protocol` (`workspace:^` → rewritten to `^0.1.0` by `pnpm pack`). **Publish `@usertrack/protocol` first**, then `@usertrack/node`, then `@usertrack/better-auth` 0.2.0 (which depends on both). The scope claim, trusted publishing / `NPM_TOKEN` and ownership steps are the ones in `packages/better-auth/HUMAN_TODO.md` — one scope covers all three packages; do not repeat them, just run the first publish for each package.

### First publish (`0.1.0`)

**Always `pnpm publish`, never `npm publish`.** npm does not understand the `workspace:` protocol and ships `"@usertrack/protocol": "workspace:^"` verbatim, which breaks every install; pnpm rewrites it to `^0.1.0`. Verified 2026-09-09 by diffing both tarballs.

1. `npm login` (account that owns `@usertrack`, 2FA ready).
2. `pnpm install && pnpm -r --filter "./packages/**" build && pnpm -r --filter "./packages/**" test` from the repository root.
3. `cd packages/protocol && pnpm pack --pack-destination /tmp && pnpm publish --access public --no-git-checks --provenance=false`
4. `cd ../node && pnpm pack --pack-destination /tmp && tar -tzf /tmp/usertrack-node-0.1.0.tgz` — expect only `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`, `AGENTS.md`, `llms.txt`, `package.json`; then `pnpm publish --access public --no-git-checks --provenance=false`.
5. Smoke: in any Next.js app `npm install @usertrack/node@0.1.0` and mount the route from the README; or run `pnpm --filter usertrack-node-e2e e2e` (uses the workspace build).
6. Tag: `git tag protocol-v0.1.0 node-v0.1.0 && git push origin protocol-v0.1.0 node-v0.1.0` (`.github/workflows/release-packages.yml` runs; with neither OIDC nor `NPM_TOKEN` the publish step fails harmlessly because the version already exists).

**Status**
* [x] Done (2026-09-09) — published from a laptop with a classic publish token. Order: `@usertrack/protocol@0.1.0` → `@usertrack/node@0.1.0` → `@usertrack/better-auth@0.2.0`. Verified against the live registry: a clean `npm install @usertrack/better-auth` in an empty project pulls all three, the installed `@usertrack/node` carries `"@usertrack/protocol": "^0.1.0"` (no `workspace:` leftovers) and both `createUserTrackHandler` and `userTrack` import as functions.

### Real-world adapter test (optional, recommended)

The Prisma / Drizzle / Convex / Auth.js adapters are unit-tested against in-memory fakes and the rendered SQL, not against live databases (the agent has no Postgres, no Convex deployment of a third-party app). To exercise one for real: create a throwaway Next.js app with Prisma + Postgres (Neon free tier) or a Convex starter, follow `AGENTS.md`, create the integration in UserTrack for a test project, deploy (or tunnel with `cloudflared tunnel --url http://localhost:3000`) and click **Verify**. Check the Sync log and the "Live events" line after one signup.

**Status** [ ] Optional
