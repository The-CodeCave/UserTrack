import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { RANGE_MS, RANGES, DAY, dayKey, type Range } from "./lib/time";
import { SIZE_BUCKETS, sizeBucket } from "./lib/metrics";
import { benchmarkHistoryFor, publicBenchmarkHighlight, type BenchmarkHighlight } from "./domain/benchmarks";
import { seriesFor } from "./domain/metrics";
import { FUNNEL_TIMEFRAMES, funnelFor, funnelHistoryFor, funnelOptionsFor } from "./domain/funnel";
import { stripPrivate, visibilityOf } from "./domain/visibility";
import { publicTrustLabel } from "./lib/trust";
import { explainTrending, trendingFactors } from "./lib/trending";
import { trendingInputs } from "./leaderboard";
import { providerLabel } from "./providers";
import { CATEGORIES } from "../src/lib/categories";
import { aggregateHistory, founderAggregates } from "./lib/founder";
import { downsample, findGaps, rankMovement, resolutionFor, type HistoryPoint } from "./lib/history";

const rangeArg = v.union(...RANGES.map((r) => v.literal(r)));
// Secondary conversion boards only list products whose owner published the rate (visibility), never merely connected a source.
export const BOARDS = ["trending", "fastest", "most-users", "most-new", "most-activated", "activation-rate", "new-rising", "hidden-gems", "movers", "best-conversion", "best-trial-conversion", "converted-growth"] as const;
export type Board = (typeof BOARDS)[number];
const boardArg = v.union(...BOARDS.map((b) => v.literal(b)));
const windowArg = v.union(v.literal("24h"), v.literal("7d"), v.literal("30d"));
const sizeArg = v.union(...SIZE_BUCKETS.map((b) => v.literal(b.key)));
export const PLATFORMS = ["web", "mobile", "hybrid"] as const;
const platformArg = v.union(...PLATFORMS.map((p) => v.literal(p)));
export const platformOf = (s: Pick<Doc<"saas">, "projectType">) => s.projectType ?? "web";
// New & rising: listed within the last 30 days (first stored snapshot, backfills included), ranked by 7-day new users.
export const NEW_RISING_RULES = { maxAgeDays: 30, minNew7d: 5 } as const;

export function publicProfile(p: Doc<"profiles">) {
  const { _id, username, displayName, avatarUrl, bio, website, x, github, linkedin, location, followerCount, _creationTime } = p;
  // A connected X account is the only state that may be presented as more than a typed handle.
  return { _id, username, displayName, avatarUrl, bio, website, x, xConnected: Boolean(p.xUserId), github, linkedin, location, followerCount: followerCount ?? 0, joinedAt: _creationTime };
}

export const isProfilePublic = (p: Doc<"profiles">) => p.profilePublic !== false && p.userId !== "demo";

// Public-safe projection. Connection ≠ publication: every gated metric is removed unless its visibility key is on.
export function publicSaas(s: Doc<"saas">) {
  const vis = visibilityOf(s);
  const rest = stripPrivate({ ...s } as Partial<Doc<"saas">>, vis);
  delete rest.visibility;
  return { ...(rest as Omit<Doc<"saas">, "ownerId">), trustLabel: publicTrustLabel(s.trust, s.trustState, s.trustScore), followerCount: s.followerCount ?? 0, visibility: vis };
}

async function sparkline(ctx: QueryCtx, saasId: Id<"saas">) {
  const rows = await ctx.db
    .query("dailyMetrics")
    .withIndex("by_saas_day", (q) => q.eq("saasId", saasId).gte("day", dayKey(Date.now() - 30 * DAY)))
    .collect();
  return rows.map((r) => r.totalUsers);
}

async function withOwnerAndSpark(ctx: QueryCtx, s: Doc<"saas">) {
  const owner = await ctx.db.get(s.ownerId);
  return { ...publicSaas(s), owner: owner ? publicProfile(owner) : null, spark: await sparkline(ctx, s._id) };
}

async function publicSet(ctx: QueryCtx, category?: string) {
  return category
    ? ctx.db.query("saas").withIndex("by_public_category", (q) => q.eq("isPublic", true).eq("category", category)).collect()
    : ctx.db.query("saas").withIndex("by_public_new30d", (q) => q.eq("isPublic", true)).collect();
}

const isVerified = (s: Doc<"saas">) => s.trust === "verified" && s.trustState !== "review";

