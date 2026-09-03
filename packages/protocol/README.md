# @usertrack/protocol

The wire protocol between [UserTrack](https://usertrack.dev) and a **native integration** running inside your app (`@usertrack/node`, `@usertrack/better-auth`, or your own client). WebCrypto only, zero dependencies, ESM, Node 18.17+ and edge runtimes.

You normally do not install this package directly — `@usertrack/node` and `@usertrack/better-auth` depend on it. Use it if you implement the protocol in another language or framework, or if you want to verify events UserTrack sends you in tests.

## Protocol v1 in one paragraph

Both directions are signed with **HMAC-SHA256** using the integration secret (`ut_int_…`, generated once by UserTrack). The canonical string is

```
v1\n{REQUEST|RESPONSE}\n{path}\n{timestamp-ms}\n{nonce}\n{sha256-hex(body)}
```

and travels in four headers: `x-usertrack-project`, `x-usertrack-timestamp`, `x-usertrack-nonce`, `x-usertrack-signature` (`v1=<hmac-hex>`). Receivers reject timestamps outside ±5 minutes and replayed nonces; a response is signed with the *request's* nonce so it cannot be replayed for another pull. The `path` is the protocol path constant, not the URL your app mounts the handler on.

- **Pull** — UserTrack → your app: `POST` with body `{ "protocolVersion": 1, "days"?: 1–90, "from"?, "to"? }`, signed with path `/usertrack/metrics` (`METRICS_PATH`). Your app answers a signed `MetricsResponse`.
- **Push** — your app → UserTrack: `POST https://usertrack.dev/api/integrations/native/events` (`EVENTS_PATH`) with a signed `LifecycleEvent` (`user.created`, `user.deleted`, `user.activated`, `trial.started`, `user.converted`). Fire-and-forget; the pull is always the source of truth.

## API

```ts
import { sign, verify, signedHeaders, NonceCache, pseudonymize, METRICS_PATH, EVENTS_PATH, PROTOCOL_VERSION } from "@usertrack/protocol";

const headers = await signedHeaders(secret, projectId, { method: "REQUEST", path: METRICS_PATH, body });
const result = await verify(secret, request.headers, { method: "REQUEST", path: METRICS_PATH, body }); // { ok: true, nonce, timestamp } | { ok: false, reason }
```

Types: `MetricsRequest`, `MetricsResponse` (`users`, `activation`, `conversion`, `identities`, `capabilities`), `LifecycleEvent`, `NativeSource` (`better-auth | prisma | drizzle | convex | authjs | custom`).

## Response shape (v1)

```json
{
  "protocolVersion": 1,
  "clientVersion": "0.1.0",
  "source": "prisma",
  "projectId": "<USERTRACK_PROJECT_ID>",
  "generatedAt": "2026-09-03T08:00:00.000Z",
  "users": { "totalUsers": 12481, "newUsers": { "24h": 84, "7d": 491, "30d": 1832 }, "daily": [{ "day": "2026-08-04", "newUsers": 51 }] },
  "activation": { "activatedUsers": 6210, "activated24h": 40, "activated7d": 260, "activated30d": 990 },
  "conversion": { "convertedUsers": 812, "newConverted30d": 61, "trialUsers": 130, "mode": "active_paid" },
  "identities": { "signedUp": [{ "id": "u_1", "at": "2026-09-03T07:59:00.000Z" }] },
  "capabilities": { "exactCounts": true, "history": true, "roles": ["users", "activation", "conversion"] }
}
```

The users-only shape of `@usertrack/better-auth` 0.1.x (top-level `totalUsers` / `newUsers` / `daily`, `pluginVersion`, `provider: "better-auth"`) stays valid; UserTrack reads both. Identities are stable ids only — never emails.

## Fixtures

`tests/fixtures/signatures.json` freezes canonical strings and signatures for a handful of inputs (generated with an independent `node:crypto` script). The UserTrack server tests verify the same fixtures, so the two implementations can never drift.

MIT © CodeCave GmbH
