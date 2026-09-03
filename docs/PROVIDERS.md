# Providers

How UserTrack reads growth numbers from third-party systems. Every provider is a read-only adapter behind one interface; the sync engine (`convex/sync.ts`) never branches on provider kind. Source: `convex/providers/*.ts`, `convex/providerRun.ts`, `convex/node/postgres.ts`, `convex/lib/integrationSetup.ts`.

## Interface

```ts
// convex/providers/types.ts
interface Provider<Config> {
  kind: ProviderKind; label: string;
  roles: Role[];                         // users | activation | traffic | conversion  (lifecycle: signed_up · activated · reached · trial+converted)
  capabilities: Capability[];            // static: totalUsers | usersInRange | activeUsers | history | activation | traffic | trial | converted | identity
  validate(config, role) → { ok, config } | { ok: false, error }
  trust(config, saasWebsiteUrl) → "verified" | "unverified" | "pending"
  fetch(config, role) → ProviderMetrics   // totalUsers, newUsers24h/7d/30d, activeUsers30d, activatedUsers(+24h/7d/30d),
                                          // visitors30d, sessions30d, visitorsPrev30d, trialUsers, newTrials7d/30d, convertedUsers,
                                          // newConverted24h/7d/30d, conversionMode, identities[{ stage, ids[{ id, at? }], complete }]
  fetchHistory?(config, role, days) → { metric, points[{ day, value }] } | null
  publicConfig(config) → masked, secret-free view
  describe?(config, role) → ProviderCapabilities   // per configuration; defaults to the static list
  runtime?(config) → "v8" | "node"                 // "node" = TCP database access
  toPostgres?(config, role) → PostgresQuery        // aggregate SQL description for the Node runtime
}
```

`ProviderError(message, retryable)` separates transient failures (429/5xx, timeouts) from configuration errors; only transient failures are retried by the sync engine. `asCount()` rejects anything that is not a finite non-negative number, so a provider can never write garbage into a snapshot.

## Capability model

`ProviderCapabilities` is what one *configured* source can deliver for one role. It is shown in the connect wizard (`CapabilityList`), returned by `integrations.test` / `usertrack_verify_integration`, and used for the funnel's per-stage provenance.

| Capability | Meaning | Derived from static list (`capabilitiesFromList`) |
|---|---|---|
| `totalUsers` | current total read from the source | role `users` and `totalUsers` |
| `createdUsers` | 24h / 7d / 30d signups read from the source (otherwise derived from snapshot deltas) | role `users` and `usersInRange` |
| `historicalUsers` | 30-day daily backfill on connect | role `users` or `activation` and `history` |
| `activationEvents` | activated-user counts | role `activation` and `activation` |
| `retention` | active-in-30-days count → estimated retention | role `users` and `activeUsers` |
| `traffic` | visitors / sessions | role `traffic` and `traffic` |
| `trial` | reliable trial state → the Trial stage is shown | role `conversion` and `trial` |
| `converted` | converted-user counts | role `conversion` and `converted` |
| `identity` | pseudonymous per-stage ids for cohort matching (`docs/IDENTITY.md`) | `identity` (Postgres/Supabase only with an `idColumn`) |

Roles map onto lifecycle stages (`ROLE_STAGE`): `users → signed_up`, `activation → activated`, `traffic → reached`, `conversion → trial + converted`. The legacy role name `revenue` is migrated to `conversion` (`migrations:lifecycleV1`) and normalized everywhere by `normalizeRole()`.

Postgres, Supabase and Firebase override `describe()` because their capabilities depend on the configuration (timestamp column present, custom SQL, scan enabled).

## Verification levels

Two layers of wording exist.

**Source level** (`verificationLevel(kind, trust, caps, role)` in `types.ts`), shown next to each connected source and on every funnel stage:

| Level | Rule |
|---|---|
| `self_reported` | provider trust is not `verified` (manual, endpoint on a foreign host), or kind is `manual` |
| `partially_verified` | verified provider whose `users` configuration can read neither totals nor ranges (`!createdUsers && !totalUsers`) |
| `verified` | everything else |