// Hidden gems: small products with unusually strong, trustworthy traction. The criteria are public so the list is explainable.
export const HIDDEN_GEM_RULES = { maxUsers: 1000, minNew7d: 10, minGrowth7dPct: 10, minHistoryDays: 7, minTrustScore: 60 } as const;
const isHiddenGem = (s: Doc<"saas">, now: number) =>
  isVerified(s) && !s.isDemo && s.totalUsers < HIDDEN_GEM_RULES.maxUsers && s.newUsers7d >= HIDDEN_GEM_RULES.minNew7d && (s.growth7dPct ?? 0) >= HIDDEN_GEM_RULES.minGrowth7dPct &&
  s.firstSnapshotAt !== undefined && now - s.firstSnapshotAt >= HIDDEN_GEM_RULES.minHistoryDays * DAY && (s.trustScore ?? 0) >= HIDDEN_GEM_RULES.minTrustScore;


export interface BoardFilters { board: Board; window: "24h" | "7d" | "30d"; verifiedOnly: boolean; category?: string; size?: string; platform?: string; limit: number }

// Sort + filter over the (small) public set. Ranks/trending are precomputed; everything else is a field sort.
export function sortBoard(rows: Doc<"saas">[], f: BoardFilters) {
  const w = f.window;
  const newIn = (s: Doc<"saas">) => (w === "24h" ? s.newUsers24h : w === "7d" ? s.newUsers7d : s.newUsers30d);
  const growthIn = (s: Doc<"saas">) => (w === "30d" ? s.growth30dPct : w === "7d" ? (s.growth7dPct ?? 0) : s.totalUsers - s.newUsers24h > 0 ? (s.newUsers24h / (s.totalUsers - s.newUsers24h)) * 100 : 0);
  const trendingIn = (s: Doc<"saas">) => (w === "24h" ? s.trendingScore24h : w === "7d" ? s.trendingScore7d : s.trendingScore30d) ?? 0;
  const activatedIn = (s: Doc<"saas">) => (w === "24h" ? s.activated24h : w === "7d" ? s.activated7d : s.activated30d);
  const now = Date.now();
  let list = rows.filter((s) => (!f.verifiedOnly || isVerified(s)) && (!f.size || sizeBucket(s.totalUsers) === f.size) && (!f.category || s.category === f.category) && (!f.platform || platformOf(s) === f.platform));
  const by = (fn: (s: Doc<"saas">) => number) => list.sort((a, b) => fn(b) - fn(a) || b.newUsers30d - a.newUsers30d || b.totalUsers - a.totalUsers);
  switch (f.board) {
    case "trending":
      list = list.filter((s) => trendingIn(s) > 0);
      by(trendingIn);
      break;
    case "fastest":
      list = list.filter((s) => newIn(s) >= 10);
      by(growthIn);
      break;
    case "most-users":
      by((s) => s.totalUsers);
      break;
    case "most-new":
      by(newIn);
      break;
    case "most-activated":
      list = list.filter((s) => (activatedIn(s) ?? s.activatedUsers) !== undefined);
      by((s) => activatedIn(s) ?? s.activatedUsers ?? 0);
      break;
    case "activation-rate":
      list = list.filter((s) => s.activationRatePct !== undefined && s.totalUsers >= 50);
      by((s) => s.activationRatePct ?? 0);
      break;
    case "new-rising":
      list = list.filter((s) => s.firstSnapshotAt !== undefined && now - s.firstSnapshotAt <= NEW_RISING_RULES.maxAgeDays * DAY && s.newUsers7d >= NEW_RISING_RULES.minNew7d);
      by((s) => s.newUsers7d);
      break;
    case "hidden-gems":
      list = list.filter((s) => isHiddenGem(s, now));
      by((s) => s.growth7dPct ?? 0);
      break;
    case "movers":
      // Stored 7-day leaderboard movement (rankHistory, materialized by rerank): climbers first, biggest climb wins.
      list = list.filter((s) => isVerified(s) && !s.isDemo && s.rank !== undefined && (s.rankDelta7d ?? 0) > 0);
      list.sort((a, b) => (b.rankDelta7d ?? 0) - (a.rankDelta7d ?? 0) || (a.rank ?? 0) - (b.rank ?? 0));
      break;
    case "best-conversion":
      list = list.filter((s) => s.signupToConvertedPct !== undefined && s.totalUsers >= 50 && visibilityOf(s).conversionRate);
      by((s) => s.signupToConvertedPct ?? 0);
      break;
    case "best-trial-conversion":
      list = list.filter((s) => s.trialToConvertedPct !== undefined && visibilityOf(s).trialConversion);
      by((s) => s.trialToConvertedPct ?? 0);
      break;
    case "converted-growth":
      list = list.filter((s) => s.convertedGrowth30dPct !== undefined && (s.convertedUsers ?? 0) >= 10 && visibilityOf(s).conversionRate);
      by((s) => s.convertedGrowth30dPct ?? 0);
      break;
  }
  return list.slice(0, f.limit);
}

