import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { dailyMilestones, streakDays } from "./lib/milestones";
import { BENCHMARK_METRICS, BENCHMARK_METRIC_LABEL, MIN_SAMPLE, MIN_SAMPLE_CONVERSION, benchmarkValue, cohortsFor, deciles, isConversionBenchmark, percentileOf, type BenchmarkMetric } from "./lib/benchmarks";
import { rankable } from "./leaderboard";
import { addMilestones } from "./trust";
import { DAY, dayKey, weekKey } from "./lib/time";
import { addOnceEvent, addEvent } from "./domain/events";
import { publicLogo, visibilityOf } from "./domain/visibility";
import { sortBoard, type Board } from "./public";
import { CATEGORIES } from "../src/lib/categories";

// Young products with real early traction get one "traction" feed event (never repeated). Same rule as docs/DISCOVERY.md.
export const TRACTION_RULES = { maxAgeDays: 30, minNew7d: 100 } as const;
// A category cohort standing at or above this percentile becomes a monthly "benchmark" feed event.
export const BENCHMARK_FEED_PERCENTILE = 90;

// Daily sweep: best day / week / streak / monthly-growth milestones, traction events, then benchmarks and the trust review.
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
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
      const yesterday = rows.find((r) => r.day === dayKey(now - DAY));
      if (yesterday && s.rank !== undefined && yesterday.rank !== s.rank) await ctx.db.patch(yesterday._id, { rank: s.rank });
      if (rankable(s) && s.firstSnapshotAt !== undefined && now - s.firstSnapshotAt <= TRACTION_RULES.maxAgeDays * DAY && s.newUsers7d >= TRACTION_RULES.minNew7d) {
        await addOnceEvent(ctx, s._id, "traction", now, "Early traction", `${s.name} gained ${new Intl.NumberFormat("en").format(s.newUsers7d)} users this week, within its first month on UserTrack.`, s.newUsers7d);
      }
    }
    await ctx.scheduler.runAfter(0, internal.daily.benchmarks, {});
    await ctx.scheduler.runAfter(5_000, internal.trust.dailyReview, {});
    await ctx.scheduler.runAfter(30_000, internal.share.benchmarkSweep, {});
    await ctx.scheduler.runAfter(10_000, internal.email.lifecycle.noGrowthSweep, {});
    await ctx.scheduler.runAfter(15_000, internal.cohorts.rebuildAll, {});
    await ctx.scheduler.runAfter(20_000, internal.native.pruneEvents, {});
    await ctx.scheduler.runAfter(25_000, internal.webhooks.retrySweep, {});
    // First day of the month: freeze last month's rankings for /rankings/<year>/<month> and the datasets API.
    if (new Date(now).getUTCDate() === 1) await ctx.scheduler.runAfter(40_000, internal.daily.snapshotRankings, { period: monthKey(now - DAY) });
  },
});

export const monthKey = (ts: number) => new Date(ts).toISOString().slice(0, 7);