Every current `users` adapter reports totals, so a source is in practice `verified` or `self_reported`; `partially_verified` is reserved for adapters that only produce derived numbers.

**SaaS level** (`publicTrustLabel` in `convex/lib/trust.ts`), shown on the public page, cards and badges: `Pending` (no successful sync yet) · **Data under review** (open high-severity anomaly flag; the product keeps its page but loses all ranks) · `Self-reported` · `Partially verified` (trust score < 60 or `low_confidence`) · `Verified`. The trust score is documented in `docs/ARCHITECTURE.md`; read-only databases get the same provider base (40) as auth providers.

## Runtime dispatch (V8 vs Node)

Fetch-based providers run in Convex's default V8 runtime (`fetch` + WebCrypto; Google service-account JWTs are signed there too). Anything that needs a TCP socket declares `runtime() === "node"` and is executed by `convex/node/postgres.ts` (`"use node"`, `pg` listed in `convex.json` → `node.externalPackages`).

`convex/providerRun.ts` is the only switch:

```
fetchMetrics(ctx, kind, config, role)
  runtime !== "node" → provider.fetch(config, role)
  runtime === "node" → ctx.runAction(internal.node.postgres.fetch, { pg: provider.toPostgres(config, role), role })
                       ConvexError{ message, retryable } → ProviderError(message, retryable)
fetchHistory(...)     same shape, internal.node.postgres.fetchHistory
hasHistory(kind, config) → node ? Boolean(toPostgres) : Boolean(fetchHistory)
```

Today `postgres` and `supabase` in database mode are the only Node-runtime sources.

## Rate limits and retries

- `fetchJson` (all HTTP providers): on `429` or `503` it waits `min(5 s, Retry-After × (attempt + 1))` and retries, at most twice. Any other non-2xx raises `ProviderError`, retryable for `429` / `5xx`, non-retryable for other `4xx`.
- Sync engine: a retryable failure is rescheduled after `attempt × 10 min` (10, then 20 minutes), max 3 attempts. Six consecutive failures of the `users` source demote the SaaS to `pending`.
- Backfills run through `mapLimit` where a provider needs one request per day (Clerk: 4 in flight).
- Postgres: connect timeout 10 s, statement/query timeout 20 s; `57014` (statement timeout) and network timeouts are retryable, everything else is a configuration error.

## Provider matrix

