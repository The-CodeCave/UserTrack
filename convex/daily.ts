import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { PAGE, jobError, recordPage, startRun } from "./jobs";
import { dailyMilestones, streakDays } from "./lib/milestones";
import { BENCHMARK_METRICS, BENCHMARK_METRIC_LABEL, MIN_SAMPLE, MIN_SAMPLE_CONVERSION, benchmarkValue, cohortsFor, deciles, isConversionBenchmark, percentileOf, type BenchmarkMetric } from "./lib/benchmarks";
import { rankable } from "./leaderboard";
import { addMilestones } from "./trust";
import { DAY, dayKey, weekKey } from "./lib/time";
import { addOnceEvent, addEvent } from "./domain/events";
import { publicLogo, visibilityOf } from "./domain/visibility";
import { sortBoard, type Board } from "./public";
import { trustLevel } from "./schema";
import { CATEGORIES } from "../src/lib/categories";

// Young products with real early traction get one "traction" feed event (never repeated). Same rule as docs/DISCOVERY.md.
export const TRACTION_RULES = { maxAgeDays: 30, minNew7d: 100 } as const;
// A category cohort standing at or above this percentile becomes a monthly "benchmark" feed event.
export const BENCHMARK_FEED_PERCENTILE = 90;

// Daily sweep: best day / week / streak / monthly-growth milestones, traction events, then benchmarks and the trust review.
// Paged: PAGE.daily products per transaction (each reads up to 400 daily rows + its milestones), chained by the scheduler.
export const run = internalMutation({
  args: { cursor: v.optional(v.string()), runId: v.optional(v.id("jobRuns")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const runId = args.runId ?? (await startRun(ctx, "daily sweep"));
    const page = await ctx.db.query("saas").paginate({ cursor: args.cursor ?? null, numItems: PAGE.daily });
    let errors = 0;
    let lastError: string | undefined;
    for (const s of page.page) {
      if (s.isDemo) continue;
      try {
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
      } catch (e) {
        errors++;
        lastError = jobError("daily sweep", s._id, e);
      }
    }
    await recordPage(ctx, runId, { items: page.page.length, errors, lastError, done: page.isDone });
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.daily.run, { cursor: page.continueCursor, runId });
      return;
    }
    await ctx.scheduler.runAfter(0, internal.daily.benchmarks, {});
    await ctx.scheduler.runAfter(5_000, internal.trust.dailyReview, {});
    await ctx.scheduler.runAfter(30_000, internal.share.benchmarkSweep, {});
    await ctx.scheduler.runAfter(10_000, internal.email.lifecycle.noGrowthSweep, {});
    await ctx.scheduler.runAfter(15_000, internal.cohorts.rebuildAll, {});
    await ctx.scheduler.runAfter(20_000, internal.native.pruneEvents, {});
    await ctx.scheduler.runAfter(25_000, internal.webhooks.retrySweep, {});
    await ctx.scheduler.runAfter(35_000, internal.social.refreshFollowers, {});
    await ctx.scheduler.runAfter(45_000, internal.retention.sweep, {});
    // First day of the month: freeze last month's rankings for /rankings/<year>/<month> and the datasets API.
    if (new Date(now).getUTCDate() === 1) await ctx.scheduler.runAfter(40_000, internal.daily.snapshotRankings, { period: monthKey(now - DAY) });
  },
});

export const monthKey = (ts: number) => new Date(ts).toISOString().slice(0, 7);

// ---- Benchmarks ---------------------------------------------------------------------------------------------------
// Cohort deciles (aggregates) + this week's standings per product (benchmarkHistory) + top-decile feed events.
// Phase 1 pages a compact projection (cohort keys + the metric values) into the action, phase 2 writes the
// aggregates in chunks, phase 3 re-reads them per product in pages. Ceiling: ~50k products in the accumulator.
interface BenchmarkInput { cohorts: string[]; values: (number | null)[] }

