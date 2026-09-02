import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { RANGE_MS, RANGES, DAY, dayKey } from "./lib/time";
import { SIZE_BUCKETS, sizeBucket } from "./lib/metrics";
import { seriesFor } from "./domain/metrics";
import { publicTrustLabel } from "./lib/trust";
import { explainTrending } from "./lib/trending";
import { getProvider } from "./providers";
import { CATEGORIES } from "../src/lib/categories";

const rangeArg = v.union(...RANGES.map((r) => v.literal(r)));
export const BOARDS = ["trending", "fastest", "most-users", "most-new", "most-activated", "activation-rate", "new-rising"] as const;
export type Board = (typeof BOARDS)[number];
const boardArg = v.union(...BOARDS.map((b) => v.literal(b)));
const windowArg = v.union(v.literal("24h"), v.literal("7d"), v.literal("30d"));
const sizeArg = v.union(...SIZE_BUCKETS.map((b) => v.literal(b.key)));

export function publicProfile(p: Doc<"profiles">) {
  const { _id, username, displayName, avatarUrl, bio, website, x, github, linkedin, followerCount } = p;
  return { _id, username, displayName, avatarUrl, bio, website, x, github, linkedin, followerCount: followerCount ?? 0 };
}

// Public-safe projection. Traffic/revenue are only exposed when the owner opted in.
export function publicSaas(s: Doc<"saas">) {
  const rest: Partial<Doc<"saas">> = { ...s };
  delete rest.ownerId;
  if (!s.showTraffic) { delete rest.visitors30d; delete rest.sessions30d; delete rest.visitorsPrev30d; }
  if (!s.showRevenue) { delete rest.payingUsers; delete rest.mrr; delete rest.currency; }
  return { ...(rest as Omit<Doc<"saas">, "ownerId">), trustLabel: publicTrustLabel(s.trust, s.trustState, s.trustScore), followerCount: s.followerCount ?? 0 };
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
        movement: f.board === "trending" ? movement(s.trendingRank, s.prevTrendingRank) : movement(s.rank, s.prevRank),
        explain: f.board === "trending" ? explainTrending({ newUsers: f.window === "24h" ? s.newUsers24h : f.window === "7d" ? s.newUsers7d : s.newUsers30d, prevNewUsers: (f.window === "24h" ? s.newUsersPrev24h : f.window === "7d" ? s.newUsersPrev7d : s.newUsersPrev30d) ?? 0, baseUsers: s.totalUsers, activationRatePct: s.activationRatePct }) : undefined,
      })),
    );
  },
});

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

// Discovery sections from one read of the public set. Empty sections are omitted client-side.
export const discover = query({
  args: {},
  handler: async (ctx) => {
    const all = await publicSet(ctx);
    const pick = (board: Board, window: "24h" | "7d" | "30d", extra?: Partial<BoardFilters>, n = 5) => sortBoard(all, { board, window, verifiedOnly: true, limit: n, ...extra });
    const hidden = all.filter((s) => isVerified(s) && !s.isDemo && s.totalUsers < 1000 && s.newUsers7d >= 10 && (s.growth7dPct ?? 0) >= 10).sort((a, b) => (b.growth7dPct ?? 0) - (a.growth7dPct ?? 0)).slice(0, 5);
    const recent = await ctx.db.query("milestones").withIndex("by_time").order("desc").take(20);
    const milestones = [];
    for (const m of recent) {
      const s = all.find((x) => x._id === m.saasId);
      if (!s || s.isDemo || !isVerified(s)) continue;
      milestones.push({ _id: m._id, slug: s.slug, name: s.name, logoUrl: s.logoUrl, title: m.title, copy: m.copy, kind: m.kind, achievedAt: m.achievedAt });
      if (milestones.length >= 8) break;
    }
    const expand = (rows: Doc<"saas">[]) => Promise.all(rows.map((s) => withOwnerAndSpark(ctx, s)));
    return {
      trending: await expand(pick("trending", "7d")),
      fastestWeek: await expand(pick("fastest", "7d")),
      newest: await expand(pick("new-rising", "7d")),
      hiddenGems: await expand(hidden),
      devTools: await expand(pick("most-new", "30d", { category: "developer-tools" })),
      ai: await expand(pick("most-new", "30d", { category: "ai" })),
      milestones,
    };
  },
});

export const compare = query({
  args: { slugs: v.array(v.string()) },
  handler: async (ctx, { slugs }) => {
    const out = [];
    for (const slug of [...new Set(slugs)].slice(0, 4)) {
      const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
      if (!s || !s.isPublic) continue;
      const rows = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", s._id).gte("day", dayKey(Date.now() - 90 * DAY))).collect();
      out.push({ ...publicSaas(s), series: rows.map((r) => ({ day: r.day, total: r.totalUsers, delta: r.newUsers })) });
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
