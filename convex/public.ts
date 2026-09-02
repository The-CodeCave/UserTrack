import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { RANGE_MS, RANGES, DAY, dayKey } from "./lib/time";
import { SIZE_BUCKETS, sizeBucket } from "./lib/metrics";
import { BENCHMARK_METRIC_LABEL, isConversionBenchmark, percentileOf, publicBenchmarkStatement, type BenchmarkMetric } from "./lib/benchmarks";
import { seriesFor } from "./domain/metrics";
import { FUNNEL_TIMEFRAMES, funnelFor, funnelHistoryFor, funnelOptionsFor } from "./domain/funnel";
import { stripPrivate, visibilityOf } from "./domain/visibility";
import { publicTrustLabel } from "./lib/trust";
import { explainTrending, trendingFactors } from "./lib/trending";
import { trendingInputs } from "./leaderboard";
import { getProvider } from "./providers";
import { CATEGORIES } from "../src/lib/categories";

const rangeArg = v.union(...RANGES.map((r) => v.literal(r)));
// Secondary conversion boards only list products whose owner published the rate (visibility), never merely connected a source.
export const BOARDS = ["trending", "fastest", "most-users", "most-new", "most-activated", "activation-rate", "new-rising", "best-conversion", "best-trial-conversion", "converted-growth"] as const;
export type Board = (typeof BOARDS)[number];
const boardArg = v.union(...BOARDS.map((b) => v.literal(b)));
const windowArg = v.union(v.literal("24h"), v.literal("7d"), v.literal("30d"));
const sizeArg = v.union(...SIZE_BUCKETS.map((b) => v.literal(b.key)));

export function publicProfile(p: Doc<"profiles">) {
  const { _id, username, displayName, avatarUrl, bio, website, x, github, linkedin, followerCount } = p;
  return { _id, username, displayName, avatarUrl, bio, website, x, github, linkedin, followerCount: followerCount ?? 0 };
}

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

export interface BoardFilters { board: Board; window: "24h" | "7d" | "30d"; verifiedOnly: boolean; category?: string; size?: string; limit: number }

