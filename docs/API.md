# UserTrack public API

Read-only JSON API over everything that is public on UserTrack: SaaS profiles, metrics, history, milestones, funnels, benchmark statements, leaderboards, discovery sections + activity feed, comparisons, categories and founder profiles. Plus embeddable SVG badges and share-card images.

- **Base URL:** `https://usertrack.dev/api/v1` (self-hosted: `${NEXT_PUBLIC_SITE_URL}/api/v1`)
- **Auth:** optional API key (see below). Without a key you still get the full data set at a lower rate limit.
- **Format:** JSON, UTF-8. Timestamps are ISO 8601 (UTC). The API carries user counts and rates only — never amounts, MRR or ARR (`docs/METRICS.md`, no-revenue policy).
- **OpenAPI:** `https://usertrack.dev/api/openapi.json` (OpenAPI 3.1, generated from the route code in `src/lib/api/openapi.ts`).


> Provider identifiers that can appear in `source.provider` (funnel stages): `native`, `clerk`, `supabase`, `firebase`, `auth0`, `postgres`, `posthog`, `plausible`, `ga4`, `stripe`, `revenuecat`, `paddle`, `lemonsqueezy`, `chargebee`, `endpoint`, `manual`. `native` is the app's own SDK integration (`@usertrack/better-auth` or `@usertrack/node`; the `source.label` names the adapter, e.g. "Better Auth" or "Prisma (UserTrack SDK)") and is always `verification: "verified"`. v0.6 rows named `better_auth` are migrated to `native`. No integration URLs or secrets are ever exposed.

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

Exceeding a limit returns `429 rate_limited` with a `Retry-After` header (seconds). Badges have their own bucket (120 requests/minute per IP, see below) and do not count against the API limits.

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
| `metrics.conversion` | object? | `{ convertedUsers?, newConverted7d?, newConverted30d?, convertedGrowth30dPct?, trialUsers?, signupToConvertedPct?, activatedToConvertedPct?, trialToConvertedPct? }` — each field only when the matching visibility key (Conversion rate · Trial conversion · Converted count) is public. Counts and rates are published independently. |
| `metrics.revenue` | object? | **Deprecated alias** `{ payingUsers }` = `conversion.convertedUsers`, kept for v1 clients. Never contains amounts. |
| `identityQuality` | `"aggregate_only" \| "partially_mapped" \| "cohort_verified"`? | Whether the same users can be traced across stages (`docs/IDENTITY.md`) |
| `projectType` | `"web" \| "mobile" \| "hybrid"`? | |
| `stores` | object? | `{ appStore?, googlePlay? }` store links for mobile / hybrid products |
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

## `GET /api/v1/saas/{slug}/funnel`

The lifecycle funnel **Reached → Signed up → Activated → Trial → Converted** for a window, with the previous window of the same length, conversion between adjacent stages, the strategic rates and per-stage provenance. The funnel is **dynamic**: only stages with a connected source that the owner publishes are returned (Reached needs the *Visitors* toggle, Trial the *Trial conversion* toggle, Converted the *Conversion rate* or *Converted count* toggle). Semantics: `docs/FUNNEL.md`.

| Param | Values | Default |
| --- | --- | --- |
| `timeframe` | `7d`, `30d`, `90d` | `30d` |

```bash
curl "https://usertrack.dev/api/v1/saas/acme/funnel?timeframe=30d"
```