export const benchmarkInputs = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), now: v.number() },
  handler: async (ctx, { cursor, now }) => {
    const page = await ctx.db.query("saas").paginate({ cursor, numItems: PAGE.benchmarks });
    const rows: BenchmarkInput[] = page.page.filter(rankable).map((s) => ({
      cohorts: cohortsFor(s, now).map((c) => c.key),
      values: BENCHMARK_METRICS.map((m) => benchmarkValue(s, m) ?? null),
    }));
    return { rows, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export const benchmarks = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const runId = await ctx.runMutation(internal.jobs.begin, { job: "benchmarks" });
    const standingsRun = await ctx.runMutation(internal.jobs.begin, { job: "benchmark standings" });
    const values = new Map<string, number[]>();
    let cursor: string | null = null;
    let items = 0;
    for (;;) {
      const page: { rows: BenchmarkInput[]; isDone: boolean; continueCursor: string } = await ctx.runQuery(internal.daily.benchmarkInputs, { cursor, now });
      for (const row of page.rows) {
        items++;
        for (const key of row.cohorts) {
          for (const [i, metric] of BENCHMARK_METRICS.entries()) {
            const value = row.values[i];
            if (value === null) continue;
            const k = `${key}:${metric}`;
            const bucket = values.get(k);
            if (bucket) bucket.push(value);
            else values.set(k, [value]);
          }
        }
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    // Every (cohort, metric) that has members now is either rewritten or deleted; cohorts nobody is in are left alone.
    const groups = [...new Set([...values.keys()].map((k) => k.slice(0, k.lastIndexOf(":"))))];
    const writes = groups.flatMap((groupKey) => BENCHMARK_METRICS.map((metric) => {
      const vs = values.get(`${groupKey}:${metric}`) ?? [];
      const enough = vs.length >= (isConversionBenchmark(metric) ? MIN_SAMPLE_CONVERSION : MIN_SAMPLE);
      return { groupKey, metric, sampleSize: vs.length, deciles: enough ? deciles(vs) : [] };
    }));
    for (let i = 0; i < writes.length; i += 100) await ctx.runMutation(internal.daily.writeAggregates, { rows: writes.slice(i, i + 100), now });
    await ctx.runMutation(internal.jobs.record, { runId, items, done: true });
    let next: string | undefined;
    for (;;) {
      const res: { isDone: boolean; cursor: string } = await ctx.runMutation(internal.daily.standings, { now, cursor: next, runId: standingsRun });
      if (res.isDone) break;
      next = res.cursor;
    }
  },
});

// Phase 2: aggregates for one chunk of cohorts. An empty `deciles` array means "below the sample floor" — the row is dropped.
export const writeAggregates = internalMutation({
  args: { rows: v.array(v.object({ groupKey: v.string(), metric: v.string(), sampleSize: v.number(), deciles: v.array(v.number()) })), now: v.number() },
  handler: async (ctx, { rows, now }) => {
    for (const r of rows) {
      const existing = await ctx.db.query("benchmarkAggregates").withIndex("by_group_metric", (q) => q.eq("groupKey", r.groupKey).eq("metric", r.metric)).unique();
      if (!r.deciles.length) {
        if (existing) await ctx.db.delete(existing._id);
        continue;
      }
      const doc = { groupKey: r.groupKey, metric: r.metric, sampleSize: r.sampleSize, deciles: r.deciles, computedAt: now };
      if (existing) await ctx.db.patch(existing._id, doc);
      else await ctx.db.insert("benchmarkAggregates", doc);
    }
  },
});

// Phase 3: standings from the stored aggregates — one history row per product per ISO week, patched until the week closes.
export const standings = internalMutation({
  args: { now: v.number(), cursor: v.optional(v.string()), runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const now = args.now;
    const runId = args.runId;
    const week = weekKey(now);
    const day = dayKey(now);
    const month = monthKey(now);
    const page = await ctx.db.query("saas").paginate({ cursor: args.cursor ?? null, numItems: PAGE.benchmarks });
    let errors = 0;
    let lastError: string | undefined;
    for (const s of page.page) {
      if (!rankable(s)) continue;
      try {
        const standings = [];
        for (const c of cohortsFor(s, now)) {
          for (const metric of BENCHMARK_METRICS) {
            const value = benchmarkValue(s, metric);
            if (value === undefined) continue;
            const agg = await ctx.db.query("benchmarkAggregates").withIndex("by_group_metric", (q) => q.eq("groupKey", c.key).eq("metric", metric)).unique();
            if (!agg) continue;
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
      } catch (e) {
        errors++;
        lastError = jobError("benchmark standings", s._id, e);
      }
    }
    await recordPage(ctx, runId, { items: page.page.length, errors, lastError, done: page.isDone });
    return { isDone: page.isDone, cursor: page.continueCursor };
  },
});

// ---- Monthly ranking snapshots -------------------------------------------------------------------------------------
// Boards frozen per month. Only boards/categories with at least MIN_SNAPSHOT_ROWS rankable products get a page.
export const SNAPSHOT_BOARDS: Board[] = ["most-new", "fastest", "trending"];
export const MIN_SNAPSHOT_ROWS = 3;

export const snapshotInputs = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("saas").withIndex("by_public_new30d", (q) => q.eq("isPublic", true)).paginate({ cursor, numItems: PAGE.snapshot });
    return { rows: page.page.filter(rankable), isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

// The ordering is global, so the public set is paged into the action first and each board/category is written on its own.
export const snapshotRankings = internalAction({
  args: { period: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, { period, force }) => {
    if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("period must be YYYY-MM");
    const now = Date.now();
    const runId = await ctx.runMutation(internal.jobs.begin, { job: "ranking snapshots" });
    const all: Doc<"saas">[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page: { rows: Doc<"saas">[]; isDone: boolean; continueCursor: string } = await ctx.runQuery(internal.daily.snapshotInputs, { cursor });
      all.push(...page.rows);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    const cats: (string | undefined)[] = [undefined, ...CATEGORIES.map((c) => c.slug)];
    let written = 0;
    for (const board of SNAPSHOT_BOARDS) {
      for (const category of cats) {
        const rows = sortBoard(all, { board, window: board === "trending" ? "30d" : "30d", verifiedOnly: true, category, limit: 100 });
        if (rows.length < MIN_SNAPSHOT_ROWS) continue;
        written += await ctx.runMutation(internal.daily.writeSnapshot, {
          period, board, category, force, now, sampleSize: rows.length,
          rows: rows.map((s, i) => ({ slug: s.slug, name: s.name, logoUrl: publicLogo(s), category: s.category, rank: i + 1, value: snapshotValue(s, board), totalUsers: s.totalUsers, newUsers30d: s.newUsers30d, growth30dPct: s.growth30dPct, trust: s.trust })),
        });
      }
    }
    await ctx.runMutation(internal.jobs.record, { runId, items: written, done: true });
    return { period, written };
  },
});

const snapshotRow = v.object({ slug: v.string(), name: v.string(), logoUrl: v.optional(v.string()), category: v.optional(v.string()), rank: v.number(), value: v.number(), totalUsers: v.number(), newUsers30d: v.number(), growth30dPct: v.number(), trust: trustLevel });

export const writeSnapshot = internalMutation({
  args: { period: v.string(), board: v.string(), category: v.optional(v.string()), force: v.optional(v.boolean()), now: v.number(), sampleSize: v.number(), rows: v.array(snapshotRow) },
  handler: async (ctx, { period, board, category, force, now, sampleSize, rows }) => {
    const existing = await ctx.db.query("rankingSnapshots").withIndex("by_period_board_category", (q) => q.eq("period", period).eq("board", board).eq("category", category)).unique();
    if (existing && !force) return 0;
    const doc = { period, board, category, sampleSize, computedAt: now, rows };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("rankingSnapshots", doc);
    return 1;
  },
});

const snapshotValue = (s: Doc<"saas">, board: Board) => (board === "fastest" ? s.growth30dPct : board === "trending" ? (s.trendingScore30d ?? 0) : s.newUsers30d);