// Sort + filter over the (small) public set. Ranks/trending are precomputed; everything else is a field sort.
export function sortBoard(rows: Doc<"saas">[], f: BoardFilters) {
  const w = f.window;
  const newIn = (s: Doc<"saas">) => (w === "24h" ? s.newUsers24h : w === "7d" ? s.newUsers7d : s.newUsers30d);
  const growthIn = (s: Doc<"saas">) => (w === "30d" ? s.growth30dPct : w === "7d" ? (s.growth7dPct ?? 0) : s.totalUsers - s.newUsers24h > 0 ? (s.newUsers24h / (s.totalUsers - s.newUsers24h)) * 100 : 0);
  const trendingIn = (s: Doc<"saas">) => (w === "24h" ? s.trendingScore24h : w === "7d" ? s.trendingScore7d : s.trendingScore30d) ?? 0;
  const activatedIn = (s: Doc<"saas">) => (w === "24h" ? s.activated24h : w === "7d" ? s.activated7d : s.activated30d);
  let list = rows.filter((s) => (!f.verifiedOnly || isVerified(s)) && (!f.size || sizeBucket(s.totalUsers) === f.size) && (!f.category || s.category === f.category));
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
      list = list.filter((s) => s.firstSnapshotAt !== undefined && Date.now() - s.firstSnapshotAt <= 30 * DAY);
      by((s) => s.newUsers7d);
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
  args: { board: boardArg, window: v.optional(windowArg), verifiedOnly: v.optional(v.boolean()), category: v.optional(v.string()), size: v.optional(sizeArg), limit: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const f: BoardFilters = { board: a.board, window: a.window ?? (a.board === "trending" ? "7d" : "30d"), verifiedOnly: a.verifiedOnly ?? true, category: a.category, size: a.size, limit: Math.min(a.limit ?? 50, 100) };
    const rows = sortBoard(await publicSet(ctx, f.category), f);
    return Promise.all(
      rows.map(async (s) => ({
        ...(await withOwnerAndSpark(ctx, s)),
        movement: f.board === "trending" ? trendingMovement(s, f.window) : movement(s.rank, s.prevRank),
        explain: f.board === "trending" ? explainTrending(trendingInputs(s)[f.window]) : undefined,
      })),
    );
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
      sources: integrations.map((i) => ({ role: i.role ?? "users", provider: i.provider, label: getProvider(i.provider).label })),
      spark: await sparkline(ctx, s._id),
      milestones: milestones.map((m) => ({ _id: m._id, kind: m.kind, title: m.title, copy: m.copy, value: m.value, achievedAt: m.achievedAt })),
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
export interface BenchmarkHighlight { statement: string; percentile: number; metric: string; cohort: string; sampleSize: number }
export const benchmarkHighlight = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }): Promise<BenchmarkHighlight | null> => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic || !isVerified(s) || s.isDemo) return null;
    const cohorts = [
      ...(s.category ? [{ key: `cat:${s.category}`, label: CATEGORIES.find((c) => c.slug === s.category)?.label ?? s.category }] : []),
      { key: `size:${sizeBucket(s.totalUsers)}`, label: `products with ${SIZE_BUCKETS.find((b) => b.key === sizeBucket(s.totalUsers))?.label ?? "similar"} users` },
      { key: "all", label: "all SaaS on UserTrack" },
    ];
    const vis = visibilityOf(s);
    const metrics: { metric: BenchmarkMetric; value: number | undefined }[] = [
      { metric: "growth30dPct", value: s.growth30dPct }, { metric: "activationRatePct", value: s.activationRatePct }, { metric: "newUsers30d", value: s.newUsers30d },
      { metric: "signupToConvertedPct", value: s.signupToConvertedPct }, { metric: "convertedGrowth30dPct", value: s.convertedGrowth30dPct }, { metric: "trialToConvertedPct", value: vis.trialConversion ? s.trialToConvertedPct : undefined },
    ];
    let best: BenchmarkHighlight | null = null;
    for (const c of cohorts) {
      for (const m of metrics) {
        // Conversion standings are never published unless the founder made the rate public.
        if (m.value === undefined || (isConversionBenchmark(m.metric) && !vis.conversionRate)) continue;
        const agg = await ctx.db.query("benchmarkAggregates").withIndex("by_group_metric", (q) => q.eq("groupKey", c.key).eq("metric", m.metric)).unique();
        if (!agg) continue;
        const percentile = percentileOf(m.value, agg.deciles);
        if (percentile === null) continue;
        const statement = publicBenchmarkStatement({ metricLabel: BENCHMARK_METRIC_LABEL[m.metric], groupLabel: c.label, percentile });
        if (statement && (!best || percentile > best.percentile)) best = { statement, percentile, metric: m.metric, cohort: c.label, sampleSize: agg.sampleSize };
      }
      if (best) break;
    }
    return best;
  },
});

export const series = query({
  args: { slug: v.string(), range: rangeArg },
  handler: async (ctx, { slug, range }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    return seriesFor(ctx, s, range);
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

export const profileByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const p = await ctx.db.query("profiles").withIndex("by_username", (q) => q.eq("username", username)).unique();
    if (!p) return null;
    const all = await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", p._id)).collect();
    const saas = all.filter((s) => s.isPublic).sort((a, b) => b.newUsers30d - a.newUsers30d);
    return { ...publicProfile(p), saas: await Promise.all(saas.map(async (s) => ({ ...publicSaas(s), spark: await sparkline(ctx, s._id) }))) };
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
    if (term.length < 2) return { saas: [], profiles: [] };
    const byName = await ctx.db.query("saas").withSearchIndex("search_name", (s) => s.search("name", term).eq("isPublic", true)).take(10);
    const byDesc = await ctx.db.query("saas").withSearchIndex("search_description", (s) => s.search("description", term).eq("isPublic", true)).take(10);
    const all = await publicSet(ctx);
    const byTag = all.filter((s) => s.tags.some((t) => t.includes(term)) || s.category === term || CATEGORIES.some((c) => c.slug === s.category && c.label.toLowerCase().includes(term)));
    const seen = new Set<string>();
    const saas = [...byName, ...byDesc, ...byTag].filter((s) => !seen.has(s._id) && seen.add(s._id)).slice(0, 12);
    const profiles = await ctx.db.query("profiles").withSearchIndex("search_name", (s) => s.search("displayName", term)).take(5);
    const byHandle = (await ctx.db.query("profiles").withIndex("by_username", (q) => q.gte("username", term).lt("username", `${term}￿`)).take(5)).filter((p) => !profiles.some((x) => x._id === p._id));
    return {
      saas: await Promise.all(saas.map((s) => withOwnerAndSpark(ctx, s))),
      profiles: [...profiles, ...byHandle].filter((p) => p.userId !== "demo").map(publicProfile),
    };
  },
});