```json
{
  "data": {
    "timeframe": "30d",
    "days": 30,
    "verification": "verified",
    "coverageDays": 30,
    "basis": "aggregate",
    "identityQuality": "cohort_verified",
    "stages": [
      { "key": "signed_up", "label": "Signed up", "value": 6581, "previous": 5910, "changePct": 11.4, "kind": "flow", "verified": true, "health": "healthy", "updatedAt": "2026-09-02T09:58:00.000Z",
        "source": { "provider": "clerk", "label": "Clerk", "verification": "verified" } },
      { "key": "activated", "label": "Activated", "value": 3601, "previous": 3020, "changePct": 19.2, "conversionPct": 54.7, "previousConversionPct": 51.1, "kind": "flow", "verified": true, "health": "healthy", "updatedAt": "2026-09-02T09:44:00.000Z",
        "source": { "provider": "posthog", "label": "PostHog", "verification": "verified" } },
      { "key": "converted", "label": "Converted", "value": null, "conversionPct": 12.4, "previousConversionPct": 11.9, "kind": "flow", "verified": true, "health": "healthy", "updatedAt": "2026-09-02T08:10:00.000Z",
        "source": { "provider": "stripe", "label": "Stripe", "verification": "verified" } }
    ],
    "rates": [
      { "from": "signed_up", "to": "activated", "label": "Signup → Activated", "pct": 54.7, "previousPct": 51.1, "adjacent": true },
      { "from": "activated", "to": "converted", "label": "Activated → Converted", "pct": 12.4, "previousPct": 11.9, "adjacent": true },
      { "from": "signed_up", "to": "converted", "label": "Signup → Converted", "pct": 6.8, "previousPct": 6.1, "adjacent": false }
    ]
  },
  "meta": { "version": "v1", "generatedAt": "2026-09-02T10:15:00.000Z" }
}
```

- `key` is one of `reached`, `signed_up`, `activated`, `trial`, `converted`. Stages the product does not have (no trial, no reach source, …) are simply absent — never zero-filled.
- `value` is `null` when the owner publishes the **rate** but not the **count** (e.g. Conversion rate on, Converted count off). Rates are still exact.
- `kind`: `flow` stages are sums over the window; `converted` / `trial` are `flow` when the source reports new conversions per day and `stock` (current total) otherwise.
- `conversionPct` is the stage as a percentage of the previous *returned* stage; `changePct` compares with the previous window. Both are omitted when the denominator is missing or zero.
- `rates[]` are the strategically useful ratios (Reached → Signed up, Signup → Activated, Activated → Trial, Trial → Converted, Activated → Converted, Signup → Converted) — only those whose stages are present; `adjacent` says whether the two stages sit next to each other in the returned funnel.
- `basis` is always `aggregate`: period ratios that do not prove the same users moved through the stages. `identityQuality` says whether the identity-matched view exists (`/cohorts`).
- `verified` per stage is `source.verification === "verified"`; `health` is `healthy`, `attention` (last sync failed) or `stale` (older than 2 days); `updatedAt` is that source's own sync time — sources are never pretended to share one timestamp.
- The funnel-level `verification` is `verified` only when every stage is verified, `self_reported` when all are, `mixed` otherwise, `none` without sources. `coverageDays` is the number of daily rows inside the window.

`400 bad_request` for an unknown `timeframe`, `404 not_found` for an unknown or private slug.

---

## `GET /api/v1/saas/{slug}/engagement`

Activated users, activation rate and retention — only when the owner publishes the activation rate (default: on).

```json
{
  "data": {
    "slug": "acme", "name": "Acme", "verification": "verified",
    "engagement": { "activatedUsers": 8540, "activated7d": 210, "activated30d": 1260, "activationRatePct": 68.4, "retention": { "retainedUsers": 5100, "churnedUsers": 2300, "ratePct": 68.9, "source": "estimated" } },
    "updatedAt": "2026-09-02T09:44:00.000Z",
    "urls": { "page": "https://usertrack.dev/s/acme#engagement" }
  }
}
```

`engagement` is `null` (with a `note`) when no activation source is connected or the metric is private.

---

## `GET /api/v1/saas/{slug}/conversion`

Conversion metrics as **user counts and ratios** — never amounts. Fields follow the owner's visibility keys: `signupToConvertedPct` / `activatedToConvertedPct` / `convertedGrowth30dPct` need *Conversion rate*, `trialUsers` / `trialToConvertedPct` need *Trial conversion*, `convertedUsers` / `newConverted7d` / `newConverted30d` need *Converted count*. Connection ≠ publication: a product can have Stripe or RevenueCat connected and return `conversion: null` here.

```json
{
  "data": {
    "slug": "acme", "name": "Acme", "verification": "verified",
    "basis": "aggregate",
    "identityQuality": "partially_mapped",
    "conversion": { "signupToConvertedPct": 8.7, "activatedToConvertedPct": 12.4, "convertedGrowth30dPct": 6.1 },
    "updatedAt": "2026-09-02T08:10:00.000Z",
    "urls": { "page": "https://usertrack.dev/s/acme#conversion" }
  }
}
```

---

