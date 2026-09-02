import { v } from "convex/values";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getProfileForUser, requireProfile } from "./profiles";
import { createProject, updateProject } from "./domain/projects";
import { integrationView } from "./domain/integrations";
import { markLaunched } from "./domain/events";
import { BENCHMARK_METRICS, BENCHMARK_METRIC_LABEL, MIN_SAMPLE, benchmarkInsight, medianMultiple, percentileOf, type BenchmarkMetric } from "./lib/benchmarks";
import { SIZE_BUCKETS, sizeBucket } from "./lib/metrics";
import { CATEGORIES } from "../src/lib/categories";
import { publicTrustLabel } from "./lib/trust";
import { FUNNEL_TIMEFRAMES, funnelFor } from "./domain/funnel";

export async function requireOwnedSaas(ctx: QueryCtx | MutationCtx, id: Id<"saas">) {
  const { profile } = await requireProfile(ctx);
  const saas = await ctx.db.get(id);
  if (!saas || saas.ownerId !== profile._id) throw new Error("SaaS not found");
  return { profile, saas };
}

// Ownership check callable from actions (auth identity propagates through ctx.runQuery).
export const ownedForAction = internalQuery({
  args: { id: v.id("saas") },
  handler: async (ctx, { id }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    return { _id: saas._id, websiteUrl: saas.websiteUrl, totalUsers: saas.totalUsers };
  },
});

const editable = {
  name: v.string(),
  description: v.string(),
  websiteUrl: v.string(),
  logoUrl: v.optional(v.string()),
  category: v.optional(v.string()),
  tags: v.array(v.string()),
};

export const create = mutation({
  args: editable,
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    return createProject(ctx, profile._id, args);
  },
});

export const update = mutation({
  args: { id: v.id("saas"), ...editable, slug: v.optional(v.string()) },
  handler: async (ctx, { id, slug, ...args }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    await updateProject(ctx, saas, { ...args, slug });
  },
});

export const setPublic = mutation({
  args: { id: v.id("saas"), isPublic: v.boolean() },
  handler: async (ctx, { id, isPublic }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    await ctx.db.patch(id, { isPublic });
    if (isPublic) await markLaunched(ctx, saas);
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
  },
});