// Hidden gems: small products with unusually strong, trustworthy traction. The criteria are public so the list is explainable.
export const HIDDEN_GEM_RULES = { maxUsers: 1000, minNew7d: 10, minGrowth7dPct: 10, minHistoryDays: 7, minTrustScore: 60 } as const;
const isHiddenGem = (s: Doc<"saas">, now: number) =>
  isVerified(s) && !s.isDemo && s.totalUsers < HIDDEN_GEM_RULES.maxUsers && s.newUsers7d >= HIDDEN_GEM_RULES.minNew7d && (s.growth7dPct ?? 0) >= HIDDEN_GEM_RULES.minGrowth7dPct &&
  s.firstSnapshotAt !== undefined && now - s.firstSnapshotAt >= HIDDEN_GEM_RULES.minHistoryDays * DAY && (s.trustScore ?? 0) >= HIDDEN_GEM_RULES.minTrustScore;

// Discovery sections from one read of the public set. Empty sections are omitted client-side.
export const discover = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const all = await publicSet(ctx);
    const pick = (board: Board, window: "24h" | "7d" | "30d", extra?: Partial<BoardFilters>, n = 5) => sortBoard(all, { board, window, verifiedOnly: true, limit: n, ...extra });
    const hidden = all.filter((s) => isHiddenGem(s, now)).sort((a, b) => (b.growth7dPct ?? 0) - (a.growth7dPct ?? 0)).slice(0, 5);
    const verifiedRecently = all.filter((s) => isVerified(s) && !s.isDemo && s.verifiedAt !== undefined).sort((a, b) => b.verifiedAt! - a.verifiedAt!).slice(0, 5);
    const movers = all
      .filter((s) => isVerified(s) && !s.isDemo && s.trendingRank !== undefined && s.prevTrendingRank !== undefined && s.prevTrendingRank > s.trendingRank)
      .sort((a, b) => (b.prevTrendingRank! - b.trendingRank!) - (a.prevTrendingRank! - a.trendingRank!)).slice(0, 5);
    const expand = (rows: Doc<"saas">[], w: "24h" | "7d" | "30d" = "7d") => Promise.all(rows.map(async (s) => ({ ...(await withOwnerAndSpark(ctx, s)), movement: trendingMovement(s, w) })));
    return {
      trending: await expand(pick("trending", "7d")),
      fastestToday: await expand(pick("fastest", "24h"), "24h"),
      fastestWeek: await expand(pick("fastest", "7d")),
      newest: await expand(pick("new-rising", "7d")),
      recentlyVerified: await expand(verifiedRecently),
      movers: await expand(movers),
      hiddenGems: await expand(hidden),
      hiddenGemRules: HIDDEN_GEM_RULES,
      devTools: await expand(pick("most-new", "30d", { category: "developer-tools" })),
      ai: await expand(pick("most-new", "30d", { category: "ai" })),
      feed: await feedItems(ctx, all, 12),
      categories: CATEGORIES.map((c) => ({ ...c, count: all.filter((s) => s.category === c.slug && isVerified(s)).length })).filter((c) => c.count > 0),
    };
  },
});

export type FeedKind = "milestone" | "spike" | "activation_spike" | "launched" | "verified";
const FEED_EVENT_KINDS = new Set(["spike", "activation_spike", "launched", "verified"]);

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
      profiles: [...owners.values()].map((p) => ({ username: p.username, updatedAt: p._creationTime })),
      categories: CATEGORIES.map((c) => c.slug).filter((c) => rows.some((s) => s.category === c)),
    };
  },
});