## `GET /api/v1/saas/{slug}/cohorts`

Monthly **signup cohorts** traced through the lifecycle using pseudonymous identity links (salted hashes of the ids each source reports — never emails or names, `docs/IDENTITY.md`). This is the *Cohort Verified* view: "12.7 % of users who signed up in August converted within 30 days." Empty (`cohorts: []` + `note`) until at least two connected stages report identities.

```json
{
  "data": {
    "slug": "acme",
    "basis": "cohort",
    "identityQuality": "cohort_verified",
    "identityQualityLabel": "Cohort Verified",
    "explanation": "UserTrack can trace anonymized user progression across the connected lifecycle stages.",
    "cohorts": [
      { "cohort": "2026-08", "signedUp": 1000, "activated": 610, "activationPct": 61, "activatedD7Pct": 48.2, "converted": null, "convertedPct": 12.7, "convertedD30Pct": 11.9, "medianTimeToActivationMs": 5400000, "computedAt": "2026-09-02T03:30:00.000Z" }
    ]
  }
}
```

- Counts are `null` when the owner publishes rates but not counts (`signedUp` / `activated` follow *Converted count* too, so that no count can be reverse-engineered from a rate).
- `trial*` fields exist only with *Trial conversion* public; `converted*` only with *Conversion rate* or *Converted count* public.
- Cohorts are rebuilt daily (`cohorts.rebuildAll`); `computedAt` is the rebuild time.

---

## `GET /api/v1/saas/{slug}/benchmarks`

The public benchmark statement of a product: its best top-quarter position in a cohort (category, size bucket or all SaaS). Weaker positions, cohort members and raw deciles are never exposed (policy in `docs/BENCHMARKS.md`).

```bash
curl https://usertrack.dev/api/v1/saas/acme/benchmarks
```

```json
{
  "data": {
    "slug": "acme",
    "highlight": { "statement": "Top 15% 30-day growth in Developer Tools", "metric": "growth30dPct", "cohort": "Developer Tools", "percentile": 85, "sampleSize": 23 }
  },
  "meta": { "version": "v1", "generatedAt": "2026-09-02T10:15:00.000Z" }
}
```

When there is nothing to say, `highlight` is `null` and `note` explains why: `"No public benchmark statement: the product is not verified, or it is not in the top quarter of any cohort with enough members."` `metric` is one of `growth30dPct`, `activationRatePct`, `newUsers30d`; `percentile` is a multiple of 5 between 75 and 95. `404 not_found` for an unknown or private slug.

## `GET /api/v1/leaderboard`

| Param | Values | Default |
| --- | --- | --- |
| `board` | `trending`, `fastest`, `most-users`, `most-new`, `most-activated`, `activation-rate`, `new-rising`, and the secondary conversion boards `best-conversion`, `best-trial-conversion`, `converted-growth` (only products that publish the matching metric) | `most-new` |
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

## `GET /api/v1/discover`

The discovery sections shown on `/discover` plus the activity feed. Sections are fixed at five verified products each; `category` and `limit` apply to the feed only.

| Param | Values | Default |
| --- | --- | --- |
| `category` | any slug from `/categories` (filters the feed) | all |
| `limit` | 1..100 (feed length) | 30 |

```bash
curl "https://usertrack.dev/api/v1/discover?category=developer-tools&limit=5"
```

```json
{
  "data": {
    "sections": {
      "trending": [ { "movement": { "kind": "up", "delta": 2 }, "slug": "acme", "name": "Acme", "...": "remaining SaaS object fields" } ],
      "fastestToday": [ "..." ],
      "fastestWeek": [ "..." ],
      "newAndRising": [ "..." ],
      "recentlyVerified": [ "..." ],
      "biggestMovers": [ "..." ],
      "hiddenGems": [ "..." ]
    },
    "hiddenGemRules": { "maxUsers": 1000, "minNew7d": 10, "minGrowth7dPct": 10, "minHistoryDays": 7, "minTrustScore": 60 },
    "categories": [ { "slug": "developer-tools", "label": "Developer Tools", "count": 9 } ],
    "feed": [
      { "id": "milestone:k97…:users:10000", "kind": "milestone", "subkind": "users", "at": "2026-08-20T14:02:11.000Z",
        "title": "10K users", "detail": "Acme just crossed 10,000 users on UserTrack.", "value": 10000,
        "saas": { "slug": "acme", "name": "Acme", "logoUrl": "https://acme.dev/logo.png", "category": "developer-tools", "totalUsers": 12481, "trust": { "level": "verified", "label": "Verified" } },
        "urls": { "page": "https://usertrack.dev/s/acme", "share": "https://usertrack.dev/s/acme/share/milestone-k97…" } },
      { "id": "spike:k97…:2026-08-30", "kind": "spike", "subkind": "spike", "at": "2026-08-30T16:00:00.000Z",
        "title": "3.4× a normal day", "detail": "Gained 96 users today vs a 28/day average.", "value": 96,
        "saas": { "...": "" }, "urls": { "page": "https://usertrack.dev/s/acme", "share": "https://usertrack.dev/s/acme/share/spike-k98…" } }
    ]
  },
  "meta": { "version": "v1", "generatedAt": "2026-09-02T10:15:00.000Z" }
}
```