export const setDisplay = mutation({
  args: { id: v.id("saas"), showTraffic: v.optional(v.boolean()), showRevenue: v.optional(v.boolean()) },
  handler: async (ctx, { id, showTraffic, showRevenue }) => {
    await requireOwnedSaas(ctx, id);
    const patch: Partial<Doc<"saas">> = {};
    if (showTraffic !== undefined) patch.showTraffic = showTraffic;
    if (showRevenue !== undefined) patch.showRevenue = showRevenue;
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("saas") },
  handler: async (ctx, { id }) => {
    await requireOwnedSaas(ctx, id);
    const rows = [
      ...(await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", id)).collect()),
      ...(await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", id)).collect()),
      ...(await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", id)).collect()),
      ...(await ctx.db.query("syncRuns").withIndex("by_saas_time", (q) => q.eq("saasId", id)).collect()),
      ...(await ctx.db.query("milestones").withIndex("by_saas_time", (q) => q.eq("saasId", id)).collect()),
      ...(await ctx.db.query("events").withIndex("by_saas_time", (q) => q.eq("saasId", id)).collect()),
      ...(await ctx.db.query("fraudFlags").withIndex("by_saas", (q) => q.eq("saasId", id)).collect()),
      ...(await ctx.db.query("follows").withIndex("by_target", (q) => q.eq("targetType", "saas").eq("targetId", id)).collect()),
    ];
    for (const r of rows) await ctx.db.delete(r._id);
    await ctx.db.delete(id);
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getProfileForUser(ctx);
    if (!profile) return [];
    return ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", profile._id)).collect();
  },
});

export const getMine = query({
  args: { id: v.id("saas") },
  handler: async (ctx, { id }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    const integrations = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", id)).collect();
    const flags = await ctx.db.query("fraudFlags").withIndex("by_saas_open", (q) => q.eq("saasId", id).eq("resolvedAt", undefined)).collect();
    const milestones = await ctx.db.query("milestones").withIndex("by_saas_time", (q) => q.eq("saasId", id)).order("desc").take(12);
    const runs = await ctx.db.query("syncRuns").withIndex("by_saas_time", (q) => q.eq("saasId", id)).order("desc").take(10);
    return {
      ...saas,
      trustLabel: publicTrustLabel(saas.trust, saas.trustState, saas.trustScore),
      integrations: integrations.map((i) => ({ _id: i._id, ...integrationView(i) })),
      // Neutral wording only; the owner sees that something is being reviewed, not an accusation.
      review: flags.length ? { count: flags.length, kinds: flags.map((f) => f.kind) } : null,
      milestones: milestones.map((m) => ({ _id: m._id, key: m.key, kind: m.kind, title: m.title, copy: m.copy, value: m.value, achievedAt: m.achievedAt })),
      runs: runs.map((r) => ({ _id: r._id, role: r.role ?? "users", provider: r.provider, status: r.status, startedAt: r.startedAt, durationMs: r.durationMs, error: r.error, attempt: r.attempt })),
    };
  },
});

// Percentile cards for the owner's dashboard. Uses stored deciles only; cohorts below MIN_SAMPLE simply do not exist.
export const benchmarks = query({
  args: { id: v.id("saas") },
  handler: async (ctx, { id }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    const bucket = SIZE_BUCKETS.find((b) => b.key === sizeBucket(saas.totalUsers));
    const groups = [
      { key: "all", label: "all SaaS on UserTrack", short: "All SaaS" },
      ...(saas.category ? [{ key: `cat:${saas.category}`, label: `${CATEGORIES.find((c) => c.slug === saas.category)?.label ?? saas.category} SaaS`, short: CATEGORIES.find((c) => c.slug === saas.category)?.label ?? saas.category }] : []),
      { key: `size:${sizeBucket(saas.totalUsers)}`, label: `products with ${bucket?.label ?? "similar"} users`, short: `${bucket?.label ?? "similar"} users` },
    ];
    const previous: Partial<Record<BenchmarkMetric, number | undefined>> = { newUsers30d: saas.newUsersPrev30d, growth7dPct: undefined, growth30dPct: undefined, activationRatePct: undefined, trendingScore7d: undefined };
    const out = [];
    for (const g of groups) {
      for (const metric of BENCHMARK_METRICS) {
        const value = saas[metric];
        if (value === undefined) continue;
        const agg = await ctx.db.query("benchmarkAggregates").withIndex("by_group_metric", (q) => q.eq("groupKey", g.key).eq("metric", metric)).unique();
        if (!agg) continue;
        const percentile = percentileOf(value, agg.deciles);
        if (percentile === null) continue;
        const median = agg.deciles[4];
        out.push({
          group: g.key, groupLabel: g.label, groupShort: g.short, metric, metricLabel: BENCHMARK_METRIC_LABEL[metric], value, percentile, sampleSize: agg.sampleSize, median,
          p10: agg.deciles[0], p90: agg.deciles[8], medianMultiple: medianMultiple(value, median), previousValue: previous[metric],
          insight: benchmarkInsight({ metricLabel: BENCHMARK_METRIC_LABEL[metric], groupLabel: g.label, percentile, value, median }),
          computedAt: agg.computedAt,
        });
      }
    }
    return { eligible: saas.isPublic && saas.trust === "verified" && !saas.isDemo, minSample: MIN_SAMPLE, cards: out };
  },
});

// Owner funnel: all connected stages, including private traffic/revenue.
export const funnel = query({
  args: { id: v.id("saas"), timeframe: v.optional(v.union(...FUNNEL_TIMEFRAMES.map((t) => v.literal(t)))) },
  handler: async (ctx, { id, timeframe }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    return funnelFor(ctx, saas, timeframe ?? "30d", { includeTraffic: true, includeRevenue: true });
  },
});
