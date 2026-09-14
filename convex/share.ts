// Share engine: turns significant achievements into share-ready cards, exactly once each, and serves the Share Center.
import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { PAGE, failRun, jobError, recordPage, startRun } from "./jobs";
import type { Doc, Id } from "./_generated/dataModel";
import { getProfileForUser, requireProfile } from "./profiles";
import type { Milestone } from "./lib/milestones";
import { BENCHMARK_SHARE_METRICS, BENCHMARK_SHARE_PERCENTILE, benchmarkShareKey, shareCategoryFor, shareScore } from "./lib/shareRules";
import { BENCHMARK_METRIC_LABEL, percentileOf } from "./lib/benchmarks";
import { publicTrustLabel } from "./lib/trust";
import { dayKey } from "./lib/time";
import { shareStatus } from "./schema";
import { CATEGORIES } from "../src/lib/categories";

const RANK_KINDS = new Set(["rank", "top10", "top100", "trending_top10"]);
// Same eligibility as the leaderboard (inlined: importing leaderboard.ts here would create an import cycle via trust.ts).
const rankable = (s: Doc<"saas">) => s.isPublic && s.trust === "verified" && !s.isDemo && s.trustState !== "review";
export const SHARE_ACTIONS = ["generated", "downloaded", "copied_link", "copied_image", "x_intent", "dismissed"] as const;
// Card kinds of src/lib/share.ts with the milestone / spike id stripped; anything else would let callers mint unbounded rows.
const TRACKED_KINDS = new Set(["users", "growth", "week", "rank", "trending", "activation", "conversion", "benchmark", "milestone", "spike"]);

interface ShareInput {
  key: string;
  kind: string;
  title: string;
  detail: string;
  metric: string;
  value: number;
  previousValue?: number;
  timeframe?: string;
  rank?: number;
  percentile?: number;
  milestoneId?: Id<"milestones">;
  eventId?: Id<"events">;
  cardKind: string;
}

// Idempotent by (saas, key). Demo products and insignificant achievements never become cards.
export async function recordShareEvent(ctx: MutationCtx, saas: Doc<"saas">, e: ShareInput) {
  if (saas.isDemo) return null;
  const category = shareCategoryFor({ kind: e.kind, value: e.value });
  if (!category) return null;
  const exists = await ctx.db.query("shareEvents").withIndex("by_saas_key", (q) => q.eq("saasId", saas._id).eq("key", e.key)).first();
  if (exists) return exists._id;
  return ctx.db.insert("shareEvents", { profileId: saas.ownerId, saasId: saas._id, category, score: shareScore({ kind: e.kind, value: e.value }), status: "ready", createdAt: Date.now(), ...e });
}

export async function recordMilestoneShare(ctx: MutationCtx, saasId: Id<"saas">, milestoneId: Id<"milestones">, m: Milestone) {
  const saas = await ctx.db.get(saasId);
  if (!saas) return;
  await recordShareEvent(ctx, saas, { key: m.key, kind: m.kind, title: m.title, detail: m.copy, metric: m.metric, value: m.value, rank: RANK_KINDS.has(m.kind) ? m.value : undefined, milestoneId, cardKind: `milestone-${milestoneId}` });
}

export async function recordSpikeShare(ctx: MutationCtx, saas: Doc<"saas">, eventId: Id<"events">, day: string, multiple: number, newToday: number) {
  await recordShareEvent(ctx, saas, { key: `spike:${day}`, kind: "spike", title: `${multiple}× a normal day`, detail: `${saas.name} gained ${newToday} users in a day, ${multiple}× its usual pace.`, metric: "newUsers", value: multiple, timeframe: "24h", eventId, cardKind: `spike-${eventId}` });
}