// Cohort deciles (aggregates) + this week's standings per product (benchmarkHistory) + top-decile feed events.
export const benchmarks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const all = (await ctx.db.query("saas").collect()).filter(rankable);
    const groups = new Map<string, typeof all>();
    const membership = new Map<string, ReturnType<typeof cohortsFor>>();
    for (const s of all) {
      const cohorts = cohortsFor(s, now);
      membership.set(s._id, cohorts);
      for (const c of cohorts) groups.set(c.key, [...(groups.get(c.key) ?? []), s]);
    }
    const aggregates = new Map<string, { deciles: number[]; sampleSize: number }>();
    for (const [groupKey, members] of groups) {
      for (const metric of BENCHMARK_METRICS) {
        const values = members.map((m) => benchmarkValue(m, metric)).filter((x): x is number => x !== undefined);
        const existing = await ctx.db.query("benchmarkAggregates").withIndex("by_group_metric", (q) => q.eq("groupKey", groupKey).eq("metric", metric)).unique();
        if (values.length < (isConversionBenchmark(metric) ? MIN_SAMPLE_CONVERSION : MIN_SAMPLE)) {
          if (existing) await ctx.db.delete(existing._id);
          continue;
        }
        const doc = { groupKey, metric, sampleSize: values.length, deciles: deciles(values), computedAt: now };
        if (existing) await ctx.db.patch(existing._id, doc);
        else await ctx.db.insert("benchmarkAggregates", doc);
        aggregates.set(`${groupKey}:${metric}`, { deciles: doc.deciles, sampleSize: doc.sampleSize });
      }
    }
    // Standings from the in-memory aggregates: one history row per product per ISO week, patched until the week closes.
    const week = weekKey(now);
    const day = dayKey(now);
    const month = monthKey(now);
    for (const s of all) {
      const standings = [];
      for (const c of membership.get(s._id) ?? []) {
        for (const metric of BENCHMARK_METRICS) {
          const value = benchmarkValue(s, metric);
          const agg = value === undefined ? undefined : aggregates.get(`${c.key}:${metric}`);
          if (value === undefined || !agg) continue;
          const percentile = percentileOf(value, agg.deciles);
          if (percentile === null) continue;
          standings.push({ groupKey: c.key, metric, value, percentile, median: agg.deciles[4], sampleSize: agg.sampleSize });
        }
      }
      if (!standings.length) continue;
      const row = await ctx.db.query("benchmarkHistory").withIndex("by_saas_week", (q) => q.eq("saasId", s._id).eq("week", week)).unique();
      if (row) await ctx.db.patch(row._id, { day, standings, computedAt: now });
      else await ctx.db.insert("benchmarkHistory", { saasId: s._id, week, day, standings, computedAt: now });
      // Feed: the strongest top-decile category standing of the month, once per product per month, owner opt-out respected.
      if (!visibilityOf(s).benchmarks) continue;
      const best = standings
        .filter((x) => x.groupKey.startsWith("cat:") && !x.groupKey.includes("|") && x.percentile >= BENCHMARK_FEED_PERCENTILE && !(isConversionBenchmark(x.metric as BenchmarkMetric) && !visibilityOf(s).conversionRate))
        .sort((a, b) => b.percentile - a.percentile)[0];
      if (best) {
        const label = BENCHMARK_METRIC_LABEL[best.metric as BenchmarkMetric];
        const cat = CATEGORIES.find((c) => `cat:${c.slug}` === best.groupKey)?.label ?? best.groupKey.slice(4);
        await addEvent(ctx, s._id, "benchmark", month, now, `Top ${100 - best.percentile}% ${label}`, `${s.name} is in the top ${100 - best.percentile}% of ${cat} SaaS for ${label} this month (${best.sampleSize} products compared).`, best.percentile);
      }
    }
  },
});

// Boards frozen per month. Only boards/categories with at least MIN_SNAPSHOT_ROWS rankable products get a page.
export const SNAPSHOT_BOARDS: Board[] = ["most-new", "fastest", "trending"];
export const MIN_SNAPSHOT_ROWS = 3;

export const snapshotRankings = internalMutation({
  args: { period: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, { period, force }) => {
    if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("period must be YYYY-MM");
    const now = Date.now();
    const all = (await ctx.db.query("saas").withIndex("by_public_new30d", (q) => q.eq("isPublic", true)).collect()).filter(rankable);
    const cats: (string | undefined)[] = [undefined, ...CATEGORIES.map((c) => c.slug)];
    let written = 0;
    for (const board of SNAPSHOT_BOARDS) {
      for (const category of cats) {
        const rows = sortBoard(all, { board, window: board === "trending" ? "30d" : "30d", verifiedOnly: true, category, limit: 100 });
        if (rows.length < MIN_SNAPSHOT_ROWS) continue;
        const existing = await ctx.db.query("rankingSnapshots").withIndex("by_period_board_category", (q) => q.eq("period", period).eq("board", board).eq("category", category)).unique();
        if (existing && !force) continue;
        const doc = {
          period, board, category, sampleSize: rows.length, computedAt: now,
          rows: rows.map((s, i) => ({ slug: s.slug, name: s.name, logoUrl: publicLogo(s), category: s.category, rank: i + 1, value: snapshotValue(s, board), totalUsers: s.totalUsers, newUsers30d: s.newUsers30d, growth30dPct: s.growth30dPct, trust: s.trust })),
        };
        if (existing) await ctx.db.patch(existing._id, doc);
        else await ctx.db.insert("rankingSnapshots", doc);
        written++;
      }
    }
    return { period, written };
  },
});

const snapshotValue = (s: Doc<"saas">, board: Board) => (board === "fastest" ? s.growth30dPct : board === "trending" ? (s.trendingScore30d ?? 0) : s.newUsers30d);
