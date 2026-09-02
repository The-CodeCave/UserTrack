// Metric views shared by the dashboard, public API and MCP: summaries, history series, milestones, share data.
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { RANGE_MS, DAY, dayKey, type Range } from "../lib/time";
import { toSeries } from "../lib/metrics";
import { projectUrls } from "./projects";
import { visibilityOf } from "./visibility";

export const TIMEFRAMES = ["24h", "7d", "30d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

const pctChange = (now: number, prev: number | undefined) => (prev === undefined || prev <= 0 ? undefined : Math.round(((now - prev) / prev) * 1000) / 10);

// One window: new users vs the previous window of the same length.
export function windowSummary(s: Doc<"saas">, timeframe: Timeframe) {
  const map = {
    "24h": { newUsers: s.newUsers24h, previous: s.newUsersPrev24h, activated: s.activated24h, converted: s.newConverted24h, growthPct: s.totalUsers - s.newUsers24h > 0 ? Math.round((s.newUsers24h / (s.totalUsers - s.newUsers24h)) * 1000) / 10 : 0, trendingScore: s.trendingScore24h },
    "7d": { newUsers: s.newUsers7d, previous: s.newUsersPrev7d, activated: s.activated7d, converted: s.newConverted7d, growthPct: s.growth7dPct ?? 0, trendingScore: s.trendingScore7d },
    "30d": { newUsers: s.newUsers30d, previous: s.newUsersPrev30d, activated: s.activated30d, converted: s.newConverted30d, growthPct: s.growth30dPct, trendingScore: s.trendingScore30d },
  }[timeframe];
  return {
    timeframe,
    newUsers: map.newUsers,
    previousNewUsers: map.previous,
    changeVsPreviousPct: pctChange(map.newUsers, map.previous),
    growthPct: map.growthPct,
    activatedUsers: map.activated,
    convertedUsers: map.converted,
    trendingScore: map.trendingScore,
  };
}

export function metricsSummary(s: Doc<"saas">, timeframe: Timeframe = "7d") {
  const movement = (rank?: number, prev?: number) => (rank === undefined ? null : prev === undefined ? { kind: "new" as const, delta: 0 } : { kind: prev > rank ? ("up" as const) : prev < rank ? ("down" as const) : ("same" as const), delta: prev - rank });
  return {
    totalUsers: s.totalUsers,
    window: windowSummary(s, timeframe),
    windows: { "24h": windowSummary(s, "24h"), "7d": windowSummary(s, "7d"), "30d": windowSummary(s, "30d") },
    activated: s.activatedUsers === undefined ? undefined : { total: s.activatedUsers, last24h: s.activated24h, last7d: s.activated7d, last30d: s.activated30d, ratePct: s.activationRatePct },
    conversion: s.convertedUsers === undefined ? undefined : {
      mode: s.conversionMode ?? "active_paid", convertedUsers: s.convertedUsers, trialUsers: s.trialUsers, newConverted7d: s.newConverted7d, newConverted30d: s.newConverted30d, newTrials30d: s.newTrials30d,
      convertedGrowth30dPct: s.convertedGrowth30dPct, signupToConvertedPct: s.signupToConvertedPct, activatedToConvertedPct: s.activatedToConvertedPct, trialToConvertedPct: s.trialToConvertedPct,
    },
    identityQuality: s.identityQuality ?? "aggregate_only",
    retention: s.retentionRatePct === undefined ? undefined : { retainedUsers: s.retainedUsers ?? 0, churnedUsers: s.churnedUsers ?? 0, ratePct: s.retentionRatePct, source: s.retentionSource ?? "estimated" },
    ranks: {
      leaderboard: s.rank,
      previousLeaderboard: s.prevRank,
      leaderboardMovement: movement(s.rank, s.prevRank),
      best: s.bestRank,
      trending: s.trendingRank,
      previousTrending: s.prevTrendingRank,
      trendingMovement: movement(s.trendingRank, s.prevTrendingRank),
    },
    verification: s.trust,
    streakDays: s.streakDays ?? 0,
    lastSyncedAt: s.lastSyncedAt ? new Date(s.lastSyncedAt).toISOString() : undefined,
  };
}

// Chart-ready series: raw snapshots for short ranges, daily rollups otherwise. `includeTraffic` / `includeConversion` respect the owner's public toggles.
export interface SeriesPoint { t: number; total: number; delta: number; activated?: number; visitors?: number; converted?: number }

export async function seriesFor(ctx: QueryCtx, s: Doc<"saas">, range: Range, includeTraffic = Boolean(s.showTraffic), includeConversion = visibilityOf(s).convertedCount): Promise<SeriesPoint[]> {
  const ms = RANGE_MS[range];
  const cutoff = ms === null ? 0 : Date.now() - ms;
  if (range === "24h" || range === "7d") {
    const rows = await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", s._id).gte("capturedAt", cutoff)).collect();
    return toSeries(rows);
  }
  const rows = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", s._id).gte("day", dayKey(cutoff))).collect();
  return rows.map((r) => ({ t: Date.parse(`${r.day}T12:00:00Z`), total: r.totalUsers, delta: r.newUsers, activated: r.activatedUsers, visitors: includeTraffic ? r.visitors : undefined, converted: includeConversion ? r.convertedUsers : undefined }));
}

export async function milestonesFor(ctx: QueryCtx, saasId: Id<"saas">, limit = 20) {
  const rows = await ctx.db.query("milestones").withIndex("by_saas_time", (q) => q.eq("saasId", saasId)).order("desc").take(limit);
  return rows.map((m) => ({ id: m._id, key: m.key, kind: m.kind, metric: m.metric, value: m.value, title: m.title, copy: m.copy, achievedAt: new Date(m.achievedAt).toISOString() }));
}

export function shareData(s: Doc<"saas">, username?: string, milestones: Awaited<ReturnType<typeof milestonesFor>> = []) {
  const urls = projectUrls(s, username);
  return {
    ...urls,
    milestoneShares: milestones.map((m) => ({ id: m.id, title: m.title, copy: m.copy, achievedAt: m.achievedAt, page: `${urls.page}/share/milestone-${m.id}`, image: `${urls.page}/share/milestone-${m.id}/card` })),
    shareImages: Object.fromEntries(Object.entries(urls.share).map(([k, v]) => [k, `${v}/card`])) as Record<string, string>,
    headline: { totalUsers: s.totalUsers, newUsers30d: s.newUsers30d, growth30dPct: s.growth30dPct, rank: s.rank, trendingRank: s.trendingRank, signupToConvertedPct: visibilityOf(s).conversionRate ? s.signupToConvertedPct : undefined },
    nextSyncWithinMs: 4 * 60 * 60 * 1000,
  };
}

export const DAY_MS = DAY;