export const board = query({
  args: { board: boardArg, window: v.optional(windowArg), verifiedOnly: v.optional(v.boolean()), category: v.optional(v.string()), size: v.optional(sizeArg), platform: v.optional(platformArg), limit: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const f: BoardFilters = { board: a.board, window: a.window ?? (a.board === "trending" ? "7d" : "30d"), verifiedOnly: a.verifiedOnly ?? true, category: a.category, size: a.size, platform: a.platform, limit: Math.min(a.limit ?? 50, 100) };
    const rows = sortBoard(await publicSet(ctx, f.category), f);
    return Promise.all(
      rows.map(async (s) => ({
        ...(await withOwnerAndSpark(ctx, s)),
        movement: f.board === "trending" ? trendingMovement(s, f.window) : f.board === "movers" ? rankMovement(s.rank7dAgo, s.rank) : movement(s.rank, s.prevRank),
        explain: f.board === "trending" ? explainTrending(trendingInputs(s)[f.window]) : undefined,
      })),
    );
  },
});

// Last-updated stamp for public pages: the newest successful sync among the listed rows.
export const boardMeta = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, { category }) => {
    const rows = (await publicSet(ctx, category)).filter(isVerified);
    return { updatedAt: rows.reduce((a, s) => Math.max(a, s.lastSyncedAt ?? 0), 0) || null, count: rows.length };
  },
});

export function trendingRankFor(s: Doc<"saas">, w: "24h" | "7d" | "30d") {
  return w === "24h" ? { rank: s.trendingRank24h, prev: s.prevTrendingRank24h } : w === "30d" ? { rank: s.trendingRank30d, prev: s.prevTrendingRank30d } : { rank: s.trendingRank, prev: s.prevTrendingRank };
}
const trendingMovement = (s: Doc<"saas">, w: "24h" | "7d" | "30d") => { const r = trendingRankFor(s, w); return movement(r.rank, r.prev); };

function movement(rank?: number, prev?: number) {
  if (!rank) return null;
  if (prev === undefined) return { kind: "new" as const, delta: 0 };
  return { kind: prev > rank ? ("up" as const) : prev < rank ? ("down" as const) : ("same" as const), delta: prev - rank };
}

// Legacy 30d leaderboard (kept for the landing page + OG image).
export const leaderboard = query({
  args: { verifiedOnly: v.boolean(), limit: v.optional(v.number()) },
  handler: async (ctx, { verifiedOnly, limit = 50 }) => {
    const rows = sortBoard(await publicSet(ctx), { board: "most-new", window: "30d", verifiedOnly, limit });
    return Promise.all(rows.map((s) => withOwnerAndSpark(ctx, s)));
  },
});

export const saasBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    const owner = await ctx.db.get(s.ownerId);
    const integrations = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", s._id)).collect();
    const milestones = await ctx.db.query("milestones").withIndex("by_saas_time", (q) => q.eq("saasId", s._id)).order("desc").take(8);
    return {
      ...publicSaas(s),
      owner: owner ? publicProfile(owner) : null,
      source: integrations.find((i) => (i.role ?? "users") === "users")?.provider ?? null,
      sources: integrations.map((i) => ({ role: i.role ?? "users", provider: i.provider, label: providerLabel(i.provider, i.config) })),
      spark: await sparkline(ctx, s._id),
      milestones: milestones.map((m) => ({ _id: m._id, kind: m.kind, title: m.title, copy: m.copy, value: m.value, achievedAt: m.achievedAt })),
    };
  },
});

