# Changelog

## 0.2.0 — 2026-09-03

Built on the shared UserTrack SDK. Wire-compatible with UserTrack (protocol v1); no configuration change needed.

- Depends on `@usertrack/protocol` (signing) and `@usertrack/node` (metrics handler core + event tracker) instead of bundling its own copies. `@usertrack/better-auth/protocol` still re-exports the protocol for 0.1.x consumers.
- Metrics response now uses the v1 role blocks: `users: { totalUsers, newUsers, daily, range }`, `source: "better-auth"`, `clientVersion`, `capabilities.roles`. The top-level `totalUsers` / `pluginVersion` / `provider` fields of 0.1.x are gone (UserTrack reads both shapes).
- Lifecycle events are posted to `/api/integrations/native/events` (UserTrack keeps accepting the old path from 0.1.x plugins) and carry `source` + `clientVersion`.
- New export `betterAuthUsers(adapter, { excludeAnonymous })` — the Better Auth `user` model as a UserTrack count source, reusable with `createUserTrackHandler` from `@usertrack/node` if you want activation / conversion in the same handler.
- Error code `USERTRACK_ADAPTER_ERROR` renamed to `USERTRACK_SOURCE_ERROR` (500 responses only).

## 0.1.0 — 2026-09-02

Initial release.

- `userTrack({ projectId, secret })` server plugin for Better Auth `>=1.3`.
- Signed metrics endpoint `POST /usertrack/metrics` (HMAC-SHA256 request + response signatures, 5-minute timestamp window, nonce replay cache): total users, new users in 24h / 7d / 30d, optional daily series (≤ 90 days) and arbitrary date ranges.
- Optional lifecycle events (`user.created`, `user.deleted`) pushed to UserTrack, fire-and-forget with a 3 s timeout — never blocks or fails the host auth flow.
- Anonymous-plugin users are excluded from registered-user counts automatically.
- No PII leaves the app: counts, timestamps and an HMAC-derived pseudonymous subject only.
