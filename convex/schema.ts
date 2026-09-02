import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const trustLevel = v.union(v.literal("verified"), v.literal("unverified"), v.literal("pending"));
export const providerKind = v.union(
  v.literal("clerk"),
  v.literal("supabase"),
  v.literal("firebase"),
  v.literal("auth0"),
  v.literal("posthog"),
  v.literal("plausible"),
  v.literal("ga4"),
  v.literal("stripe"),
  v.literal("endpoint"),
  v.literal("manual"),
);
export const integrationRole = v.union(v.literal("users"), v.literal("activation"), v.literal("traffic"), v.literal("revenue"));
export const syncStatus = v.union(v.literal("ok"), v.literal("error"), v.literal("running"));
export const trustState = v.union(v.literal("healthy"), v.literal("anomaly"), v.literal("review"), v.literal("low_confidence"));
export const emailStatus = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("failed"),
  v.literal("skipped"),
);
export const recipientStatus = v.union(v.literal("active"), v.literal("bounced"), v.literal("complained"), v.literal("suppressed"));

export default defineSchema({
  profiles: defineTable({
    userId: v.string(),
    username: v.string(),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    website: v.optional(v.string()),
    x: v.optional(v.string()),
    github: v.optional(v.string()),
    linkedin: v.optional(v.string()),
    onboardingCompleted: v.boolean(),
    digestOptIn: v.optional(v.boolean()),
    followerCount: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_username", ["username"])
    .searchIndex("search_name", { searchField: "displayName" }),

  saas: defineTable({
    ownerId: v.id("profiles"),
    name: v.string(),
    slug: v.string(),
    logoUrl: v.optional(v.string()),
    description: v.string(),
    websiteUrl: v.string(),
    category: v.optional(v.string()),
    tags: v.array(v.string()),
    isPublic: v.boolean(),
    isDemo: v.optional(v.boolean()),
    trust: trustLevel,
    // Derived metrics, rewritten by the sync engine. Snapshots remain the source of truth.
    totalUsers: v.number(),
    newUsers24h: v.number(),
    newUsers7d: v.number(),
    newUsers30d: v.number(),
    growth30dPct: v.number(),
    growth7dPct: v.optional(v.number()),
    newUsersPrev24h: v.optional(v.number()),
    newUsersPrev7d: v.optional(v.number()),
    newUsersPrev30d: v.optional(v.number()),
    rank: v.optional(v.number()),
    prevRank: v.optional(v.number()),
    bestRank: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    firstSnapshotAt: v.optional(v.number()),
    // Activation (optional source)
    activatedUsers: v.optional(v.number()),
    activated24h: v.optional(v.number()),
    activated7d: v.optional(v.number()),
    activated30d: v.optional(v.number()),
    activationRatePct: v.optional(v.number()),
    // Retention (estimated from active users where a provider exposes them)
    activeUsers30d: v.optional(v.number()),
    retainedUsers: v.optional(v.number()),
    churnedUsers: v.optional(v.number()),
    retentionRatePct: v.optional(v.number()),
    retentionSource: v.optional(v.union(v.literal("estimated"), v.literal("verified"))),
    // Traffic (opt-in display)
    visitors30d: v.optional(v.number()),
    sessions30d: v.optional(v.number()),
    visitorsPrev30d: v.optional(v.number()),
    showTraffic: v.optional(v.boolean()),
    // Revenue (opt-in display, cents)
    payingUsers: v.optional(v.number()),
    mrr: v.optional(v.number()),
    currency: v.optional(v.string()),
    showRevenue: v.optional(v.boolean()),
    // Trending
    trendingScore24h: v.optional(v.number()),
    trendingScore7d: v.optional(v.number()),
    trendingScore30d: v.optional(v.number()),
    trendingRank: v.optional(v.number()),
    prevTrendingRank: v.optional(v.number()),
    // Trust
    trustScore: v.optional(v.number()),
    trustState: v.optional(trustState),
    // Social
    followerCount: v.optional(v.number()),
    streakDays: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerId"])
    .index("by_public_trust_new30d", ["isPublic", "trust", "newUsers30d"])
    .index("by_public_new30d", ["isPublic", "newUsers30d"])
    .index("by_public_category", ["isPublic", "category"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["isPublic"] })
    .searchIndex("search_description", { searchField: "description", filterFields: ["isPublic"] }),

  integrations: defineTable({
    saasId: v.id("saas"),
    provider: providerKind,
    // undefined = "users" for rows created before roles existed.
    role: v.optional(integrationRole),
    // Provider-specific config incl. secrets. NEVER returned to clients; read only in actions.
    config: v.any(),
    status: syncStatus,
    trust: trustLevel,
    lastError: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    lastFailureAt: v.optional(v.number()),
    consecutiveFailures: v.optional(v.number()),
    connectedAt: v.optional(v.number()),
    backfilledAt: v.optional(v.number()),
    // Email health state machine: one failure mail per unhealthy episode, one recovery mail when it ends.
    healthState: v.optional(v.union(v.literal("healthy"), v.literal("unhealthy"))),
    unhealthySince: v.optional(v.number()),
  })
    .index("by_saas", ["saasId"])
    .index("by_saas_role", ["saasId", "role"]),

  // Append-only. One row per successful users fetch (or backfilled day).
  snapshots: defineTable({
    saasId: v.id("saas"),
    totalUsers: v.number(),
    capturedAt: v.number(),
    source: providerKind,
    trust: trustLevel,
    syncRunId: v.optional(v.id("syncRuns")),
    backfilled: v.optional(v.boolean()),
  }).index("by_saas_time", ["saasId", "capturedAt"]),

  // One row per SaaS per UTC day; totalUsers = last snapshot of the day. Optional columns hold other funnel stages.
  dailyMetrics: defineTable({
    saasId: v.id("saas"),
    day: v.string(),
    totalUsers: v.number(),
    newUsers: v.number(),
    activatedUsers: v.optional(v.number()),
    newActivated: v.optional(v.number()),
    visitors: v.optional(v.number()),
    sessions: v.optional(v.number()),
    payingUsers: v.optional(v.number()),
    mrr: v.optional(v.number()),
    activeUsers30d: v.optional(v.number()),
    // Leaderboard rank at the end of the day (written by the daily sweep), used for monthly rank deltas.
    rank: v.optional(v.number()),
  }).index("by_saas_day", ["saasId", "day"]),

  syncRuns: defineTable({
    saasId: v.id("saas"),
    integrationId: v.id("integrations"),
    role: v.optional(integrationRole),
    provider: v.optional(providerKind),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    attempt: v.optional(v.number()),
    status: syncStatus,
    totalUsers: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_saas_time", ["saasId", "startedAt"]),

  // Persisted achievements. `key` is unique per SaaS so a milestone is never re-created.
  milestones: defineTable({
    saasId: v.id("saas"),
    key: v.string(),
    kind: v.union(
      v.literal("users"),
      v.literal("activated"),
      v.literal("best_day"),
      v.literal("best_week"),
      v.literal("rank"),
      v.literal("top10"),
      v.literal("top100"),
      v.literal("streak"),
      v.literal("monthly_growth"),
      v.literal("trending_top10"),
    ),
    metric: v.string(),
    value: v.number(),
    title: v.string(),
    copy: v.string(),
    achievedAt: v.number(),
  })
    .index("by_saas_key", ["saasId", "key"])
    .index("by_saas_time", ["saasId", "achievedAt"])
    .index("by_time", ["achievedAt"]),

  // Growth events used as chart annotations and feed items.
  events: defineTable({
    saasId: v.id("saas"),
    kind: v.union(v.literal("spike"), v.literal("activation_spike"), v.literal("traffic_spike"), v.literal("reconnect"), v.literal("source_changed")),
    day: v.string(),
    at: v.number(),
    title: v.string(),
    detail: v.string(),
    value: v.optional(v.number()),
    multiple: v.optional(v.number()),
  })
    .index("by_saas_time", ["saasId", "at"])
    .index("by_saas_kind_day", ["saasId", "kind", "day"]),

  follows: defineTable({
    followerId: v.id("profiles"),
    targetType: v.union(v.literal("saas"), v.literal("profile")),
    targetId: v.string(),
  })
    .index("by_follower", ["followerId", "targetType"])
    .index("by_target", ["targetType", "targetId"])
    .index("by_follower_target", ["followerId", "targetType", "targetId"]),

  // Internal anomaly model. Never rendered verbatim to the public.
  fraudFlags: defineTable({
    saasId: v.id("saas"),
    kind: v.union(
      v.literal("impossible_growth"),
      v.literal("sudden_drop"),
      v.literal("reconnect_churn"),
      v.literal("source_switching"),
      v.literal("activation_exceeds_users"),
      v.literal("stale_source"),
    ),
    severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    detail: v.string(),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_saas", ["saasId"])
    .index("by_saas_open", ["saasId", "resolvedAt"]),

  // Deciles per (group, metric), recomputed daily. Individual values are never stored.
  benchmarkAggregates: defineTable({
    groupKey: v.string(),
    metric: v.string(),
    sampleSize: v.number(),
    deciles: v.array(v.number()),
    computedAt: v.number(),
  }).index("by_group_metric", ["groupKey", "metric"]),

  digests: defineTable({
    profileId: v.id("profiles"),
    weekKey: v.string(),
    payload: v.any(),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    sendError: v.optional(v.string()),
  })
    .index("by_profile_week", ["profileId", "weekKey"])
    .index("by_week", ["weekKey"]),

  // Per-user email preferences (Better Auth userId, so users without a profile are covered). Missing row = defaults.
  emailPreferences: defineTable({
    userId: v.string(),
    productNudges: v.boolean(),
    growthMilestones: v.boolean(),
    rankingMilestones: v.boolean(),
    growthAlerts: v.boolean(),
    monthlyReport: v.boolean(),
    weeklyDigest: v.boolean(),
    followedSaasUpdates: v.boolean(),
    timezone: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // Delivery log + dedupe ledger. `dedupeKey` is unique: reserving a row is what makes a send idempotent.
  emailEvents: defineTable({
    userId: v.optional(v.string()),
    emailType: v.string(),
    category: v.union(v.literal("transactional"), v.literal("product"), v.literal("growth")),
    saasId: v.optional(v.id("saas")),
    milestoneId: v.optional(v.id("milestones")),
    recipient: v.string(),
    dedupeKey: v.string(),
    status: emailStatus,
    attempts: v.number(),
    scheduledAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    providerMessageId: v.optional(v.string()),
    error: v.optional(v.string()),
    // Template data (never secrets or auth tokens) plus skip reasons.
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_dedupe", ["dedupeKey"])
    .index("by_user_time", ["userId", "createdAt"])
    .index("by_saas_type_time", ["saasId", "emailType", "createdAt"])
    .index("by_provider_message", ["providerMessageId"])
    .index("by_status_time", ["status", "createdAt"]),

  // Recipient health from Resend webhooks. Hard bounces / complaints suppress non-essential mail.
  emailRecipients: defineTable({
    email: v.string(),
    status: recipientStatus,
    reason: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  // One consolidated report per profile per calendar month; the email is sent from this row.
  monthlyReports: defineTable({
    profileId: v.id("profiles"),
    userId: v.string(),
    period: v.string(),
    payload: v.any(),
    deliverAt: v.number(),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    emailEventId: v.optional(v.id("emailEvents")),
  })
    .index("by_profile_period", ["profileId", "period"])
    .index("by_period", ["period"]),
});