// Widget payload: the few public numbers an embed needs, visibility applied, no owner / integrations / milestones.
export const widget = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    const p = publicSaas(s);
    const vis = p.visibility;
    return {
      slug: s.slug,
      name: s.name,
      totalUsers: vis.totalUsers ? s.totalUsers : undefined,
      newUsers7d: vis.growth ? s.newUsers7d : undefined,
      newUsers30d: vis.growth ? s.newUsers30d : undefined,
      growth7dPct: vis.growth ? s.growth7dPct : undefined,
      growth30dPct: vis.growth ? s.growth30dPct : undefined,
      trust: s.trust,
      trustLabel: p.trustLabel,
      trendingRank: s.trendingRank,
      lastSyncedAt: s.lastSyncedAt,
      spark: vis.totalUsers ? await sparkline(ctx, s._id) : [],
    };
  },
});

const funnelTimeframeArg = v.union(...FUNNEL_TIMEFRAMES.map((t) => v.literal(t)));

// Public funnel: reached / trial / converted stages only when the owner published them; every stage carries its own provenance.
export const funnel = query({
  args: { slug: v.string(), timeframe: v.optional(funnelTimeframeArg) },
  handler: async (ctx, { slug, timeframe }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    return funnelFor(ctx, s, timeframe ?? "30d", funnelOptionsFor(visibilityOf(s)));
  },
});

export const funnelHistory = query({
  args: { slug: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, { slug, days }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    return funnelHistoryFor(ctx, s, Math.min(365, Math.max(14, days ?? 90)), funnelOptionsFor(visibilityOf(s)));
  },
});

export const milestone = query({
  args: { slug: v.string(), id: v.string() },
  handler: async (ctx, { slug, id }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    const m = await ctx.db.get(id as Id<"milestones">).catch(() => null);
    if (!m || m.saasId !== s._id) return null;
    return { saas: publicSaas(s), milestone: { _id: m._id, kind: m.kind, title: m.title, copy: m.copy, value: m.value, achievedAt: m.achievedAt } };
  },
});

// A growth spike rendered as its own share card.
export const event = query({
  args: { slug: v.string(), id: v.string() },
  handler: async (ctx, { slug, id }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    const e = await ctx.db.get(id as Id<"events">).catch(() => null);
    if (!e || e.saasId !== s._id || (e.kind !== "spike" && e.kind !== "activation_spike")) return null;
    return { saas: publicSaas(s), event: { _id: e._id, kind: e.kind, title: e.title, copy: e.detail, value: e.value, multiple: e.multiple, achievedAt: e.at } };
  },
});

// Public benchmark statement ("Top 12% 30-day growth in Developer Tools"): strong positions only, category cohort preferred.
export type { BenchmarkHighlight };
export const benchmarkHighlight = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }): Promise<BenchmarkHighlight | null> => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s) return null;
    return publicBenchmarkHighlight(ctx, s);
  },
});

// Weekly benchmark standings, public projection: top-quarter positions only, and only when the owner publishes benchmarks.
export const benchmarkHistory = query({
  args: { slug: v.string(), weeks: v.optional(v.number()) },
  handler: async (ctx, { slug, weeks }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic || !isVerified(s) || s.isDemo || !visibilityOf(s).benchmarks) return null;
    return { slug: s.slug, weeks: await benchmarkHistoryFor(ctx, s, Math.min(Math.max(weeks ?? 26, 4), 52), true) };
  },
});

export const series = query({
  args: { slug: v.string(), range: rangeArg },
  handler: async (ctx, { slug, range }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    return (await historyFor(ctx, s, range)).points;
  },
});

// Chart/API history with storage-aware resolution and explicit gaps (docs/HISTORY.md). Never interpolates.
export async function historyFor(ctx: QueryCtx, s: Doc<"saas">, range: Range) {
  const spanDays = s.firstSnapshotAt ? (Date.now() - s.firstSnapshotAt) / DAY : 0;
  const resolution = resolutionFor(range, spanDays);
  let points: HistoryPoint[];
  if (resolution === "raw") points = await seriesFor(ctx, s, range);
  else {
    const ms = RANGE_MS[range];
    const cutoff = ms === null ? 0 : Date.now() - ms;
    const rows = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", s._id).gte("day", dayKey(cutoff))).collect();
    const vis = visibilityOf(s);
    points = downsample(rows.map((r) => ({ day: r.day, totalUsers: r.totalUsers, newUsers: r.newUsers, activatedUsers: vis.activationRate ? r.activatedUsers : undefined, visitors: vis.traffic ? r.visitors : undefined, convertedUsers: vis.convertedCount ? r.convertedUsers : undefined })), resolution);
  }
  return { range, resolution, points, gaps: findGaps(points, resolution === "raw" ? 1 : resolution === "day" ? 3 : resolution === "week" ? 14 : 45) };
}