| Provider | Roles | Credential (least privilege) | Reads | Capabilities | History backfill | Known limits |
|---|---|---|---|---|---|---|
| **Native SDK** (`native`; sources `better-auth`, `prisma`, `drizzle`, `convex`, `authjs`, `custom`) | users, activation, conversion | Integration secret `ut_int_…` generated by UserTrack (shown once, rotatable); the founder installs `@usertrack/better-auth` (plugin) or `@usertrack/node` (one route + count sources) and sets `USERTRACK_PROJECT_ID` / `USERTRACK_SECRET` | `POST <base>/metrics` (Better Auth: `<base>/usertrack/metrics`) signed with HMAC-SHA256 (protocol v1; request + response signatures, ±5 min, nonce-bound reply): `users { totalUsers, newUsers 24h/7d/30d, daily[] }`, optional `activation { activatedUsers, activated24h/7d/30d, daily[] }`, `conversion { convertedUsers, newConverted*, trialUsers, newTrials*, mode }`, `identities`; the users-only shape of 0.1.x plugins is still accepted | totalUsers · createdUsers · historicalUsers · activationEvents · trial · converted · identity — `describe()` follows what the last pull reported | 30 daily `newUsers` / `activatedUsers` in one request (`days: 30`); none for conversion | Sources that cannot filter by time report totals only (`timeFilter: false`); Convex counts are capped (`exactCounts: false` beyond 10k); Better Auth: anonymous-plugin users excluded, adapters without `count` fall back to a bounded id scan (≤ 50k); activation / conversion rows are attached automatically from `reported.roles` and never replace an explicitly connected source; requires protocol 1, client ≥ 0.1.0 |
| **Clerk** | users | Secret key (`sk_live_…`); any key works, only `GET /v1/users/count` is called | `/v1/users/count` with `created_at_after` (24h/7d/30d) and `last_active_at_since` (30d) | totalUsers · createdUsers · historicalUsers · retention | 30 daily `created_at_before` counts, 4 in flight (`metric: totalUsers`) | Counts only; per-user list never requested |
| **Supabase** (database mode, preferred) | users, activation | Read-only Postgres role via the session pooler (`*.supabase.co` / `*.pooler.supabase.com` hosts only) | `SELECT count(*)` on `auth.users` (`deleted_at IS NULL`, `created_at >= $1`) or any table; `GROUP BY day` for history; custom `$1` SELECT for activation | totalUsers · createdUsers · historicalUsers (when a timestamp is known) · activationEvents | `newUsers` per day (users) / cumulative `activatedUsers` (activation); none for custom SQL | Same Node-runtime limits as Postgres |
| **Supabase** (API mode) | users, activation | Project URL + service role key (server-only; full-access key, hence the fallback status) | `GET /auth/v1/admin/users?per_page=1` (`X-Total-Count`) or PostgREST `HEAD …?select=id` with `Prefer: count=exact` (+ `col=gte.` filters) | totalUsers · createdUsers/historicalUsers only with `table` + `createdAtColumn` | one `lt.` count per day, sequential | `auth.users` mode = total only; public schema only |
| **Firebase Auth** | users | Service account JSON with *Firebase Authentication Viewer* only | `accounts:query` (`returnUserInfo: false` → `recordsCount`); `accounts:batchGet` pages of 1,000 keeping only `createdAt` | totalUsers · createdUsers · historicalUsers (scan on) | `newUsers` per day from the same scan | Scan capped at `FIREBASE_SCAN_LIMIT = 100,000` accounts: larger projects silently fall back to totals + snapshot deltas; `scanSignups: false` disables the scan |
| **Auth0** | users | M2M app with `read:users` + `read:stats` | `/api/v2/users?include_totals=true&per_page=0` (+ `q=created_at:[… TO *]`, `search_engine=v3`), `/api/v2/stats/active-users`, `/api/v2/stats/daily` | totalUsers · createdUsers · historicalUsers · retention | `signups` per day from `/stats/daily` (`metric: newUsers`) | Assumes `/stats/active-users` = users active in the last 30 days and that the tenant's search index supports `created_at` range queries |
| **PostgreSQL** | users, activation | Dedicated read-only role, SSL; host reachable from the internet (or a pooler) | `count(*)` with optional `created_at >= $1` / `deleted_at IS NULL` / status filters; `GROUP BY day` for history; custom `$1` SELECT for activation | totalUsers · createdUsers/historicalUsers (timestamp column) · activationEvents | `newUsers` per day / cumulative `activatedUsers`; none for custom SQL | 20 s statement timeout; ≤ 200 tables listed by the wizard |
| **PostHog** | activation, traffic | Personal API key with `query:read` (project `phc_` key is rejected by PostHog) | HogQL `count(distinct person_id)` for the activation event (all / 1 / 7 / 30 days) or `$pageview` (30d + previous 30d, `count(distinct $session_id)`) | activationEvents · historicalUsers (activation) · traffic | daily distinct persons; activation series made cumulative from the all-time count | Event names may not contain `'` (interpolated into HogQL) |
| **Plausible** | traffic | Stats API key | `stats/aggregate?period=30d&metrics=visitors,visits&compare=previous_period`, `stats/timeseries` | traffic | daily visitors | `visitorsPrev30d` is derived from the `change` percentage |
| **GA4** | traffic | Service account with *Viewer* on the property; Analytics Data API enabled | `runReport` with `activeUsers` + `sessions` over `30daysAgo…today` and `60daysAgo…31daysAgo`; date-dimension report for history | traffic | daily `activeUsers` (refreshed for the last 7 days on every run) | — |
| **Stripe** | conversion | Restricted key: Subscriptions = Read | `GET /v1/subscriptions?status=…&limit=100` per status (active, past_due, trialing; + canceled, unpaid, paused for ever-paid modes) — status, customer id, trial/start dates, `metadata.userId`. No prices, invoices or `expand` | trial · converted · identity | — | Max 50 pages per status (**5,000 subscriptions**, non-retryable error beyond); one-time payments not covered (use the endpoint) |
| **RevenueCat** | conversion | v2 secret key with *Charts & Metrics → Read* only | `GET /v2/projects/{id}/metrics/overview` → `active_trials`, `active_subscriptions`; `mrr`/`revenue`/`new_customers`/`active_users` in the same payload are discarded | trial · converted | — | `active_paid` only; no identities (customers include anonymous `$RCAnonymousID:` ids and are never registered users); daily flows derived from stock deltas |
| **Paddle** | conversion | API key, read-only on Subscriptions | `GET /subscriptions?status=…&per_page=200` (live or sandbox): status, `customer_id`, `first_billed_at`, `custom_data.userId` | trial · converted · identity | — | 50 pages max; converted = billed at least once |
| **Lemon Squeezy** | conversion | API key | `GET /v1/subscriptions` (+ `GET /v1/orders` for ever-paid modes), optional `filter[store_id]`; prices and emails dropped at parse time | trial · converted · identity | — | 50 pages max; identities are customer ids only |
| **Chargebee** | conversion | Read-only API key (basic auth) | `GET /api/v2/subscriptions?status[in]=…` : status, `customer_id`, `trial_start`, `activated_at`, `meta_data.userId` | trial · converted · identity | — | 50 pages max; `activated_at` = conversion event |
| **JSON endpoint** | any | Your own route + optional bearer token | One `GET`; role-specific keys (`totalUsers` required for users, `activatedUsers`, `visitors30d`, `convertedUsers` (legacy `payingUsers` accepted), `trialUsers`, `newConverted*`, `newTrials*`, `mode`, `identities`) | totalUsers · createdUsers · retention · activationEvents · traffic · trial · converted · identity (whatever the JSON contains) | — | `verified` only when the host is the SaaS domain (or a sub/parent domain of it), otherwise `unverified` |
| **Manual** | users | none | the typed number | totalUsers | — | Always `self_reported`, never ranked |