Section rows are SaaS objects plus `movement` (trending movement for the window the section uses; `null` when unranked). Feed items are a merge of stored milestones and growth events for verified, non-demo products, newest first; `kind` is `milestone`, `spike`, `activation_spike`, `launched` or `verified`; `id` is stable (`milestone:{saasId}:{key}` or `{kind}:{saasId}:{day}`) so clients can deduplicate across polls. `urls.share` is present for milestones and user spikes. `400 bad_request` for an unknown category or an out-of-range limit.

## `GET /api/v1/compare`

Two to four public products side by side with daily history, absolute and indexed.

| Param | Values | Default |
| --- | --- | --- |
| `s` | 2–4 slugs, comma separated (required) | — |
| `days` | `7`, `30`, `90`, `365`, `all` | `30` |

```bash
curl "https://usertrack.dev/api/v1/compare?s=acme,globex&days=90"
```

```json
{
  "data": {
    "days": 90,
    "products": [
      {
        "slug": "acme", "name": "Acme", "...": "remaining SaaS object fields",
        "series": [
          { "day": "2026-06-04", "totalUsers": 9800, "newUsers": 31, "activatedUsers": 3900, "index": 100 },
          { "day": "2026-06-05", "totalUsers": 9842, "newUsers": 42, "activatedUsers": 3915, "index": 100.4 }
        ]
      },
      { "slug": "globex", "name": "Globex", "...": "", "series": [ "..." ] }
    ],
    "urls": { "page": "https://usertrack.dev/compare?s=acme,globex&days=90" }
  },
  "meta": { "version": "v1", "generatedAt": "2026-09-02T10:15:00.000Z" }
}
```

`index` is `totalUsers / first non-zero total in the window × 100` (one decimal), so products of different sizes can be plotted on one axis; `activatedUsers` is present only for products with an activation source. `days` is echoed as a number or `"all"`. Duplicate slugs are ignored, private or unknown slugs are dropped. `400 bad_request` for fewer than 2 / more than 4 slugs or an invalid `days`; `404 not_found` when fewer than two of the requested products are public.

## `GET /api/v1/users/{username}`

Public founder profile, founder-level aggregates (`metrics`) and their public SaaS projects (full SaaS objects, without milestones). Usernames are case-insensitive. Hidden profiles (`profilePublic = false`) are `404`.

`metrics` (aggregates over **public** projects only, after per-metric visibility — `docs/PROFILES.md`): `projects`, `verifiedProjects`, `totalUsers`, `newUsers7d`, `newUsers30d`, `growth30dPct` (new ÷ users at the start of the window), `changeVsPrev30dPct?` (only when every project has a previous window), `activation? { activatedUsers, ratePct, projects, method: "weighted" }` (Σ activated ÷ Σ users of projects with an activation source — never a mean of rates), `convertedUsers?` (published counts only), `bestRank?`, `trendingProjects`, `biggestGrowth? { slug, name, newUsers30d }`. Profile fields added in v0.8: `location?`, `xState` (`connected_via_oauth` · `handle_provided` · `unavailable` — a typed handle is never presented as verified), `joinedAt`, `urls.card`, `urls.history`.

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
    "location": "Berlin, DE",
    "links": { "website": "https://jane.dev", "x": "janedoe", "github": "janedoe" },
    "xState": "handle_provided",
    "followers": 118,
    "joinedAt": "2026-06-01T09:00:00.000Z",
    "urls": { "profile": "https://usertrack.dev/u/jane", "card": "https://usertrack.dev/u/jane/card", "history": "https://usertrack.dev/api/v1/users/jane/history" },
    "metrics": { "projects": 2, "verifiedProjects": 2, "totalUsers": 28481, "newUsers7d": 812, "newUsers30d": 3281, "growth30dPct": 13.0, "activation": { "activatedUsers": 11200, "ratePct": 41.4, "projects": 1, "method": "weighted" }, "bestRank": 7, "trendingProjects": 1, "biggestGrowth": { "slug": "acme", "name": "Acme", "newUsers30d": 2900 } },
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

