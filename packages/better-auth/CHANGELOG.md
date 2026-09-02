# Changelog

## 0.1.0 — 2026-09-02

Initial release.

- `userTrack({ projectId, secret })` server plugin for Better Auth `>=1.3`.
- Signed metrics endpoint `POST /usertrack/metrics` (HMAC-SHA256 request + response signatures, 5-minute timestamp window, nonce replay cache): total users, new users in 24h / 7d / 30d, optional daily series (≤ 90 days) and arbitrary date ranges.
- Optional lifecycle events (`user.created`, `user.deleted`) pushed to UserTrack, fire-and-forget with a 3 s timeout — never blocks or fails the host auth flow.
- Anonymous-plugin users are excluded from registered-user counts automatically.
- No PII leaves the app: counts, timestamps and an HMAC-derived pseudonymous subject only.