export const history = query({
  args: { slug: v.string(), range: rangeArg },
  handler: async (ctx, { slug, range }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    return historyFor(ctx, s, range);
  },
});

const rankKindArg = v.union(v.literal("leaderboard"), v.literal("trending"));

// Stored daily ranking positions (append-only rankHistory), oldest first, with the best position ever.
export const rankHistory = query({
  args: { slug: v.string(), kind: v.optional(rankKindArg), window: v.optional(windowArg), days: v.optional(v.number()) },
  handler: async (ctx, { slug, kind = "leaderboard", window, days }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    const w = window ?? (kind === "trending" ? "7d" : "30d");
    const since = dayKey(Date.now() - Math.min(Math.max(days ?? 90, 7), 730) * DAY);
    const rows = await ctx.db.query("rankHistory").withIndex("by_saas_kind_window_day", (q) => q.eq("saasId", s._id).eq("kind", kind).eq("window", w).gte("day", since)).collect();
    const points = rows.map((r) => ({ day: r.day, t: Date.parse(`${r.day}T12:00:00Z`), rank: r.rank, score: r.score }));
    const current = kind === "trending" ? trendingRankFor(s, w).rank : s.rank;
    return { slug: s.slug, kind, window: w, points, current, best: kind === "trending" ? s.bestTrendingRank : s.bestRank, rank7dAgo: kind === "trending" ? s.trendingRank7dAgo : s.rank7dAgo, movement7d: kind === "trending" ? rankMovement(s.trendingRank7dAgo, trendingRankFor(s, w).rank) : rankMovement(s.rank7dAgo, s.rank) };
  },
});

// Related products for a project page: same category first, then similar size, then similar growth stage. Public + verified only.
export const related = query({
  args: { slug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { slug, limit }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return [];
    const all = (await publicSet(ctx)).filter((x) => x._id !== s._id && isVerified(x) && !x.isDemo === !s.isDemo);
    const bucket = sizeBucket(s.totalUsers);
    const score = (x: Doc<"saas">) => (x.category && x.category === s.category ? 4 : 0) + (sizeBucket(x.totalUsers) === bucket ? 2 : 0) + (Math.sign(x.growth30dPct - 10) === Math.sign(s.growth30dPct - 10) ? 1 : 0);
    const rows = all.map((x) => ({ x, score: score(x) })).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || b.x.newUsers30d - a.x.newUsers30d).slice(0, Math.min(limit ?? 4, 8));
    return Promise.all(rows.map((r) => withOwnerAndSpark(ctx, r.x)));
  },
});

// Frozen monthly rankings (rankingSnapshots) for /rankings/<year>/<month>/<category> and the datasets API.
export const rankingSnapshot = query({
  args: { period: v.string(), board: v.optional(v.string()), category: v.optional(v.string()) },
  handler: async (ctx, { period, board = "most-new", category }) => {
    return ctx.db.query("rankingSnapshots").withIndex("by_period_board_category", (q) => q.eq("period", period).eq("board", board).eq("category", category)).unique();
  },
});

// Every (period, board, category) that has a frozen ranking — for the sitemap and the rankings archive index.
export const rankingPeriods = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("rankingSnapshots").withIndex("by_period").order("desc").take(500);
    return rows.map((r) => ({ period: r.period, board: r.board, category: r.category ?? null, sampleSize: r.sampleSize, computedAt: r.computedAt }));
  },
});

// Milestones + growth events inside the chart range, capped so charts stay clean.
export const annotations = query({
  args: { slug: v.string(), range: rangeArg },
  handler: async (ctx, { slug, range }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return [];
    const ms = RANGE_MS[range];
    const cutoff = ms === null ? 0 : Date.now() - ms;
    const milestones = await ctx.db.query("milestones").withIndex("by_saas_time", (q) => q.eq("saasId", s._id).gte("achievedAt", cutoff)).order("desc").take(8);
    const events = await ctx.db.query("events").withIndex("by_saas_time", (q) => q.eq("saasId", s._id).gte("at", cutoff)).order("desc").take(8);
    return [
      ...milestones.map((m) => ({ id: m._id, t: m.achievedAt, kind: "milestone" as const, title: m.title, detail: m.copy })),
      ...events.map((e) => ({ id: e._id, t: e.at, kind: e.kind, title: e.title, detail: e.detail })),
    ].sort((a, b) => a.t - b.t);
  },
});