A 28px-high shields.io-style SVG, or a 320×120 mini growth chart. The `.svg` suffix is optional. Served as `image/svg+xml` with `Access-Control-Allow-Origin: *` and `X-Content-Type-Options: nosniff`; cached for 5 minutes at the client and 1 hour at the edge (`Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400`). Public metrics only; no API key is involved. The UserTrack mark is always part of the image.

| Param | Values | Default | Rendering |
| --- | --- | --- | --- |
| `type` | `users` | `users` | `12,481 users` |
| | `growth` | | `+18.2% · 30d` (or `· 7d` with `window=7d`) |
| | `trending` | | `#4 trending` (7-day trending rank; `— trending` when unranked) |
| | `verified` | | trust label, e.g. `VERIFIED`, `PARTIALLY VERIFIED`, `SELF-REPORTED` |
| | `chart` | | 320×120 widget: name, total users, window delta + growth %, 30-day sparkline |
| `theme` | `dark`, `light` | `dark` | |
| `window` | `7d`, `30d` | `30d` | affects `growth` and `chart` only |
| `compact` | `1` | off | badges drop the word "UserTrack" (the mark stays); `chart` becomes 320×96 |

Rate limit: 120 requests per minute per client IP; beyond that `429` with `Retry-After` and `Cache-Control: no-store`. Unknown or private slugs return **`404`** whose body is still a neutral "not found" SVG, so a broken embed shows a labelled badge rather than a broken image. Draft (unpublished) products render that badge until they are published.

The dashboard has a configurator with live preview and copyable HTML / Markdown / image URL at `/app/saas/[id]/embed`; MCP clients get the same snippets from `usertrack_get_embed_code`.

HTML:

```html
<a href="https://usertrack.dev/s/acme"><img src="https://usertrack.dev/api/badge/acme.svg?type=users" alt="Acme users on UserTrack" height="28"></a>
```

Markdown:

```markdown
[![Acme users on UserTrack](https://usertrack.dev/api/badge/acme.svg?type=users)](https://usertrack.dev/s/acme)
```

Light background, growth variant, 7-day window:

```html
<img src="https://usertrack.dev/api/badge/acme.svg?type=growth&theme=light&window=7d" alt="Acme 7-day growth on UserTrack" height="28">
```

Mini chart:

```html
<a href="https://usertrack.dev/s/acme"><img src="https://usertrack.dev/api/badge/acme.svg?type=chart" alt="Acme on UserTrack" height="120"></a>
```

## Widgets: `/widget.js`, `/embed/{slug}`, `GET /api/embed/{slug}.json`

Live, clickable widgets for websites (badges above are static images). One script tag inserts an iframe:

```html
<script async src="https://usertrack.dev/widget.js" data-slug="acme" data-type="users"></script>
```

