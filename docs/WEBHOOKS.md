# Webhooks

**TL;DR** — Founders (and their agents through MCP) register HTTPS endpoints, pick event types, and receive signed JSON deliveries with retries and a delivery log. Every endpoint has a `whsec_` secret shown once; payloads are versioned; URLs are checked against private ranges at creation and re-resolved right before every delivery. Public docs: `/developers/webhooks`. Code: `convex/webhooks.ts`, `convex/lib/webhooks.ts`, `convex/schema.ts` (`webhookEndpoints`, `webhookDeliveries`).

## Events

| Type | Emitted from | Dedupe key (per project) | `data` |
|---|---|---|---|
| `milestone.reached` | `trust.addMilestones` (thresholds, Top 10 / 100, records, streaks, trending top 10) | milestone key (`users:10000`, `top10`, …) | `milestone { id, key, kind, metric, value, title, achievedAt }` |
| `rank.changed` | `leaderboard.rerank` when the 30-day rank differs from the previous rerank | UTC day (first change of the day) | `rank { board: "leaderboard", window: "30d", from, to, best }` |
| `trending.rank_changed` | same, 7-day trending rank | UTC day | `rank { board: "trending", window: "7d", from, to, score }` |
| `growth.spike` | `sync.recordSuccess` (≥ 3× the 14-day average, ≥ 20 users) | day | `spike { day, newUsers, average, multiple, metric }` |
| `integration.failed` | `email/lifecycle.onSourceFailure` (source enters `unhealthy`) | integration + episode start | `integration { id, role, provider, label, error, consecutiveFailures, lastSuccessAt? }` |
| `integration.recovered` | `email/lifecycle.onSourceSuccess` (episode ends) | integration + episode start | `integration { id, role, provider, label, unhealthySince, downForMs }` |
| `project.verified` | first verified users sync | once | `verification { level, provider, verifiedAt } ` |
| `webhook.test` | "Send test event" | per test | `message, sample`; payload carries `test: true` |

Demo products never emit. Events are only ever delivered to endpoints of the **project owner**.

## Payload

```json
{
  "id": "evt_milestone_reached_<projectId>_users_10000",
  "type": "milestone.reached",
  "apiVersion": "2026-09-01",
  "createdAt": "2026-09-03T10:12:00.000Z",
  "data": {
    "project": { "id": "…", "slug": "acme", "name": "Acme", "url": "https://usertrack.dev/s/acme", "totalUsers": 10240 },
    "milestone": { "id": "…", "key": "users:10000", "kind": "users", "metric": "totalUsers", "value": 10000, "title": "10,000 users", "achievedAt": "…" }
  }
}
```

`id` is deterministic per source event (`eventIdFor(type, key)`), so two endpoints receive the same `id` and a consumer that receives the same event twice (retries, two endpoints) can dedupe globally. `apiVersion` changes only when a field is removed or renamed; additions are backwards compatible. Test payloads carry `"test": true`.

## Signing and verification

Headers on every delivery:

| Header | Value |
|---|---|
| `UserTrack-Signature` | `v1=<hex HMAC-SHA256(secret, "${timestamp}.${rawBody}")>` |
| `UserTrack-Timestamp` | Unix seconds at signing time |
| `UserTrack-Event` | event type |
| `UserTrack-Delivery` | `dlv_…`, unique per delivery attempt series (same for retries), also sent as `Idempotency-Key` |
| `UserTrack-Event-Id` | the payload `id` |
| `Content-Type` | `application/json` |