// Founder page: public projects only (private ones never leak, not even into the totals); aggregates in lib/founder.ts.
export async function founderRows(ctx: QueryCtx, p: Doc<"profiles">) {
  const all = await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", p._id)).collect();
  return all.filter((s) => s.isPublic).sort((a, b) => b.newUsers30d - a.newUsers30d);
}

export const profileByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const p = await ctx.db.query("profiles").withIndex("by_username", (q) => q.eq("username", username.toLowerCase())).unique();
    if (!p || p.profilePublic === false) return null;
    const saas = (await founderRows(ctx, p)).map(publicSaas);
    return {
      ...publicProfile(p),
      aggregates: founderAggregates(saas),
      saas: await Promise.all(saas.map(async (s) => ({ ...s, spark: await sparkline(ctx, s._id) }))),
    };
  },
});

// Aggregate user growth across the founder's public projects: daily totals summed with per-project forward fill.
export const founderHistory = query({
  args: { username: v.string(), range: rangeArg },
  handler: async (ctx, { username, range }) => {
    const p = await ctx.db.query("profiles").withIndex("by_username", (q) => q.eq("username", username.toLowerCase())).unique();
    if (!p || p.profilePublic === false) return null;
    const rows = await founderRows(ctx, p);
    const ms = RANGE_MS[range === "24h" ? "7d" : range];
    const from = ms === null ? "0000" : dayKey(Date.now() - ms);
    const perProject = await Promise.all(rows.map((s) => ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", s._id).gte("day", from)).collect()));
    return {
      projects: rows.map((s) => ({ slug: s.slug, name: s.name, logoUrl: s.logoUrl })),
      points: aggregateHistory(perProject.map((list) => list.map((r) => ({ day: r.day, totalUsers: r.totalUsers, newUsers: r.newUsers })))).map((pt) => ({ t: Date.parse(`${pt.day}T12:00:00Z`), total: pt.total, delta: pt.delta, byProject: pt.byProject })),
    };
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const rows = await publicSet(ctx);
    return {
      saasCount: rows.length,
      verifiedCount: rows.filter(isVerified).length,
      trackedUsers: rows.reduce((a, s) => a + s.totalUsers, 0),
      newUsers30d: rows.reduce((a, s) => a + Math.max(0, s.newUsers30d), 0),
      categories: CATEGORIES.map((c) => ({ ...c, count: rows.filter((s) => s.category === c.slug).length })).filter((c) => c.count > 0),
    };
  },
});

export const search = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return { saas: [], profiles: [], categories: [] };
    const byName = await ctx.db.query("saas").withSearchIndex("search_name", (s) => s.search("name", term).eq("isPublic", true)).take(10);
    const byDesc = await ctx.db.query("saas").withSearchIndex("search_description", (s) => s.search("description", term).eq("isPublic", true)).take(10);
    const all = await publicSet(ctx);
    const byTag = all.filter((s) => s.tags.some((t) => t.includes(term)) || s.category === term || CATEGORIES.some((c) => c.slug === s.category && c.label.toLowerCase().includes(term)));
    const seen = new Set<string>();
    const saas = [...byName, ...byDesc, ...byTag].filter((s) => !seen.has(s._id) && seen.add(s._id)).slice(0, 12);
    const profiles = await ctx.db.query("profiles").withSearchIndex("search_name", (s) => s.search("displayName", term)).take(5);
    const byHandle = (await ctx.db.query("profiles").withIndex("by_username", (q) => q.gte("username", term).lt("username", `${term}￿`)).take(5)).filter((p) => !profiles.some((x) => x._id === p._id));
    const founders = [];
    for (const p of [...profiles, ...byHandle].filter(isProfilePublic)) {
      const rows = await founderRows(ctx, p);
      founders.push({ ...publicProfile(p), projectCount: rows.length, totalUsers: rows.reduce((a, s) => a + s.totalUsers, 0), newUsers30d: rows.reduce((a, s) => a + Math.max(0, s.newUsers30d), 0) });
    }
    const categories = CATEGORIES.filter((c) => c.slug.includes(term) || c.label.toLowerCase().includes(term) || c.seo.toLowerCase().includes(term)).map((c) => ({ slug: c.slug, label: c.label, count: all.filter((s) => s.category === c.slug && isVerified(s)).length })).filter((c) => c.count > 0);
    return { saas: await Promise.all(saas.map((s) => withOwnerAndSpark(ctx, s))), profiles: founders, categories };
  },
});

