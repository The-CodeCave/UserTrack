# @usertrack/protocol — for coding agents

Wire protocol (v1) between UserTrack and a native integration inside an app. You almost never use this package directly: install `@usertrack/node` (any app) or `@usertrack/better-auth` (Better Auth) instead — both depend on it.

Facts an agent needs:
- Signing: HMAC-SHA256 over `v1\n{REQUEST|RESPONSE}\n{path}\n{timestamp}\n{nonce}\n{sha256(body)}`; headers `x-usertrack-project|timestamp|nonce|signature`; ±5 min; nonce replay protection; responses bound to the request nonce.
- Paths: `METRICS_PATH = "/usertrack/metrics"` (signed path of the pull, independent of where the handler is mounted), `EVENTS_PATH = "/api/integrations/native/events"` on UserTrack.
- Exports: `sign`, `verify`, `signedHeaders`, `NonceCache`, `pseudonymize`, `timingSafeEqual`, `sha256Hex`, `hmacHex`, `randomNonce`, `randomId`, constants and the types `MetricsRequest`, `MetricsResponse`, `LifecycleEvent`, `NativeSource`.
- Zero dependencies, WebCrypto only (Node 18.17+, edge). ESM.
- Never put user PII in a body: counts, timestamps and pseudonymous subjects only.
