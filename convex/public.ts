import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { RANGE_MS, RANGES, DAY, dayKey } from "./lib/time";
import { toSeries } from "./lib/metrics";

const rangeArg = v.union(...RANGES.map((r) => v.literal(r)));

function publicProfile(p: Doc<"profiles">) {
  const { _id, username, displayName, avatarUrl, bio, website, x, github } = p;
  return { _id, username, displayName, avatarUrl, bio, website, x, github };
}

function publicSaas(s: Doc<"saas">) {
  const rest: Partial<Doc<"saas">> = { ...s };
  delete rest.ownerId;
  return rest as Omit<Doc<"saas">, "ownerId">;
}

async function sparkline(ctx: QueryCtx, saasId: Doc<"saas">["_id"]) {
  const rows = await ctx.db
    .query("dailyMetrics")
    .withIndex("by_saas_day", (q) => q.eq("saasId", saasId).gte("day", dayKey(Date.now() - 30 * DAY)))
    .collect();
  return rows.map((r) => r.totalUsers);
}

export const leaderboard = query({
  args: { verifiedOnly: v.boolean(), limit: v.optional(v.number()) },
  handler: async (ctx, { verifiedOnly, limit = 50 }) => {
    const rows = verifiedOnly
      ? await ctx.db.query("saas").withIndex("by_public_trust_new30d", (q) => q.eq("isPublic", true).eq("trust", "verified")).order("desc").take(limit)
      : await ctx.db.query("saas").withIndex("by_public_new30d", (q) => q.eq("isPublic", true)).order("desc").take(limit);
    return Promise.all(
      rows.map(async (s) => {
        const owner = await ctx.db.get(s.ownerId);
        return { ...publicSaas(s), owner: owner ? publicProfile(owner) : null, spark: await sparkline(ctx, s._id) };
      }),
    );
  },
});

export const saasBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    const owner = await ctx.db.get(s.ownerId);
    const integration = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", s._id)).first();
    return { ...publicSaas(s), owner: owner ? publicProfile(owner) : null, source: integration?.provider ?? null };
  },
});

export const series = query({
  args: { slug: v.string(), range: rangeArg },
  handler: async (ctx, { slug, range }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s || !s.isPublic) return null;
    const ms = RANGE_MS[range];
    const cutoff = ms === null ? 0 : Date.now() - ms;
    if (range === "24h" || range === "7d") {
      const rows = await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", s._id).gte("capturedAt", cutoff)).collect();
      return toSeries(rows);
    }
    const rows = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", s._id).gte("day", dayKey(cutoff))).collect();
    return rows.map((r) => ({ t: Date.parse(`${r.day}T12:00:00Z`), total: r.totalUsers, delta: r.newUsers }));
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
    const rows = await ctx.db.query("saas").withIndex("by_public_new30d", (q) => q.eq("isPublic", true)).collect();
    return {
      saasCount: rows.length,
      verifiedCount: rows.filter((s) => s.trust === "verified").length,
      trackedUsers: rows.reduce((a, s) => a + s.totalUsers, 0),
      newUsers30d: rows.reduce((a, s) => a + Math.max(0, s.newUsers30d), 0),
    };
  },
});
