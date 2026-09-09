# Changelog

## 0.1.1 — 2026-09-09

Raise the `@usertrack/protocol` floor to `^0.1.1` so isolate-runtime builds cannot break.

- 0.1.0 allowed a transitive `@usertrack/protocol@0.1.0`, whose `node:crypto` fallback made `npx convex deploy` and any Workers, Deno or Edge bundle fail with `Could not resolve "node:crypto"`. The range now excludes it, so a fresh install can no longer produce the broken tree.
- `llms.txt` gained a *Runtime & known issues* section and pins `@latest` in the install commands, so an agent that still hits a cached or lockfile-pinned 0.1.0 has the fix in front of it.
- `engines` raised to `>=20`.

## 0.1.0 — 2026-09-03

Initial release.

- `createUserTrackHandler({ projectId, secret, users, activation?, conversion?, identities?, source?, debug? })` — WHATWG `(Request) => Promise<Response>` handler for `POST …/usertrack/metrics` (HMAC-SHA256 request + response signatures, 5-minute window, nonce replay cache; total users, 24h / 7d / 30d windows, ≤ 90-day daily series, date ranges; optional activation and conversion blocks; optional identities). `toNodeHandler()` for Express / `node:http`.
- Adapters: `@usertrack/node/prisma` (`prismaUsers`, `userTrackPrismaExtension` push hook), `@usertrack/node/drizzle` (`drizzleUsers`), `@usertrack/node/convex` (`convexHandler`, `countWithCap` with `exactCounts: false` beyond the cap), `@usertrack/node/authjs` (`userTrackAuthjsEvents`).
- `createTracker()` — fire-and-forget lifecycle events (`user.created`, `user.deleted`, `user.activated`, `trial.started`, `user.converted`) with an HMAC-derived pseudonymous subject, 3 s timeout, never throws.
- 22 unit tests + a real-HTTP e2e sample (`packages/node/e2e`).