## Conversion providers (no-revenue policy)

Payment providers are **conversion-status providers**, not revenue providers. UserTrack never needs amounts, prices, MRR, ARR or transaction volume and does not request them; where a response contains them (RevenueCat overview, Lemon Squeezy attributes) they are discarded at parse time, never persisted, never displayed. All conversion integrations are read-only with the least privilege the provider offers; UserTrack never modifies subscriptions, customers, payments or entitlements. Product copy: *"UserTrack never needs your revenue numbers. Payment providers are used only to calculate user conversion metrics."*

Every provider normalizes its subscriptions / orders into `SubRecord { subject, state, paidAt?, trialAt?, anonymous? }` (`convex/providers/conversion.ts`); `aggregateConversion(records, mode)` produces the lifecycle counts and identities. A provider **customer is never a converted user by itself** — a Stripe customer that never paid, a RevenueCat install or an unpaid trial all count as zero.

**Conversion mode** (`config.mode`, stored on `saas.conversionMode`, provider-independent):

| Mode | Converted means | Notes |
|---|---|---|
| `active_paid` (default) | currently has a paid subscription (`active` / `past_due`) | trials excluded; churned users drop out |
| `ever_paid` | paid at least once, even if churned | Lemon Squeezy adds paid one-time orders |
| `first_payment` | same set as ever paid, counted at the first successful payment | for subscription APIs identical to `ever_paid`; differs only for endpoint data |

