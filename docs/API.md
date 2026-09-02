# UserTrack public API

Read-only JSON API over everything that is public on UserTrack: SaaS profiles, metrics, history, milestones, leaderboards, categories and founder profiles. Plus an embeddable SVG badge.

- **Base URL:** `https://usertrack.dev/api/v1` (self-hosted: `${NEXT_PUBLIC_SITE_URL}/api/v1`)
- **Auth:** optional API key (see below). Without a key you still get the full data set at a lower rate limit.
- **Format:** JSON, UTF-8. Timestamps are ISO 8601 (UTC). Money (`mrr`) is in minor units (cents) of `currency`.
- **OpenAPI:** `https://usertrack.dev/api/openapi.json` (OpenAPI 3.1, generated from the route code in `src/lib/api/openapi.ts`).

## Versioning

`v1` is stable. Changes are **additive only**: new fields, new optional query params, new endpoints. Fields are never renamed, removed, or change type within v1. Optional fields may be absent (omitted, not `null`) when the underlying data does not exist or the owner has not opted in to sharing it. Breaking changes will ship under `/api/v2`.

## Authentication (optional)

API keys raise the rate limit and give you per-key usage in the dashboard. They do not unlock extra data: the API only ever returns what is public on the website.

1. Sign in and open `https://usertrack.dev/app/developer`.
2. Create an **API key**. It starts with `ut_api_` and is shown **once**; only a SHA-256 hash is stored.
3. Send it with every request, either way:

```
Authorization: Bearer ut_api_…
X-API-Key: ut_api_…
```

Keys carry the `metrics:read` scope, can be revoked at any time, and can optionally expire (up to 365 days). Up to 25 active keys/tokens per account. Keys cannot be used for the MCP endpoint (`ut_mcp_` tokens are a separate type).

## Rate limits

| | Anonymous | With API key |
| --- | --- | --- |
| Limit | 60 requests / minute per client IP | 1,000 requests / day per key |
| Burst | — | 120 requests / minute |
| Caching | `public, s-maxage=300, stale-while-revalidate=600` | `private, no-store` |
| `X-RateLimit-Window` | `minute` | `day` |

Anonymous limits are a token bucket that refills at 1 request/second. Keyed requests are counted per UTC day in the backend and additionally pass an in-process burst bucket.

