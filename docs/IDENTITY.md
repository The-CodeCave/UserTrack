# Identity matching & cohorts

Cross-provider identity matching turns an aggregate funnel into a **Cohort Verified** one: UserTrack can then say "12.7 % of the users who signed up in August converted within 30 days" instead of comparing period totals. Source: `convex/lib/identity.ts`, `convex/cohorts.ts`, ingestion in `convex/sync.ts` (`recordIdentities`), schema tables `identityLinks` and `cohortMetrics`.

## Principles

1. **No PII.** UserTrack never ingests emails, names or phone numbers. Providers report stable ids only (an auth user id, a PostHog `distinct_id`, a Stripe `metadata.userId` or customer id, a Paddle `custom_data.userId`…); anything containing `@` is dropped at parse time.
2. **Pseudonymous at rest.** Inside the sync *action* every id is hashed — `SHA-256(IDENTITY_SALT · projectId · id)` — before a mutation ever sees it. The salt is a Convex environment variable (`IDENTITY_SALT`, set on dev and prod); the same id yields different subjects in different projects. Raw ids are never stored or logged.
3. **Bounded.** A provider may report at most `IDENTITY_CAP = 5,000` ids per stage per sync (newest first) and flags `complete: false` when it had more. Ingestion runs in batches of 500 per mutation. The cohort engine reads links in pages of 2,000 and caps a project at 100,000 subjects per stage.
4. **Aggregate output only.** Nothing ever renders a subject. Cohort rows are counts and medians per signup month.
5. **Opt-in per source.** Identity reporting is a capability (`ProviderCapabilities.identity`); providers without it simply feed the aggregate funnel.

## Who reports identities

| Stage | Provider | Id used | How to enable |
|---|---|---|---|
| signed_up | PostgreSQL / Supabase (database mode) | the configured `idColumn` (`auth.users.id` by default) | set the id column in the wizard; `SELECT id, created_at … ORDER BY created_at DESC LIMIT 5001`, rows discarded after hashing |
| signed_up · activated · trial · converted | JSON endpoint | `identities: { signedUp, activated, trial, converted: [{ id, at? }] }` | return your own user ids (never emails) |
| activated | PostHog | identified `distinct_id` of persons with the activation event | call `posthog.identify(userId)` with the same id your identity store uses; UUID-shaped anonymous ids are skipped |
| trial · converted | Stripe | `subscription.metadata.userId` (also `user_id`, `uid`) else `customer` id | set `metadata.userId` when creating subscriptions |
| trial · converted | Paddle | `custom_data.userId` else `customer_id` | pass `customData.userId` at checkout |
| trial · converted | Chargebee | `meta_data.userId` else `customer_id` | set `meta_data` on subscriptions |
| trial · converted | Lemon Squeezy | `customer_id` | map customer ids in your identity source (endpoint) if you need cohorts |
| — | RevenueCat | none in this phase | RevenueCat's overview metrics are aggregate; customer listing would require paging every customer. Use your own backend + endpoint for cohorts. Anonymous `$RCAnonymousID:` customers are never registered users. |
| — | Clerk, Firebase Auth, Auth0 | none | these APIs would require listing users; use a database source or the endpoint for signup identities |

Recommended id mapping (also returned by MCP `usertrack_get_identity_mapping`):

```
Web     internal user id ─ Clerk user id ─ posthog.distinct_id ─ stripe.subscription.metadata.userId
Mobile  Firebase uid    ─ posthog.distinct_id ─ revenuecat.app_user_id (future) / your backend → endpoint
```

## Storage

```
identityLinks   { saasId, stage, subject (hash), source, firstSeenAt, at }   by_saas_stage_subject · by_saas_subject · by_saas_stage_at
cohortMetrics   { saasId, cohort "2026-08", signedUp, activated, trial, converted, activatedD7, convertedD30,
                  medianTimeToActivationMs?, medianTimeToConversionMs?, computedAt }        by_saas_cohort
saas            identityQuality · identityCoveragePct
```

`at` is the provider-reported stage timestamp (signup date, first payment) when known, else the time UserTrack first saw the subject. Replacing a source with a different provider purges that stage's links in bounded batches (`cohorts.purgeStage`) because the id space may differ; disconnecting a role does the same.

## Cohort engine

Runs from the daily sweep (`daily.run` → `cohorts.rebuildAll`, staggered 2 s per project) as an action — never during page rendering:

1. Load subject → time maps for `signed_up`, `activated`, `trial`, `converted`.
2. `buildCohorts`: group signups by month; a subject counts as activated / converted in its **signup cohort** when the same subject appears in that stage; `activatedD7` / `convertedD30` when the stage time is within 7 / 30 days of signup; medians of time-to-activation / time-to-conversion.
3. Identity quality (`identityQualityOf`):

| Quality | Rule |
|---|---|
| `aggregate_only` | no signup subjects or no downstream (activated / converted) subjects |
| `cohort_verified` | ≥ 20 signup subjects, signup coverage ≥ 80 % (signup subjects in the last 90 days ÷ new users in the same 90 days) and match rate ≥ 70 % (downstream subjects found among signups) |
| `partially_mapped` | anything in between |

`identityCoveragePct = coverage × matchRate × 100`. The last 24 cohorts are materialized; stale rows are deleted.

## Surfaces

- Owner: dashboard cohort table, `api.cohorts.mine`, MCP `usertrack_get_cohorts`.
- Public: `api.cohorts.publicCohorts`, `GET /api/v1/saas/{slug}/cohorts` — respects visibility: conversion columns only with `conversionRate`, trial columns with `trialConversion`, absolute counts only with `convertedCount` (otherwise `null`, percentages stay).
- Badge: **Cohort Verified** only for `cohort_verified`; otherwise the funnel is labelled *Aggregate* with the explanation from `IDENTITY_QUALITY_META`.

## Tests

`convex/lib/identity.test.ts` (hashing, quality thresholds, cohort maths incl. D7/D30 and medians), `convex/providers/conversion.test.ts` (identity extraction, anonymous ids, email rejection), `convex/domain/funnel.test.ts` (identityQuality passthrough).