Verification (Node / TypeScript):

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyUserTrack(rawBody: string, headers: Headers, secret: string, toleranceSec = 300) {
  const ts = Number(headers.get("usertrack-timestamp"));
  const sig = headers.get("usertrack-signature") ?? "";
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;
  const expected = "v1=" + createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  return expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
```

Rules: verify against the **raw** request body (not a re-serialized object), compare in constant time, reject timestamps older than 5 minutes (`SIGNATURE_TOLERANCE_SEC`), respond `2xx` quickly and do the work asynchronously. Test vector: secret `whsec_test`, timestamp `1700000000`, body `{"id":"evt_1","type":"webhook.test"}` → `v1=684fbc8999ff13aa332102c10e23ad56af8cb3b34c5d3bcba8bf53317e5f6c33` (`convex/lib/webhooks.test.ts`).

## Delivery, retries, logs

- `dispatchEvent` (mutation, inside the producing transaction) finds the owner's active endpoints subscribed to the type (optionally scoped to one project), skips endpoints that already have a delivery for the event id, inserts one `webhookDeliveries` row per endpoint and schedules `webhooks.deliver` immediately. Producing workflows never wait for HTTP.
- `deliver` (action): re-checks the URL policy, resolves the host through DNS-over-HTTPS and refuses private answers, signs, `POST`s with a **10 s** timeout and `redirect: "manual"` (redirects count as failures), then records the attempt.
- Retry schedule (`RETRY_DELAYS_MS`): immediate → 5 min → 30 min → 2 h → 12 h — **5 attempts**, then `exhausted`. Retried: 5xx, 408, 425, 429, timeouts, network errors, blocked-at-delivery. Final on the first attempt: every other 4xx, disabled endpoint, URL policy violation.
- Ledger per delivery: `attempt`, `status` (`pending` · `success` · `failed` · `exhausted`), `httpStatus`, `latencyMs`, `error` (≤ 200 chars), `nextAttemptAt`, timestamps. Response bodies are never stored.
- Endpoint state: `lastDeliveryAt`, `lastStatus`, `lastError`, `consecutiveFailures`; **25** consecutive failures disable the endpoint (`disabledReason`), the owner re-enables it in the dashboard.
- `webhooks.retrySweep` (hourly cron) re-queues overdue `failed` / stuck `pending` rows whose scheduled function was lost. Owners can also retry a single delivery.

## SSRF protection (`checkWebhookUrl` → `convex/lib/ssrf.ts`: `checkPublicHttpsUrl`, `isPrivateIp`, `resolvePublicHost`; shared with providers since SEC-3)

- HTTPS only; no credentials in the URL; ≤ 2048 chars.
- Blocked hostnames: `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.lan`, `*.home`, `*.corp`, `*.intranet`, `*.railway.internal`, `*.convex.cloud`, `*.convex.site`, `metadata.google.internal`, `metadata`, `instance-data`, `kubernetes.default.svc`, bare single-label hosts.
- Blocked literal addresses: 0/8, 10/8, 127/8, 100.64/10, 169.254/16 (cloud metadata), 172.16/12, 192.0.0/24, 192.168/16, 198.18/15, multicast/reserved (≥ 224), `::`, `::1`, `fe80::/10`, `fc00::/7`, `ff00::/8`, `64:ff9b::/96`, IPv4-mapped IPv6.
- At delivery time the hostname is resolved (A + AAAA) through Cloudflare DoH and **all** answers must be public; hostnames that resolve to a private range (DNS rebinding) or do not resolve are refused. Limitation: `fetch` cannot pin the resolved address, so a resolver that answers differently within the same second could still rebind — the policy check plus the short window is the practical mitigation, documented in `docs/ASSUMPTIONS.md`.

## Management

Dashboard `/app/developer/webhooks` and Convex functions `webhooks.list / create / update / rotateSecret / remove / sendTest / deliveries / retry` (owner session). Limits: 10 endpoints per account, 1–7 event types each, optional single-project scope. Creating or rotating returns the secret **once**; the stored secret is only read by the delivery action and never by a query. Audit rows: `webhook_created`, `webhook_secret_rotated`, `webhook_deleted`.

MCP (`docs/MCP.md`): `usertrack_get_webhooks`, `usertrack_create_webhook`, `usertrack_update_webhook`, `usertrack_test_webhook`, `usertrack_get_webhook_deliveries` with scopes `webhooks:read` / `webhooks:write`. Agents are told to hand the secret to the founder and never log it.

## Relationship to follow notifications

Webhooks are machine subscriptions owned by the project owner. Follow notifications (`docs/FOLLOWS.md`) are human emails to people who follow a product. They share the underlying stored events but are separate surfaces with separate preferences.

## Tests

`convex/lib/webhooks.test.ts` (URL policy, IP classification, signing vector, headers, retry schedule, payload) and `convex/webhooks.test.ts` (create / rotate / ownership, dispatch fan-out + dedupe + scope + disabled + demo exclusion, milestone wiring, attempt bookkeeping through exhaustion, 4xx finality, test event).