Every response carries:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 993
X-RateLimit-Window: day
X-RateLimit-Reset: 1756857600        # unix seconds, keyed requests only
```

Exceeding a limit returns `429 rate_limited` with a `Retry-After` header (seconds). Badge responses are not rate limited.

## Caching and CORS

Anonymous responses are cached for 5 minutes at the edge, so identical requests may be up to 5 minutes old. Keyed responses are never cached. `Access-Control-Allow-Origin: *` is set on every response, `Authorization` and `X-API-Key` are allowed request headers, and `OPTIONS` preflight returns `204`, so the API can be called straight from browsers.

## Envelope

Success:

```json
{
  "data": { ... },
  "meta": { "version": "v1", "generatedAt": "2026-09-02T10:15:00.000Z" }
}
```

Error:

```json
{ "error": { "code": "not_found", "message": "No public SaaS with slug \"acme\"" } }
```

| Status | `code` | When |
| ------ | -------------- | --- |
| 400 | `bad_request` | Invalid query parameter; the message lists the accepted values. |
| 401 | `unauthorized` | Key has the wrong format (`ut_api_` + 40 base62 chars) or does not exist. |
| 401 | `revoked` | Key was revoked in the dashboard. |
| 401 | `expired` | Key passed its expiry date. |
| 403 | `forbidden` | Token is missing a required scope (only reachable through MCP today). |
| 404 | `not_found` | Unknown slug/username, or the product is private. |
| 429 | `rate_limited` | Limit exceeded; see `Retry-After`. |
| 500 | `internal` | Unexpected error. |

## SaaS object

Returned by `/saas/{slug}`, in each leaderboard row and in `/users/{username}.saas[]`.

| Field | Type | Notes |
| --- | --- | --- |
| `slug`, `name`, `description`, `websiteUrl` | string | |
| `logoUrl`, `category` | string? | `category` is a slug from `/categories` |
| `tags` | string[] | |
| `demo` | boolean | `true` for seeded showcase products |
| `trust.level` | `"verified" \| "unverified" \| "pending"` | `verified` = read-only sync from a connected provider |
| `trust.label` | string | human wording, e.g. `Verified`, `Partially verified`, `Self-reported`, `Pending`, `Data under review` |
| `trust.score` | number? | 0-100, only present when `level` is `verified` |
| `metrics.totalUsers`, `newUsers24h`, `newUsers7d`, `newUsers30d` | number | |
| `metrics.growth7dPct`?, `growth30dPct` | number | percent |
| `metrics.activated` | object? | `{ total, last24h?, last7d?, last30d?, ratePct? }`, only with an activation source |
| `metrics.retention` | object? | `{ retainedUsers, churnedUsers, ratePct, source: "estimated" \| "verified" }` |
| `metrics.traffic` | object? | `{ visitors30d, sessions30d?, visitorsPrev30d? }`, only if the owner opted in |
| `metrics.revenue` | object? | `{ payingUsers, mrr?, currency? }`, only if the owner opted in; `mrr` in cents |
| `ranks` | object | `{ leaderboard?, previousLeaderboard?, trending?, previousTrending?, trendingScore7d? }` |
| `followers` | number | |
| `owner` | object? | `{ username, displayName }` |
| `timestamps` | object | `{ firstSnapshotAt?, lastSyncedAt? }` ISO strings |
| `urls` | object | `{ page, badge }` |

---

## `GET /api/v1/saas/{slug}`

One SaaS plus its 8 most recent milestones.

```bash
curl https://usertrack.dev/api/v1/saas/acme
```

```json
{
  "data": {
    "slug": "acme",
    "name": "Acme",
    "description": "Invoicing for indie hackers.",
    "websiteUrl": "https://acme.dev",
    "logoUrl": "https://acme.dev/logo.png",
    "category": "fintech",
    "tags": ["invoicing", "b2b"],
    "demo": false,
    "trust": { "level": "verified", "label": "Verified", "score": 87 },
    "metrics": {
      "totalUsers": 12481,
      "newUsers24h": 41,
      "newUsers7d": 312,
      "newUsers30d": 1922,
      "growth7dPct": 2.6,
      "growth30dPct": 18.2,
      "activated": { "total": 4870, "last7d": 120, "last30d": 610, "ratePct": 39 }
    },
    "ranks": { "leaderboard": 4, "previousLeaderboard": 6, "trending": 9, "trendingScore7d": 412.5 },
    "followers": 23,
    "owner": { "username": "jane", "displayName": "Jane Doe" },
    "timestamps": { "firstSnapshotAt": "2026-03-01T00:00:00.000Z", "lastSyncedAt": "2026-09-02T08:00:00.000Z" },
    "urls": { "page": "https://usertrack.dev/s/acme", "badge": "https://usertrack.dev/api/badge/acme.svg" },
    "milestones": [
      { "id": "k97...", "kind": "users", "title": "10K users", "copy": "Acme crossed 10,000 users.", "value": 10000, "achievedAt": "2026-08-20T14:02:11.000Z" }
    ]
  },
  "meta": { "version": "v1", "generatedAt": "2026-09-02T10:15:00.000Z" }
}
```

`404 not_found` if the slug does not exist or the product is private.

## `GET /api/v1/saas/{slug}/metrics`

Compact current metrics: the numbers a badge, widget or newsletter needs. Field names are spelled out (`growth30dPercentage`, `overallRank`) so the payload reads well without the full object.

```bash
curl https://usertrack.dev/api/v1/saas/acme/metrics
```

```json
{
  "data": {
    "slug": "acme",
    "name": "Acme",
    "verification": "verified",
    "metrics": {
      "totalUsers": 12481,
      "newUsers24h": 41,
      "newUsers7d": 312,
      "newUsers30d": 1922,
      "growth7dPercentage": 2.6,
      "growth30dPercentage": 18.2,
      "activatedUsers": 4870,
      "activationRatePercentage": 39,
      "trendingRank": 9,
      "overallRank": 4
    },
    "updatedAt": "2026-09-02T08:00:00.000Z",
    "urls": { "page": "https://usertrack.dev/s/acme", "badge": "https://usertrack.dev/api/badge/acme.svg" }
  },
  "meta": { "version": "v1", "generatedAt": "2026-09-02T10:15:00.000Z" }
}
```

`activatedUsers`, `activationRatePercentage`, `growth7dPercentage`, `trendingRank` and `overallRank` are omitted when not available.

## `GET /api/v1/saas/{slug}/history`

Time series of total users.

| Param | Values | Default |
| --- | --- | --- |
| `range` | `24h`, `7d`, `30d`, `90d`, `1y`, `all` | `30d` |

`24h`/`7d` return raw sync snapshots (roughly every 4h); longer ranges return one point per UTC day. `activatedUsers` is present only on daily points for products with an activation source.

```bash
curl "https://usertrack.dev/api/v1/saas/acme/history?range=7d"
```

```json
{
  "data": {
    "range": "7d",
    "points": [
      { "t": "2026-08-26T12:00:00.000Z", "totalUsers": 12169, "newUsers": 0 },
      { "t": "2026-08-26T16:00:00.000Z", "totalUsers": 12190, "newUsers": 21 },
      { "t": "2026-08-26T20:00:00.000Z", "totalUsers": 12214, "newUsers": 24 }
    ]
  },
  "meta": { "version": "v1", "generatedAt": "2026-09-02T10:15:00.000Z" }
}
```

`400 bad_request` for an unknown `range`, `404 not_found` for an unknown slug.

## `GET /api/v1/saas/{slug}/milestones`

The 8 most recent milestones, newest first.

```bash
curl https://usertrack.dev/api/v1/saas/acme/milestones
```

```json
{
  "data": [
    { "id": "k97...", "kind": "users", "title": "10K users", "copy": "Acme crossed 10,000 users.", "value": 10000, "achievedAt": "2026-08-20T14:02:11.000Z" },
    { "id": "k96...", "kind": "top10", "title": "Top 10", "copy": "Acme entered the top 10 on the 30-day leaderboard.", "value": 8, "achievedAt": "2026-08-14T02:00:00.000Z" }
  ],
  "meta": { "version": "v1", "generatedAt": "2026-09-02T10:15:00.000Z" }
}
```

`kind` is one of `users`, `activated`, `best_day`, `best_week`, `rank`, `top10`, `top100`, `streak`, `monthly_growth`, `trending_top10`.

## `GET /api/v1/leaderboard`

| Param | Values | Default |
| --- | --- | --- |
| `board` | `trending`, `fastest`, `most-users`, `most-new`, `most-activated`, `activation-rate`, `new-rising` | `most-new` |
| `window` | `24h`, `7d`, `30d` | `7d` for `trending`, otherwise `30d` |
| `category` | any slug from `/categories` | all |
| `verified` | `true`, `false` | `true` (only verified products) |
| `size` | `0-100`, `100-1k`, `1k-10k`, `10k-100k`, `100k+` (total users) | all |
| `limit` | 1..100 | 50 |

Rows are the SaaS object plus `position` (1-based), `movement` (`{ kind: "up" | "down" | "same" | "new", delta }` or `null` when unranked) and, for `board=trending` only, `explain` (a short human-readable reason string).

```bash
curl "https://usertrack.dev/api/v1/leaderboard?board=trending&window=7d&category=ai&limit=2"
```

```json
{
  "data": {
    "board": "trending",
    "window": "7d",
    "rows": [
      {
        "position": 1,
        "movement": { "kind": "up", "delta": 2 },
        "explain": "+312 new users · 1.8× the previous period · +3% relative · 39% activate",
        "slug": "acme",
        "name": "Acme",
        "...": "remaining SaaS object fields"
      },
      {
        "position": 2,
        "movement": { "kind": "new", "delta": 0 },
        "explain": "+140 new users · first growth in this window · +28% relative",
        "slug": "promptly",
        "name": "Promptly",
        "...": "remaining SaaS object fields"
      }
    ]
  },
  "meta": { "version": "v1", "generatedAt": "2026-09-02T10:15:00.000Z" }
}
```

`400 bad_request` on any invalid value; the message lists the accepted values.

## `GET /api/v1/trending`

Alias for `/leaderboard?board=trending`. Accepts the same `window`, `category`, `size`, `verified` and `limit` params and returns the same envelope (`board` is always `"trending"`, `window` defaults to `7d`).

```bash
curl "https://usertrack.dev/api/v1/trending?window=24h&limit=5"
```

## `GET /api/v1/categories`

Categories that currently have at least one public product.

```bash
curl https://usertrack.dev/api/v1/categories
```

```json
{
  "data": [
    { "slug": "ai", "label": "AI", "count": 14, "url": "https://usertrack.dev/categories/ai" },
    { "slug": "developer-tools", "label": "Developer Tools", "count": 9, "url": "https://usertrack.dev/categories/developer-tools" }
  ],
  "meta": { "version": "v1", "generatedAt": "2026-09-02T10:15:00.000Z" }
}
```

## `GET /api/v1/users/{username}`

Public founder profile plus their public SaaS projects (full SaaS objects, without milestones). Usernames are case-insensitive.

```bash
curl https://usertrack.dev/api/v1/users/jane
```

```json
{
  "data": {
    "username": "jane",
    "displayName": "Jane Doe",
    "avatarUrl": "https://usertrack.dev/avatars/jane.png",
    "bio": "Building Acme. Previously at Stripe.",
    "links": { "website": "https://jane.dev", "x": "janedoe", "github": "janedoe" },
    "followers": 118,
    "urls": { "profile": "https://usertrack.dev/u/jane" },
    "saas": [
      { "slug": "acme", "name": "Acme", "...": "remaining SaaS object fields" }
    ]
  },
  "meta": { "version": "v1", "generatedAt": "2026-09-02T10:15:00.000Z" }
}
```

`avatarUrl`, `bio` and individual `links` are omitted when not set. `404 not_found` for an unknown username.

---

## Badge: `GET /api/badge/{slug}.svg`

A 28px-high shields.io-style SVG. The `.svg` suffix is optional. Not rate limited; cached for 5 minutes at the client and 1 hour at the edge (`Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400`), served as `image/svg+xml` with `Access-Control-Allow-Origin: *`.

| Param | Values | Default | Right segment |
| --- | --- | --- | --- |
| `type` | `users` | `users` | `12,481 users` |
| | `growth` | | `+18.2% · 30d` |
| | `trending` | | `#4 trending` (or `— trending` when unranked) |
| | `verified` | | trust label, e.g. `VERIFIED`, `SELF-REPORTED` |
| `theme` | `dark`, `light` | `dark` | |

Unknown slugs still return `200` with a neutral "not found" badge, so a broken embed never shows a broken image.

HTML:

```html
<a href="https://usertrack.dev/s/acme"><img src="https://usertrack.dev/api/badge/acme.svg?type=users" alt="Acme users on UserTrack" height="28"></a>
```

Markdown:

```markdown
[![Acme users on UserTrack](https://usertrack.dev/api/badge/acme.svg?type=users)](https://usertrack.dev/s/acme)
```

Light background, growth variant:

```html
<img src="https://usertrack.dev/api/badge/acme.svg?type=growth&theme=light" alt="Acme 30-day growth on UserTrack" height="28">
```

---

## Writing data

The public API is read-only. Founders create projects, connect data sources and publish through the dashboard or through the MCP server (`https://usertrack.dev/mcp`), see `docs/MCP.md`.
