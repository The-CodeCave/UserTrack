# Changelog

## 0.1.0 — 2026-09-03

Initial release.

- `createUserTrackHandler({ projectId, secret, users, activation?, conversion?, identities?, source?, debug? })` — WHATWG `(Request) => Promise<Response>` handler for `POST …/usertrack/metrics` (HMAC-SHA256 request + response signatures, 5-minute window, nonce replay cache; total users, 24h / 7d / 30d windows, ≤ 90-day daily series, date ranges; optional activation and conversion blocks; optional identities). `toNodeHandler()` for Express / `node:http`.
- Adapters: `@usertrack/node/prisma` (`prismaUsers`, `userTrackPrismaExtension` push hook), `@usertrack/node/drizzle` (`drizzleUsers`), `@usertrack/node/convex` (`convexHandler`, `countWithCap` with `exactCounts: false` beyond the cap), `@usertrack/node/authjs` (`userTrackAuthjsEvents`).
- `createTracker()` — fire-and-forget lifecycle events (`user.created`, `user.deleted`, `user.activated`, `trial.started`, `user.converted`) with an HMAC-derived pseudonymous subject, 3 s timeout, never throws.
- 22 unit tests + a real-HTTP e2e sample (`packages/node/e2e`).
