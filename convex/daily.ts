import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { dailyMilestones, streakDays } from "./lib/milestones";
import { BENCHMARK_METRICS, MIN_SAMPLE, MIN_SAMPLE_CONVERSION, deciles, isConversionBenchmark } from "./lib/benchmarks";
import { sizeBucket } from "./lib/metrics";
import { rankable } from "./leaderboard";
import { addMilestones } from "./trust";
import { dayKey } from "./lib/time";

// Daily sweep: best day / week / streak / monthly-growth milestones, then benchmarks and the trust review.
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("saas").collect();
    for (const s of all) {
      if (s.isDemo) continue;
      const rows = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", s._id)).order("desc").take(400);
      rows.reverse();
      const existing = new Set((await ctx.db.query("milestones").withIndex("by_saas_time", (q) => q.eq("saasId", s._id)).collect()).map((m) => m.key));
      await addMilestones(ctx, s._id, dailyMilestones(rows, s.name, s.growth30dPct, existing));
      const streak = streakDays(rows);
      if (streak !== (s.streakDays ?? 0)) await ctx.db.patch(s._id, { streakDays: streak });
      // Rank at the end of the last closed day, for monthly rank deltas.
      const yesterday = rows.find((r) => r.day === dayKey(Date.now() - 86_400_000));
      if (yesterday && s.rank !== undefined && yesterday.rank !== s.rank) await ctx.db.patch(yesterday._id, { rank: s.rank });
    }
    await ctx.scheduler.runAfter(0, internal.daily.benchmarks, {});
    await ctx.scheduler.runAfter(5_000, internal.trust.dailyReview, {});
    await ctx.scheduler.runAfter(10_000, internal.email.lifecycle.noGrowthSweep, {});
    await ctx.scheduler.runAfter(15_000, internal.cohorts.rebuildAll, {});
    await ctx.scheduler.runAfter(20_000, internal.betterAuth.pruneEvents, {});
  },
});

export const benchmarks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = (await ctx.db.query("saas").collect()).filter(rankable);
    const groups = new Map<string, typeof all>();
    const add = (key: string, s: (typeof all)[number]) => groups.set(key, [...(groups.get(key) ?? []), s]);
    for (const s of all) {
      add("all", s);
      if (s.category) add(`cat:${s.category}`, s);
      add(`size:${sizeBucket(s.totalUsers)}`, s);
    }
    const now = Date.now();
    for (const [groupKey, members] of groups) {
      for (const metric of BENCHMARK_METRICS) {
        const values = members.map((m) => m[metric]).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
        const existing = await ctx.db.query("benchmarkAggregates").withIndex("by_group_metric", (q) => q.eq("groupKey", groupKey).eq("metric", metric)).unique();
        if (values.length < (isConversionBenchmark(metric) ? MIN_SAMPLE_CONVERSION : MIN_SAMPLE)) {
          if (existing) await ctx.db.delete(existing._id);
          continue;
        }
        const doc = { groupKey, metric, sampleSize: values.length, deciles: deciles(values), computedAt: now };
        if (existing) await ctx.db.patch(existing._id, doc);
        else await ctx.db.insert("benchmarkAggregates", doc);
      }
    }
  },
});