// Discovery sections from one read of the public set, optionally narrowed to a category. Empty sections are omitted client-side.
export const discover = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, { category }) => {
    const now = Date.now();
    const all = await publicSet(ctx, category);
    const pick = (board: Board, window: "24h" | "7d" | "30d", extra?: Partial<BoardFilters>, n = 5) => sortBoard(all, { board, window, verifiedOnly: true, limit: n, category, ...extra });
    const verifiedRecently = all.filter((s) => isVerified(s) && !s.isDemo && s.verifiedAt !== undefined).sort((a, b) => b.verifiedAt! - a.verifiedAt!).slice(0, 5);
    const expand = (rows: Doc<"saas">[], w: "24h" | "7d" | "30d" = "7d") => Promise.all(rows.map(async (s) => ({ ...(await withOwnerAndSpark(ctx, s)), movement: trendingMovement(s, w) })));
    const movers = pick("movers", "30d");
    return {
      category: category ?? null,
      trending: await expand(pick("trending", "7d")),
      fastestToday: await expand(pick("fastest", "24h"), "24h"),
      fastestWeek: await expand(pick("fastest", "7d")),
      fastestMonth: await expand(pick("fastest", "30d"), "30d"),
      newest: await expand(pick("new-rising", "7d")),
      recentlyVerified: await expand(verifiedRecently),
      // Movement over 7 stored days: `rank7dAgo → rank` (rankHistory), never the position at the previous 4-hour refresh.
      movers: await Promise.all(movers.map(async (s) => ({ ...(await withOwnerAndSpark(ctx, s)), movement: rankMovement(s.rank7dAgo, s.rank), rank7dAgo: s.rank7dAgo, rankDelta7d: s.rankDelta7d }))),
      hiddenGems: await expand(pick("hidden-gems", "7d")),
      hiddenGemRules: HIDDEN_GEM_RULES,
      newRisingRules: NEW_RISING_RULES,
      devTools: category ? [] : await expand(pick("most-new", "30d", { category: "developer-tools" })),
      ai: category ? [] : await expand(pick("most-new", "30d", { category: "ai" })),
      mobile: await expand(pick("most-new", "30d", { platform: "mobile" }), "30d"),
      feed: await feedItems(ctx, all, 12, category),
      categories: categoryCounts(category ? await publicSet(ctx) : all),
      updatedAt: all.reduce((a, s) => Math.max(a, s.lastSyncedAt ?? 0), 0) || null,
    };
  },
});

function categoryCounts(rows: Doc<"saas">[]) {
  return CATEGORIES.map((c) => ({ ...c, count: rows.filter((s) => s.category === c.slug && isVerified(s)).length })).filter((c) => c.count > 0);
}

export type FeedKind = "milestone" | "spike" | "activation_spike" | "launched" | "verified" | "rank_jump" | "traction" | "benchmark";
const FEED_EVENT_KINDS = new Set(["spike", "activation_spike", "launched", "verified", "rank_jump", "traction", "benchmark"]);

// The discovery feed is a merge of two stored, deduplicated logs: milestones (unique key per SaaS) and events (unique kind per day).
// Identity is stable (`milestone:{saasId}:{key}` / `{kind}:{saasId}:{day}`), so the feed never invents or repeats activity.
export async function feedItems(ctx: QueryCtx, all: Doc<"saas">[], limit: number, category?: string) {
  const bySaas = new Map(all.filter((s) => isVerified(s) && !s.isDemo && (!category || s.category === category)).map((s) => [s._id, s]));
  const take = Math.min(200, limit * 4);
  const milestones = await ctx.db.query("milestones").withIndex("by_time").order("desc").take(take);
  const events = await ctx.db.query("events").withIndex("by_time").order("desc").take(take);
  const card = (s: Doc<"saas">) => ({ slug: s.slug, name: s.name, logoUrl: s.logoUrl, category: s.category, totalUsers: s.totalUsers, trust: s.trust, trustLabel: publicTrustLabel(s.trust, s.trustState, s.trustScore) });
  const items = [
    ...milestones.flatMap((m) => { const s = bySaas.get(m.saasId); return s ? [{ id: `milestone:${m.saasId}:${m.key}`, kind: "milestone" as FeedKind, subkind: m.kind, at: m.achievedAt, title: m.title, detail: m.copy, value: m.value, share: `share/milestone-${m._id}`, saas: card(s) }] : []; }),
    ...events.flatMap((e) => { const s = bySaas.get(e.saasId); return s && FEED_EVENT_KINDS.has(e.kind) ? [{ id: `${e.kind}:${e.saasId}:${e.day}`, kind: e.kind as FeedKind, subkind: e.kind, at: e.at, title: e.title, detail: e.detail, value: e.value, share: e.kind === "spike" ? `share/spike-${e._id}` : undefined, saas: card(s) }] : []; }),
  ];
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.id) && seen.add(i.id)).sort((a, b) => b.at - a.at).slice(0, limit);
}