| Attribute | Values | Default |
|---|---|---|
| `data-type` | `users` (live user count) · `growth` (growth %) · `verified` (Verified by UserTrack) · `chart` (320×120 mini chart) | `users` |
| `data-theme` | `auto` (follows the visitor's system) · `dark` · `light` | `auto` |
| `data-window` | `30d` · `7d` (growth, chart) | `30d` |

The loader creates `<iframe src="https://usertrack.dev/embed/acme?type=users">` right after the script tag and resizes it from the widget's `postMessage({ ut: "size", w, h })`. The plain iframe URL works on its own (`width` 200 / 180 / 170 / 320, `height` 28 / 120). Every widget links to the growth page with `?ref=embed&utm_source=embed&utm_medium=widget&utm_campaign=<type>` and always carries the UserTrack mark. Numbers are the public metrics (visibility applies), rendered on load and refreshed every 5 minutes while the tab is visible from:

```bash
curl https://usertrack.dev/api/embed/acme.json
```

```json
{ "data": { "slug": "acme", "name": "Acme", "totalUsers": 12481, "newUsers7d": 300, "newUsers30d": 1900, "growth7dPct": 2.5, "growth30dPct": 18.2, "trust": "verified", "trustLabel": "Verified", "trendingRank": 4, "lastSyncedAt": 1756800000000, "spark": [10200, 10310, "…"] }, "meta": { "version": "v1", "generatedAt": "…" } }
```

Cached 60 s, CORS `*`, 120 requests/minute per IP (own bucket, like badges); `404 not_found` for unknown or private projects (the iframe renders a neutral “not found” pill). `/embed/{slug}` is `no-store` + `noindex`. **Distribution signal:** the embedding page's host (from the `Referer`, origin only — never paths, IPs or visitors) is stored once per project and host with a load counter (max one write per host per minute); the founder sees the hosts in the configurator, the public page shows “Embedded on N sites”. Own host and `localhost` are ignored.

## Share-card images

Every share page has a deterministic PNG rendered by the same code as its Open Graph image:

```
GET /s/{slug}/share/{kind}/card              1200×630 (OG ratio)
GET /s/{slug}/share/{kind}/card?size=square  1080×1080
```

| `kind` | Card |
| --- | --- |
| `users` | total users + last 30 days |
| `growth` | new users in the last 30 days + growth % |
| `week` | new users in the last 7 days + 7-day growth % |
| `rank` | leaderboard position |
| `trending` | 7-day trending position |
| `activation` | activation rate (only with an activation source) |
| `milestone-{id}` | a stored milestone (`id` from `/saas/{slug}/milestones`) |
| `spike-{id}` | a stored growth spike (`id` from the discovery feed) |

Cached like badges (`max-age=300, s-maxage=3600, stale-while-revalidate=86400`). Unknown slugs, drafts, unknown kinds or ids render a "Not found" card. The share page itself is `/s/{slug}/share/{kind}`; its `opengraph-image` is the 1200×630 variant. Compare pages reference an OG image at `/compare/og?s=a,b&days=30`. These routes live outside `/api/v1` and are not rate limited by the API buckets.

---

## Writing data

The public API is read-only. Founders create projects, connect data sources and publish through the dashboard or through the MCP server (`https://usertrack.dev/mcp`), see `docs/MCP.md`.

## `GET /api/v1/users/{username}/history`

Aggregate user growth across the founder's public projects. `range` = `7d` · `30d` (default) · `90d` · `1y` · `all` (`24h` is rejected — the aggregate is daily).

```bash
curl "https://usertrack.dev/api/v1/users/jane/history?range=90d"
```

```json
{
  "data": {
    "username": "jane",
    "range": "90d",
    "projects": [{ "slug": "acme", "name": "Acme" }, { "slug": "globex", "name": "Globex" }],
    "points": [
      { "t": "2026-06-05T12:00:00.000Z", "totalUsers": 21040, "newUsers": 96, "byProject": [18000, 3040] },
      { "t": "2026-06-06T12:00:00.000Z", "totalUsers": 21151, "newUsers": 111, "byProject": [18090, 3061] }
    ],
    "method": "Daily totals summed across public projects; a project without a row for a day keeps its last known total (forward fill) and contributes 0 before its first day."
  },
  "meta": { "version": "v1", "generatedAt": "2026-09-03T10:15:00.000Z" }
}
```

`byProject[i]` matches `projects[i]`. `400 bad_request` for an invalid range, `404 not_found` for unknown or hidden founders.

## Share cards

Share cards are public URLs, not API endpoints: `/s/{slug}/share/{kind}/card?style=blueprint|aurora|minimal&size=og|square&range=7d|30d|90d|1y|all&chart=1&logo=1&founder=1&verified=1&dates=1&title=…` and `/u/{username}/card?…` (see `docs/SHARING.md`). They render only the public projection of a project (visibility applied), 404 for drafts, are cached for 5 minutes and limited to 40 renders per minute per IP. Private share events, drafts and social preferences are never exposed by the API.