Window flows (`newConverted24h/7d/30d`, `newTrials7d/30d`) use the subject's **earliest** payment / latest trial start. Identities (`converted`, `trial`) are the subject ids of the counted users (never anonymous ones), hashed by the sync engine — see `docs/IDENTITY.md`.

**Stripe.** `roles: ["conversion"]`, key must be `rk_`/`sk_` (`rk_` recommended, Subscriptions → Read only). Converted = paid subscription state after the trial (`paidAt = trial_end` when a trial existed, else `start_date`); `trialing` = trial; `incomplete*` never counts; a subscription canceled inside its trial never counts. Only subscriptions are read, so one-time / checkout-only products should use the endpoint provider with their own count.

**RevenueCat** (mobile). Owns only the trial / converted stages: `active_trials` → Trial Users, `active_subscriptions` → Converted Users (RevenueCat excludes trials from active subscriptions). RevenueCat customers are **not** registered users — the identity source is Firebase Auth / Supabase / Auth0 / a database. Sign in with Apple is an authentication method, not a user store. Only `active_paid` is accepted; other modes need the endpoint.

**Paddle / Lemon Squeezy / Chargebee.** Same model; see the matrix for the exact fields. Paddle `first_billed_at`, Chargebee `activated_at` and Lemon Squeezy `trial_ends_at`/`created_at` define `paidAt`.

## PostgreSQL in detail

### Wizard flow (`src/components/app/postgres-wizard.tsx`)

The same component serves `postgres` and Supabase database mode (`provider="supabase"`). Nothing is stored until the last step.

1. **Connect** — connection string (password field) + SSL `auto | require | disable`. "Test connection" calls `integrations.introspectPostgres` without a table: it opens a read-only session, reads `version()` and lists readable tables/views (`TABLES_SQL`: `pg_class` joined with `pg_namespace`, `has_table_privilege(…, 'SELECT')`, system and Supabase-internal schemas excluded, planner row estimates, max 200). Tables are ranked by `rankTables`: `auth.users` first, then name hints (`users`, `profiles`, `accounts`, `members`, `customers`, …), `public` schema bonus, then size. For Supabase, `auth.users` is pre-selected with `created_at` / `deleted_at`.
2. **Table** — filterable list showing kind and `~estimate`. For the `activation` role a second mode, **Custom SQL count**, accepts one SELECT with `$1` as the "since" parameter.
3. **Columns** — `introspectPostgres` with the table returns `information_schema.columns` plus `suggestColumns` (timestamp: `created_at`, `createdat`, `inserted_at`, `signed_up_at`, …; soft-delete: nullable `deleted_at`, `removed_at`, `archived_at`; id: `id`, `user_id`, `uid`) and a preview `count(*)`. Fields: signup / activated-at timestamp (required for activation; unlocks windows + history), stable user id (documentation only), soft-delete column (rows with a value excluded), status column + active value. Numeric timestamp columns are interpreted as epoch (`integer` → seconds, `bigint`/`numeric`/`double precision`/`real` → milliseconds) with a one-click switch.
4. **Confirm** — `integrations.test` runs the real queries and renders the counts, verification level, masked `publicConfig` and the capability list. "Connect & take first snapshot" calls `integrations.connect`, which stores the config, schedules the first sync and the 30-day backfill.

### Read-only role

```sql
CREATE ROLE usertrack_ro LOGIN PASSWORD '<openssl rand -hex 24>';
GRANT CONNECT ON DATABASE <db> TO usertrack_ro;
GRANT USAGE ON SCHEMA <schema> TO usertrack_ro;
GRANT SELECT ON <schema>.<table> TO usertrack_ro;
```

The same template is returned as a `codeTemplates` entry by `usertrack_get_integration_setup` for `postgres` (and for Supabase when a Postgres driver was detected). Never hand over an application `DATABASE_URL` with write access.

### Queries that run

