# Lifecycle funnel

UserTrack models every product — web SaaS, mobile app or both — with one normalized lifecycle:

```
REACHED → SIGNED UP → ACTIVATED → TRIAL → CONVERTED
```

Not every product has every stage. The funnel is built dynamically from the stages that have a **connected source with real data**; missing stages are simply absent, never rendered empty. Source: `convex/domain/funnel.ts`, UI `src/components/public/funnel.tsx`, API `GET /api/v1/saas/{slug}/funnel`, MCP `usertrack_get_funnel`.

## Stage semantics

| Stage | Product term | Meaning | Fed by role | Typical sources |
|---|---|---|---|---|
| `reached` | Visitors | Unique visitors / active users of the marketing site or app in the window | `traffic` | PostHog, Plausible, GA4 (also Firebase-Analytics-linked GA4 properties), endpoint |
| `signed_up` | Total / New Users ("Registered users" for mobile) | A unique account in the identity store | `users` | Clerk, Supabase, Firebase Auth, Auth0, PostgreSQL, endpoint, manual |
| `activated` | Activated Users | A user who reached the first meaningful value (configured event / table / SQL) | `activation` | PostHog, Supabase, PostgreSQL, endpoint |
| `trial` | Trial Users | A user currently in (flow: who started) a free trial, only when the conversion source exposes reliable trial state (`capabilities.trial`) | `conversion` | Stripe, RevenueCat, Paddle, Lemon Squeezy, Chargebee, endpoint |
| `converted` | Converted Users | A unique user who reached the configured monetization condition | `conversion` | same as trial |

"Converted" deliberately replaces "Paying": it works for subscriptions, one-time payments, lifetime deals, mobile subscriptions and usage-based products. The condition is the project's **conversion mode** (`active_paid` default · `ever_paid` · `first_payment`, see `docs/PROVIDERS.md`). Sign in with Apple / Google are authentication *methods* and never a stage source.

Examples of valid funnels:

```
Web SaaS      Visitors → Signups → Activated → Converted
Mobile app    Registered → Activated → Trial → Converted
Simple SaaS   Signups → Converted
Free product  Signups → Activated
```

## Windows, flows and stocks

Timeframes are `7d`, `30d`, `90d` (previous window of the same length for comparison). Everything is computed from `dailyMetrics` (≤ 2 × days indexed rows), never from raw snapshots or provider calls.

- **Flows** (default for every stage): sums of the daily columns `visitors`, `newUsers`, `newActivated`, `newTrials`, `newConverted` inside the window. "Converted 447 (30d)" means 447 users converted in the last 30 days.
- **Stocks** are used only as a fallback when a conversion source cannot report flows and no daily rows exist yet (e.g. RevenueCat on the first day): the last `convertedUsers` / `trialUsers` value in the window, labelled `kind: "stock"` ("now").
- **Fallbacks** below `min(days, 2)` daily rows: `saas.newUsers7d/30d`, `activated7d/30d`, `newTrials7d/30d`, `newConverted7d/30d`, `visitors30d` (30d only).
- Daily conversion flows come from the provider (`newConverted24h`) when it can report them (Stripe, Paddle, Lemon Squeezy, Chargebee, endpoint) and otherwise from stock deltas clamped at zero (RevenueCat) — churn never produces negative conversions.

## Rates

Adjacent rates are attached to each stage (`conversionPct`, `previousConversionPct`). Strategic rates are returned separately in `rates[]` and only when both stages exist:

| Rate | Label |
|---|---|
| reached → signed_up | Visitor → Signup |
| signed_up → activated | Signup → Activated |
| activated → trial | Activated → Trial |
| trial → converted | Trial → Converted |
| activated → converted | Activated → Converted |
| signed_up → converted | Signup → Converted |

`pct = to / from × 100`, rounded to 0.1, capped at 999 %, `undefined` when the denominator is 0. Rates are always computed from real values even when the count is hidden (below), so a public rate is exact and cannot be reverse-engineered from a rounded display value.

Materialized on `saas` for boards, benchmarks and emails: `signupToConvertedPct` (converted ÷ total users), `activatedToConvertedPct`, `trialToConvertedPct` (30-day conversions ÷ 30-day trial starts, or converted ÷ (trial + converted) when only stocks exist), `convertedGrowth30dPct`.

## Aggregate vs Cohort Verified

Two confidence levels exist and are never mixed:

- **Aggregate** (`basis: "aggregate"`, every funnel above): period ratios. "1,000 signups, 600 activations and 100 conversions this month" gives useful ratios but does not prove those 100 came from those 1,000.
- **Cohort Verified** (`basis: "cohort"`, `docs/IDENTITY.md`): "of the users who signed up in August, 61 % activated and 12.7 % converted within 30 days". Requires identity matching; exposed as `cohorts[]` via `api.cohorts.*`, `GET /api/v1/saas/{slug}/cohorts`, MCP `usertrack_get_cohorts`.

Every funnel carries `identityQuality` (`aggregate_only` · `partially_mapped` · `cohort_verified`). The **Cohort Verified** badge is shown only for `cohort_verified`. Benchmarks and leaderboards use aggregate rates only.

## Provenance, freshness, health

Each stage carries `source { provider, label, verification, updatedAt, status, trial, identity }`, `updatedAt` (last successful sync of that source) and `health`:

| health | rule |
|---|---|
| `healthy` | last sync ok |
| `attention` | the source's last sync failed (`status: "error"`) |
| `stale` | no successful sync for > 49 h |

One broken source never breaks the project: the dashboard shows "Growth · Healthy / Activation · Healthy / Conversion · Needs attention". Funnel-level `verification` is `verified` only when every stage is verified, `self_reported` when all are, `mixed` otherwise, `none` without sources. Freshness is shown per stage ("Users updated 18m ago · Conversion updated 2h ago"), never as one timestamp for the whole funnel.

## Visibility (connection ≠ publication)

`funnelOptionsFor(visibility)` decides what the public funnel contains:

| Visibility key | Effect |
|---|---|
| `traffic` | Reached stage |
| `activationRate` | Activated stage |
| `conversionRate` | Converted stage with rates; `value` is `null` when `convertedCount` is off |
| `trialConversion` | Trial stage + Trial → Converted |
| `convertedCount` | absolute converted / trial counts |

The owner funnel (`saas.funnel`, MCP) always contains every connected stage. Defaults: growth + activation public, every conversion key private.

## History

`funnelHistory` returns one point per day with trailing-7-day ratios (`signupToActivatedPct`, `signupToConvertedPct`, `activatedToConvertedPct`, `trialToConvertedPct`), only for connected + visible stages. The chart shows one line at a time with a metric selector — never five lines by default.

## Testing

`convex/domain/funnel.test.ts` covers the full funnel, partial funnels, missing trial, zero values, visibility gating (connected-but-private, rate-only, count public), health/verification and history. Provider conversion semantics live in `convex/providers/conversion.test.ts`.
