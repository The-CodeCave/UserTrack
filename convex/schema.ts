import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const trustLevel = v.union(v.literal("verified"), v.literal("unverified"), v.literal("pending"));
export const providerKind = v.union(
  v.literal("clerk"),
  v.literal("supabase"),
  v.literal("endpoint"),
  v.literal("manual"),
);
export const syncStatus = v.union(v.literal("ok"), v.literal("error"), v.literal("running"));

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
    onboardingCompleted: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_username", ["username"]),

  saas: defineTable({
    ownerId: v.id("profiles"),
    name: v.string(),
    slug: v.string(),
    logoUrl: v.optional(v.string()),
    description: v.string(),
    websiteUrl: v.string(),
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
    rank: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    firstSnapshotAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerId"])
    .index("by_public_trust_new30d", ["isPublic", "trust", "newUsers30d"])
    .index("by_public_new30d", ["isPublic", "newUsers30d"]),

  integrations: defineTable({
    saasId: v.id("saas"),
    provider: providerKind,
    // Provider-specific config incl. secrets. NEVER returned to clients; read only in actions.
    config: v.any(),
    status: syncStatus,
    trust: trustLevel,
    lastError: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
  }).index("by_saas", ["saasId"]),

  // Append-only. One row per successful fetch.
  snapshots: defineTable({
    saasId: v.id("saas"),
    totalUsers: v.number(),
    capturedAt: v.number(),
    source: providerKind,
    trust: trustLevel,
    syncRunId: v.optional(v.id("syncRuns")),
  }).index("by_saas_time", ["saasId", "capturedAt"]),

  // One row per SaaS per UTC day; totalUsers = last snapshot of the day.
  dailyMetrics: defineTable({
    saasId: v.id("saas"),
    day: v.string(),
    totalUsers: v.number(),
    newUsers: v.number(),
  }).index("by_saas_day", ["saasId", "day"]),

  syncRuns: defineTable({
    saasId: v.id("saas"),
    integrationId: v.id("integrations"),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: syncStatus,
    totalUsers: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_saas_time", ["saasId", "startedAt"]),
});