```sql
-- total / windows (countQuery); alive clauses only when configured
SELECT count(*)::text AS n FROM "schema"."table"
 WHERE "deleted_at" IS NULL AND "status"::text = $1 AND "created_at" >= $2::timestamptz
-- history (dailyQuery)
SELECT ("created_at" at time zone 'UTC')::date::text AS day, count(*)::text AS n
  FROM "schema"."table" WHERE … AND "created_at" >= $1::timestamptz GROUP BY 1 ORDER BY 1
```

Epoch columns compare against `extract(epoch from $n::timestamptz)` (× 1000 for milliseconds) and use `to_timestamp()` for the day expression. Identifiers must match `^[a-zA-Z_][a-zA-Z0-9_]*$` (≤ 63 chars) and are always double-quoted. Custom SQL (activation only) is validated by `validateSql`: ≤ 2,000 characters, starts with `SELECT` or `WITH`, no `;`, none of `insert/update/delete/drop/alter/create/truncate/grant/revoke/copy/vacuum/call/do`, only `$1`. It runs with `$1 = 1970-01-01` for the total and `now − 1/7/30 days` for the windows; it has no history backfill.

### SSL

`defaultSsl(host, params)`: `sslmode=disable` → `disable`; any other `sslmode` → `require`; no `sslmode` → `disable` for `localhost`, `127.0.0.1`, `::1`, `*.local`, otherwise `require`. The wizard's `auto` passes no value so this default applies. `require` uses `{ rejectUnauthorized: false }` (encrypted transport, provider certificates accepted without a CA bundle).

### Error mapping (`explain()` in `convex/node/postgres.ts`)

| Condition | Message shown | Retryable |
|---|---|---|
| `ENOTFOUND` / `EAI_AGAIN` | Host not found — check the hostname | no |
| `ECONNREFUSED` | Connection refused — reachable from the internet and correct port? | no |
| `ETIMEDOUT` / "timeout" | Connection timed out — allow inbound connections or use the pooler | yes |
| `28P01` / `28000` | Password authentication failed (URL-encode special characters) | no |
| `3D000` | Database does not exist | no |
| `42P01` | Table not found | no |
| `42703` | Column not found — `<column>` | no |
| `42501` | Permission denied — grant SELECT on the table | no |
| `57014` | Query timed out (20 s) — add an index on the timestamp column or use a smaller table/view | yes |
| `25006` | Query tried to write — only read-only SELECT statements are allowed | no |
| SSL / TLS / certificate text | SSL problem + suggestion to switch `require` ↔ `disable` | no |
| "password must be a string" / SASL | The connection string is missing a password | no |
| anything else | first 200 chars; retryable unless the text contains syntax / invalid / does not exist | depends |

Messages never include the connection string.

### Security properties

- Every session starts with `SET default_transaction_read_only = on`; a write attempt fails with `25006`.
- Only aggregates leave the database: `count(*)`, per-day counts, `version()`, table and column names. No row is ever selected, and introspection never returns data.
- Timeouts: 10 s connect, 20 s per statement (`statement_timeout` + `query_timeout`), `application_name = usertrack`. Connections are closed in `finally`.
- The connection string is stored in `integrations.config` (encrypted at rest, never returned); `publicConfig` shows a masked host, the table (or "custom query") and the signup column.
- Table listing is limited to 200 entries and to objects the role can `SELECT`.

## Supabase: two modes

| | Database mode (recommended) | API mode |
|---|---|---|
| Credential | read-only role on the session pooler | service role key (bypasses RLS, full access) |
| Total users | `count(*)` on `auth.users` where `deleted_at IS NULL` | `X-Total-Count` from the admin users endpoint |
| Signups 24h/7d/30d | read (`created_at >= $1`) | only for a public table with a `createdAtColumn` |
| 30-day history | one `GROUP BY day` query | 30 sequential HEAD requests |
| Activation | table + timestamp or custom SQL | table + optional timestamp |
| Runtime | Node | V8 |

Database mode is recommended because it is both more capable (verified per-window signups and history straight from `auth.users`) and less privileged (a role that can only `SELECT` one table instead of the service role key). `validate` accepts a connection string only for Supabase hosts; the project ref is derived from the host or the `postgres.<ref>` pooler user for `publicConfig`.

