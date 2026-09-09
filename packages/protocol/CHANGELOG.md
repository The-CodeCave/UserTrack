# Changelog

## 0.1.1 — 2026-09-09

Fix: drop the `node:crypto` fallback so the package builds on isolate runtimes.

- `subtle()` used `await import("node:crypto")` when `globalThis.crypto.subtle` was missing. The branch never ran on Convex, Workers, Deno or Edge — but bundlers resolve dynamic imports statically, so `esbuild` failed with `Could not resolve "node:crypto"` and `npx convex deploy` refused any `convex/http.ts` that mounted `@usertrack/node/convex`.
- The fallback now throws a descriptive error instead. The package contains no Node builtins at all and bundles for every runtime.
- `engines` raised to `>=20`: `globalThis.crypto` is only unflagged from Node 19, and Node 18 reached end of life on 2025-04-30.

## 0.1.0 — 2026-09-03

Initial release — extracted from `@usertrack/better-auth` 0.1.0 (wire-compatible, protocol v1).

- Canonical string `v1\n{REQUEST|RESPONSE}\n{path}\n{timestamp}\n{nonce}\n{sha256(body)}`, HMAC-SHA256 (`sign` / `verify` / `signedHeaders`), `timingSafeEqual`, `NonceCache`, `pseudonymize`.
- Headers `x-usertrack-project` / `-timestamp` / `-nonce` / `-signature`, 5-minute tolerance, responses bound to the request nonce.
- Wire types: `MetricsRequest`, `MetricsResponse` (now carries `source`, `clientVersion` and the `users` / `activation` / `conversion` / `identities` blocks next to the legacy users-only shape), `LifecycleEvent` (`user.created`, `user.deleted`, `user.activated`, `trial.started`, `user.converted`).
- Path constants: `METRICS_PATH` (`/usertrack/metrics`), `EVENTS_PATH` (`/api/integrations/native/events`), `LEGACY_EVENTS_PATH` (`/api/integrations/better-auth/events`).
- Frozen fixtures (`tests/fixtures/signatures.json`, generated with `node:crypto`) shared with the UserTrack server tests.
