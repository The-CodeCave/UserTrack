# Changelog

## 0.1.0 — 2026-09-03

Initial release — extracted from `@usertrack/better-auth` 0.1.0 (wire-compatible, protocol v1).

- Canonical string `v1\n{REQUEST|RESPONSE}\n{path}\n{timestamp}\n{nonce}\n{sha256(body)}`, HMAC-SHA256 (`sign` / `verify` / `signedHeaders`), `timingSafeEqual`, `NonceCache`, `pseudonymize`.
- Headers `x-usertrack-project` / `-timestamp` / `-nonce` / `-signature`, 5-minute tolerance, responses bound to the request nonce.
- Wire types: `MetricsRequest`, `MetricsResponse` (now carries `source`, `clientVersion` and the `users` / `activation` / `conversion` / `identities` blocks next to the legacy users-only shape), `LifecycleEvent` (`user.created`, `user.deleted`, `user.activated`, `trial.started`, `user.converted`).
- Path constants: `METRICS_PATH` (`/usertrack/metrics`), `EVENTS_PATH` (`/api/integrations/native/events`), `LEGACY_EVENTS_PATH` (`/api/integrations/better-auth/events`).
- Frozen fixtures (`tests/fixtures/signatures.json`, generated with `node:crypto`) shared with the UserTrack server tests.