## Recommendation order and detection

`recommendIntegrations` (`convex/lib/integrationSetup.ts`) picks the first detected kind in `USERS_PRIORITY`:

```
better_auth → supabase → clerk → firebase → auth0 → postgres → endpoint → manual
```

Direct auth providers first (least setup, read-only keys), then a read-only database (no code change), then the universal JSON endpoint; `manual` is never recommended. Optional extras are added after the users source: PostHog for activation when detected, otherwise Supabase/Postgres activation with the same connection; Plausible or GA4 for traffic; Stripe / RevenueCat / Paddle / Lemon Squeezy / Chargebee for conversion (never revenue). With `projectType` the recommendation returns a full **composition** (`users`, `activation`, `traffic`, `conversion`) plus detected authentication methods; for mobile stacks Sign in with Apple / Google are reported as auth methods and never as the users source (Firebase Auth + Sign in with Apple + PostHog + RevenueCat → Signed up: Firebase, Activated: PostHog, Trial/Converted: RevenueCat). `usertrack_get_provider_recommendation` returns the same result plus a short `priority` list and the env-var `signals` per provider.

`normalizeDetected` lowercases each token, strips a leading `@` and anything after `/`, and turns `_` into `-` before looking it up:

| Maps to | Aliases |
|---|---|
| `better_auth` | `better-auth`, `better_auth`, `@better-auth/*`, `@convex-dev/better-auth`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` |
| `clerk` | `clerk`, `@clerk/*`, `CLERK_SECRET_KEY` |
| `supabase` | `supabase`, `@supabase/*`, `supabase-db`, `SUPABASE_*`, `SUPABASE_DB_URL` |
| `firebase` | `firebase`, `firebase-auth`, `firebase-admin`, `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS` |
| `auth0` | `auth0`, `@auth0/*`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID` |
| `postgres` | `postgres`, `postgresql`, `pg`, `pg-promise`, `postgres.js`, `neon`, `neondatabase`, `@neondatabase/serverless`, `@vercel/postgres`, `vercel-postgres`, `database-url`, `DATABASE_URL`, `prisma:postgresql`, `drizzle-pg` |
| `posthog` / `plausible` / `ga4` / `stripe` | package names (incl. `posthog-react-native`, `posthog-ios`), `gtag`, `google-analytics`, the usual env vars |
| `revenuecat` / `paddle` / `lemonsqueezy` / `chargebee` | `react-native-purchases`, `purchases_flutter`, `RevenueCat`, `@paddle/*`, `@lemonsqueezy/*`, `@chargebee/*` |
| auth methods (not providers) | `AuthenticationServices`, `sign-in-with-apple`, `expo-apple-authentication`, `@invertase/react-native-apple-authentication`, `google-signin` → `authMethods` |
| `endpoint` | `next-auth`, `auth.js`, `lucia`, `convex`, `prisma`, `drizzle`, `mongoose`, `mongodb`, `mysql`, `sqlite`, `kysely`, `sequelize`, `typeorm`, `custom`, `custom-auth`, `custom-db` |

Anything not in the alias table is matched against each catalog entry's `detects` list.

## Better Auth (native plugin)

The only provider whose credential is issued by UserTrack instead of the third party. Flow: the founder (dashboard `better-auth-setup.tsx`) or an agent (`usertrack_create_integration`) creates the integration → `convex/betterAuth.ts::createBetterAuthIntegration` generates a `ut_int_` secret (40 base62 chars), stores it inside `integrations.config` together with its SHA-256 and display prefix, inserts the row with `awaitingVerification: true` (so the cron and "Sync now" skip it) and returns the secret **once**. The founder installs `@usertrack/better-auth`, deploys, clicks **Verify** (`integrations.verifyStored`, or `usertrack_verify_integration` via MCP): one signed pull; on success `markVerified` clears the flag, sets `connectedAt`, and schedules the first `sync.runOne` (which also backfills 30 days of `newUsers`). `pluginVersion` / `protocolVersion` from every successful sync are stored on the integration (`ProviderMetrics.sourceVersion`).

Optional push: the plugin posts signed `user.created` / `user.deleted` events to `POST /api/integrations/better-auth/events` (Next.js) → `betterAuth.ingestEvent` (Convex action: gateway secret, HMAC verification with the stored secret, protocol/type validation, dedupe by `eventId`) → `integrationEvents` (pseudonymous subject only, pruned after 30 days by the daily sweep). The dashboard shows "Live events: n signups since last sync". Snapshots remain the source of truth.

Protocol v1 lives twice on purpose — `packages/better-auth/src/protocol.ts` (published) and `convex/lib/betterAuthProtocol.ts` (server) — because the package must not depend on the app and the Convex bundle must not depend on the package build. Both are pinned to `packages/better-auth/tests/fixtures/signatures.json`, generated by an independent `node:crypto` script. Error mapping (`explainStatus`): 404 → plugin missing (non-retryable), 401 `USERTRACK_UNAUTHORIZED` → secret/project mismatch (non-retryable), 401 `USERTRACK_STALE_REQUEST` → clock skew (retryable), 5xx / 429 / network → retryable; unsupported `protocolVersion` or a plugin below `MIN_PLUGIN_VERSION` → non-retryable with an update hint.

## Adding a provider

1. `convex/providers/<kind>.ts`: implement `Provider<Config>`; keep secrets in `config`, return masked values from `publicConfig`, throw `ProviderError(msg, retryable)` and go through `fetchJson` / `asCount`. Implement `describe()` if capabilities depend on the config; `runtime()` + `toPostgres()` only for TCP sources (reuse `convex/node/postgres.ts`, or add a Node action and list the package in `convex.json`).
2. Register it in `convex/providers/index.ts` and add the literal to `ProviderKind` (`types.ts`), `providerKind` (`convex/schema.ts`), `ProviderKind` in `convex/lib/integrationSetup.ts`, `ProviderKind` in `src/lib/providers-ui.ts`, `PROVIDERS` in `src/lib/mcp/tools.ts` and, if it is an onboarding stack answer, `IDENTITY_PROVIDER` in `src/lib/stack-recommendation.ts`. Renaming a kind: keep the old literal in `convex/schema.ts`, map it in `normalizeProviderKind` (`types.ts`), add a `migrations:*` rewrite for `integrations.provider`, `snapshots.source`, `stageSnapshots.source` and `syncRuns.provider`, and accept the old name as an input alias in `DETECTION_ALIASES` and the MCP enums (see `migrations:nativeV1`).
3. Trust: add a base score to `PROVIDER_BASE` in `convex/lib/trust.ts` (40 auth/database, 30 analytics/endpoint).
4. Catalog: add an `INTEGRATION_CATALOG` entry (roles, trust, `detects`, credentials with `whereToFind`/`envVarHints`, permissions, `reads`), aliases in `DETECTION_ALIASES`, and its position in `USERS_PRIORITY` if it serves the `users` role.
5. UI: setup copy in `src/lib/providers-ui.ts` and the form in `src/components/app/connect-source.tsx` (wire `integrations.test` for the live preview).
6. Tests: `convex/providers/<kind>.test.ts` (validation, response parsing, error mapping) and a catalog case in `convex/lib/integrationSetup.test.ts`.
7. Docs: the matrix above, `docs/API.md` / `docs/MCP.md` where provider lists appear.

A new **native SDK adapter** (another ORM or framework) is not a provider: add a `NativeSource` literal to `packages/protocol` and `convex/lib/nativeProtocol.ts`, a sub-export in `packages/node`, a `SOURCE_FILES` entry in `convex/lib/nativeSetup.ts` (route snippet, optional push hook, notes), detection in `NATIVE_SOURCE_SIGNALS` (`integrationSetup.ts`) and, if it is a stack answer, `NATIVE_SOURCE` in `src/lib/stack-recommendation.ts`.
