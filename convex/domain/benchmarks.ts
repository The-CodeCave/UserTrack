// Benchmark views shared by the dashboard, the public page, the API and MCP: cards with cohort definitions and history.
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { BENCHMARK_METRICS, BENCHMARK_METRIC_LABEL, MIN_SAMPLE, benchmarkInsight, benchmarkValue, cohortsFor, describeCohort, isConversionBenchmark, medianMultiple, percentileChangeInsight, percentileOf, publicBenchmarkStatement, topBand, type BenchmarkMetric, type Cohort } from "../lib/benchmarks";
import { visibilityOf } from "./visibility";
import { weekKey, DAY } from "../lib/time";

type Ctx = QueryCtx | MutationCtx;

export const isBenchmarkEligible = (s: Doc<"saas">) => s.isPublic && s.trust === "verified" && !s.isDemo && s.trustState !== "review";

// Standing four weeks ago (or the oldest row inside the last eight weeks) — the "last month" reference for change insights.
export async function previousStandings(ctx: Ctx, saasId: Id<"saas">, now = Date.now()) {
  const target = weekKey(now - 28 * DAY);
  const floor = weekKey(now - 56 * DAY);
  const row = await ctx.db.query("benchmarkHistory").withIndex("by_saas_week", (q) => q.eq("saasId", saasId).gte("week", floor).lte("week", target)).order("desc").first();
  return row;
}

export interface BenchmarkCard {
  group: string;
  groupLabel: string;
  groupShort: string;
  dimension: Cohort["dimension"];
  cohortDefinition: string;
  metric: BenchmarkMetric;
  metricLabel: string;
  value: number;
  percentile: number;
  previousPercentile?: number;
  previousWeek?: string;
  sampleSize: number;
  median: number;
  p10: number;
  p90: number;
  medianMultiple: number | null;
  band: string | null;
  insight: string;
  changeInsight: string | null;
  computedAt: number;
}

// One card per (cohort, metric) that has an aggregate. Cohorts below MIN_SAMPLE simply have no card.
export async function benchmarkCards(ctx: Ctx, saas: Doc<"saas">, now = Date.now()): Promise<BenchmarkCard[]> {
  const cohorts = cohortsFor(saas, now);
  const prev = await previousStandings(ctx, saas._id, now);
  const prevBy = new Map((prev?.standings ?? []).map((s) => [`${s.groupKey}:${s.metric}`, s.percentile]));
  const out: BenchmarkCard[] = [];
  for (const c of cohorts) {
    for (const metric of BENCHMARK_METRICS) {
      const value = benchmarkValue(saas, metric);
      if (value === undefined) continue;
      const agg = await ctx.db.query("benchmarkAggregates").withIndex("by_group_metric", (q) => q.eq("groupKey", c.key).eq("metric", metric)).unique();
      if (!agg) continue;
      const percentile = percentileOf(value, agg.deciles);
      if (percentile === null) continue;
      const median = agg.deciles[4];
      const previousPercentile = prevBy.get(`${c.key}:${metric}`);
      out.push({
        group: c.key, groupLabel: c.label, groupShort: c.short, dimension: c.dimension, cohortDefinition: describeCohort(c.key),
        metric, metricLabel: BENCHMARK_METRIC_LABEL[metric], value, percentile, previousPercentile, previousWeek: previousPercentile === undefined ? undefined : prev?.week,
        sampleSize: agg.sampleSize, median, p10: agg.deciles[0], p90: agg.deciles[8], medianMultiple: medianMultiple(value, median), band: topBand(percentile),
        insight: benchmarkInsight({ metricLabel: BENCHMARK_METRIC_LABEL[metric], groupLabel: c.label, percentile, value, median }),
        changeInsight: previousPercentile === undefined ? null : percentileChangeInsight({ metricLabel: BENCHMARK_METRIC_LABEL[metric], percentile, previousPercentile, sinceLabel: "last month" }),
        computedAt: agg.computedAt,
      });
    }
  }
  return out;
}

// Weekly standings, oldest first. Public callers must gate on visibility.benchmarks and pass `publicOnly`.
export async function benchmarkHistoryFor(ctx: Ctx, saas: Doc<"saas">, weeks = 26, publicOnly = false) {
  const since = weekKey(Date.now() - weeks * 7 * DAY);
  const rows = await ctx.db.query("benchmarkHistory").withIndex("by_saas_week", (q) => q.eq("saasId", saas._id).gte("week", since)).collect();
  const vis = visibilityOf(saas);
  return rows.map((r) => ({
    week: r.week,
    day: r.day,
    computedAt: r.computedAt,
    standings: r.standings
      .filter((s) => !publicOnly || (s.percentile >= 75 && (!isConversionBenchmark(s.metric as BenchmarkMetric) || vis.conversionRate)))
      .map((s) => ({ cohort: s.groupKey, metric: s.metric, metricLabel: BENCHMARK_METRIC_LABEL[s.metric as BenchmarkMetric] ?? s.metric, percentile: s.percentile, band: topBand(s.percentile), sampleSize: s.sampleSize, ...(publicOnly ? {} : { value: s.value, median: s.median }) })),
  }));
}

export interface BenchmarkHighlight { statement: string; percentile: number; band: string; metric: string; cohort: string; cohortKey: string; sampleSize: number; previousPercentile?: number; previousBand?: string | null }

// Public statement ("Top 12% 30-day growth in Developer Tools"): strong positions only, category cohort preferred, owner opt-out respected.
export async function publicBenchmarkHighlight(ctx: Ctx, s: Doc<"saas">): Promise<BenchmarkHighlight | null> {
  if (!s.isPublic || !isBenchmarkEligible(s)) return null;
  const vis = visibilityOf(s);
  if (!vis.benchmarks) return null;
  const metrics: BenchmarkMetric[] = ["growth30dPct", "activationRatePct", "newUsers30d", "acceleration30dPct", "signupToConvertedPct", "convertedGrowth30dPct", "trialToConvertedPct"];
  const prev = await previousStandings(ctx, s._id);
  const prevBy = new Map((prev?.standings ?? []).map((x) => [`${x.groupKey}:${x.metric}`, x.percentile]));
  let best: BenchmarkHighlight | null = null;
  for (const c of cohortsFor(s)) {
    for (const metric of metrics) {
      if (metric === "trialToConvertedPct" && !vis.trialConversion) continue;
      if (isConversionBenchmark(metric) && !vis.conversionRate) continue;
      const value = benchmarkValue(s, metric);
      if (value === undefined) continue;
      const agg = await ctx.db.query("benchmarkAggregates").withIndex("by_group_metric", (q) => q.eq("groupKey", c.key).eq("metric", metric)).unique();
      if (!agg) continue;
      const percentile = percentileOf(value, agg.deciles);
      if (percentile === null) continue;
      const statement = publicBenchmarkStatement({ metricLabel: BENCHMARK_METRIC_LABEL[metric], groupLabel: c.label, percentile });
      if (statement && (!best || percentile > best.percentile)) {
        const previousPercentile = prevBy.get(`${c.key}:${metric}`);
        best = { statement, percentile, band: topBand(percentile)!, metric, cohort: c.label, cohortKey: c.key, sampleSize: agg.sampleSize, previousPercentile, previousBand: previousPercentile === undefined ? undefined : topBand(previousPercentile) };
      }
    }
    if (best) break;
  }
  return best;
}

export { MIN_SAMPLE };