// Daily, after benchmarks: top-10% positions become one card per metric per month. Category cohort first, then all.
// Paged over the project table so one transaction only ever touches PAGE.share products.
export const benchmarkSweep = internalMutation({
  args: { cursor: v.optional(v.string()), runId: v.optional(v.id("jobRuns")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const runId = args.runId ?? (await startRun(ctx, "benchmark share sweep"));
    if (runId === null) return;
    try {
      const page = await ctx.db.query("saas").paginate({ cursor: args.cursor ?? null, numItems: PAGE.share });
      let errors = 0;
      let lastError: string | undefined;
      for (const s of page.page) {
        if (!rankable(s)) continue;
        try {
          for (const metric of BENCHMARK_SHARE_METRICS) {
            const value = s[metric];
            if (value === undefined) continue;
            const groups = [...(s.category ? [{ key: `cat:${s.category}`, label: `${CATEGORIES.find((c) => c.slug === s.category)?.label ?? s.category} SaaS` }] : []), { key: "all", label: "all SaaS on UserTrack" }];
            for (const g of groups) {
              const agg = await ctx.db.query("benchmarkAggregates").withIndex("by_group_metric", (q) => q.eq("groupKey", g.key).eq("metric", metric)).unique();
              if (!agg) continue;
              const percentile = percentileOf(value, agg.deciles);
              if (percentile === null || percentile < BENCHMARK_SHARE_PERCENTILE) continue;
              const label = BENCHMARK_METRIC_LABEL[metric];
              await recordShareEvent(ctx, s, { key: benchmarkShareKey(metric, now), kind: "benchmark", title: `Top ${100 - percentile}% ${label.toLowerCase()}`, detail: `${s.name} is in the top ${100 - percentile}% of ${g.label} for ${label.toLowerCase()}.`, metric, value: percentile, percentile, timeframe: "30d", cardKind: "benchmark" });
              break;
            }
          }
        } catch (e) {
          errors++;
          lastError = jobError("benchmark share sweep", s._id, e);
        }
      }
      await recordPage(ctx, runId, { items: page.page.length, errors, lastError, done: page.isDone });
      if (!page.isDone) await ctx.scheduler.runAfter(0, internal.share.benchmarkSweep, { cursor: page.continueCursor, runId });
    } catch (e) {
      await failRun(ctx, runId, "benchmark share sweep", e);
    }
  },
});

// ---- Share Center ---------------------------------------------------------------------------------------------------

export const mine = query({
  args: { status: v.optional(shareStatus), limit: v.optional(v.number()) },
  handler: async (ctx, { status, limit }) => {
    const { profile } = await getProfileForUser(ctx);
    if (!profile) return [];
    const rows = status
      ? await ctx.db.query("shareEvents").withIndex("by_profile_status_time", (q) => q.eq("profileId", profile._id).eq("status", status)).order("desc").take(Math.min(limit ?? 50, 100))
      : await ctx.db.query("shareEvents").withIndex("by_profile_time", (q) => q.eq("profileId", profile._id)).order("desc").take(Math.min(limit ?? 50, 100));
    const cache = new Map<string, Doc<"saas"> | null>();
    const out = [];
    for (const e of rows) {
      if (!cache.has(e.saasId)) cache.set(e.saasId, await ctx.db.get(e.saasId));
      const s = cache.get(e.saasId);
      if (!s) continue;
      out.push({ ...e, saas: { _id: s._id, slug: s.slug, name: s.name, logoUrl: s.logoUrl, isPublic: s.isPublic, trust: s.trust, trustLabel: publicTrustLabel(s.trust, s.trustState, s.trustScore), totalUsers: s.totalUsers, newUsers30d: s.newUsers30d, growth30dPct: s.growth30dPct, rank: s.rank, trendingRank: s.trendingRank, category: s.category }, founderHandle: profile.x });
    }
    return out.sort((a, b) => (a.status === b.status ? b.score - a.score || b.createdAt - a.createdAt : a.status === "ready" ? -1 : 1));
  },
});

export const readyCount = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getProfileForUser(ctx);
    if (!profile) return 0;
    return (await ctx.db.query("shareEvents").withIndex("by_profile_status_time", (q) => q.eq("profileId", profile._id).eq("status", "ready")).take(100)).length;
  },
});

async function owned(ctx: MutationCtx, id: Id<"shareEvents">) {
  const { profile } = await requireProfile(ctx);
  const e = await ctx.db.get(id);
  if (!e || e.profileId !== profile._id) throw new Error("Not found");
  return e;
}

export const dismiss = mutation({
  args: { id: v.id("shareEvents") },
  handler: async (ctx, { id }) => {
    await owned(ctx, id);
    await ctx.db.patch(id, { status: "dismissed", dismissedAt: Date.now() });
  },
});

export const markShared = mutation({
  args: { id: v.id("shareEvents") },
  handler: async (ctx, { id }) => {
    await owned(ctx, id);
    await ctx.db.patch(id, { status: "shared", sharedAt: Date.now() });
  },
});

export const restore = mutation({
  args: { id: v.id("shareEvents") },
  handler: async (ctx, { id }) => {
    await owned(ctx, id);
    await ctx.db.patch(id, { status: "ready", dismissedAt: undefined });
  },
});

// Anonymous usage counters (which card kinds get downloaded / posted). No identity, no IP, no URL.
export const track = mutation({
  args: { kind: v.string(), action: v.string() },
  handler: async (ctx, { kind, action }) => {
    if (!(SHARE_ACTIONS as readonly string[]).includes(action)) return;
    const k = kind.replace(/-[a-z0-9]+$/i, "");
    if (!TRACKED_KINDS.has(k)) return;
    const day = dayKey(Date.now());
    const row = await ctx.db.query("shareStats").withIndex("by_day_kind_action", (q) => q.eq("day", day).eq("kind", k).eq("action", action)).unique();
    if (row) await ctx.db.patch(row._id, { count: row.count + 1, updatedAt: Date.now() });
    else await ctx.db.insert("shareStats", { day, kind: k, action, count: 1, updatedAt: Date.now() });
  },
});