export const feed = query({
  args: { limit: v.optional(v.number()), category: v.optional(v.string()) },
  handler: async (ctx, { limit, category }) => feedItems(ctx, await publicSet(ctx), Math.min(limit ?? 30, 100), category),
});

// Public explanation of a product's trending position (factors, never raw internals).
export const trendingExplain = query({
  args: { slug: v.string(), window: v.optional(windowArg) },
  handler: async (ctx, { slug, window = "7d" }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    const i = trendingInputs(s)[window];
    const r = trendingRankFor(s, window);
    return { window, score: window === "24h" ? s.trendingScore24h : window === "7d" ? s.trendingScore7d : s.trendingScore30d, rank: r.rank, previousRank: r.prev, factors: trendingFactors(i), explain: explainTrending(i) };
  },
});

export const COMPARE_DAYS = [7, 30, 90, 365, 0] as const; // 0 = all shared history
const compareDaysArg = v.union(...COMPARE_DAYS.map((d) => v.literal(d)));

// Up to four public products with daily history for the window (0 = all). Reads indexed daily rows only.
export const compare = query({
  args: { slugs: v.array(v.string()), days: v.optional(compareDaysArg) },
  handler: async (ctx, { slugs, days = 90 }) => {
    const out = [];
    const since = days === 0 ? "0000-00-00" : dayKey(Date.now() - days * DAY);
    for (const slug of [...new Set(slugs)].slice(0, 4)) {
      const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
      if (!s || !s.isPublic) continue;
      const rows = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", s._id).gte("day", since)).collect();
      out.push({ ...publicSaas(s), series: rows.map((r) => ({ day: r.day, total: r.totalUsers, delta: r.newUsers, activated: r.activatedUsers })) });
    }
    return out;
  },
});

export const suggest = query({
  args: { q: v.string(), exclude: v.optional(v.array(v.string())) },
  handler: async (ctx, { q, exclude = [] }) => {
    const term = q.trim().toLowerCase();
    const rows = term.length < 1 ? sortBoard(await publicSet(ctx), { board: "most-new", window: "30d", verifiedOnly: false, limit: 8 }) : await ctx.db.query("saas").withSearchIndex("search_name", (s) => s.search("name", term).eq("isPublic", true)).take(8);
    return rows.filter((s) => !exclude.includes(s.slug)).map((s) => ({ slug: s.slug, name: s.name, logoUrl: s.logoUrl, totalUsers: s.totalUsers }));
  },
});

export const sitemap = query({
  args: {},
  handler: async (ctx) => {
    const rows = await publicSet(ctx);
    const owners = new Map<string, Doc<"profiles">>();
    for (const s of rows) {
      if (!owners.has(s.ownerId)) {
        const p = await ctx.db.get(s.ownerId);
        if (p) owners.set(s.ownerId, p);
      }
    }
    return {
      saas: rows.map((s) => ({ slug: s.slug, updatedAt: s.lastSyncedAt ?? s._creationTime })),
      profiles: [...owners.values()].filter(isProfilePublic).map((p) => ({ username: p.username, updatedAt: p._creationTime })),
      categories: CATEGORIES.map((c) => c.slug).filter((c) => rows.some((s) => s.category === c)),
      rankings: (await ctx.db.query("rankingSnapshots").withIndex("by_period").order("desc").take(500)).map((r) => ({ period: r.period, board: r.board, category: r.category ?? null, computedAt: r.computedAt })),
    };
  },
});
