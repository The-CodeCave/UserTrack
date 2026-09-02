import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getProfileForUser, requireProfile } from "./profiles";
import { DAY } from "./lib/time";

const targetType = v.union(v.literal("saas"), v.literal("profile"));

export const toggle = mutation({
  args: { targetType, targetId: v.string() },
  handler: async (ctx, { targetType, targetId }) => {
    const { profile } = await requireProfile(ctx);
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower_target", (q) => q.eq("followerId", profile._id).eq("targetType", targetType).eq("targetId", targetId))
      .unique();
    const target = targetType === "saas" ? await ctx.db.get(targetId as Id<"saas">) : await ctx.db.get(targetId as Id<"profiles">);
    if (!target) throw new Error("Not found");
    if (targetType === "profile" && target._id === profile._id) throw new Error("You cannot follow yourself");
    const delta = existing ? -1 : 1;
    if (existing) await ctx.db.delete(existing._id);
    else await ctx.db.insert("follows", { followerId: profile._id, targetType, targetId });
    await ctx.db.patch(target._id, { followerCount: Math.max(0, (target.followerCount ?? 0) + delta) });
    return !existing;
  },
});

export const status = query({
  args: { targetType, targetId: v.string() },
  handler: async (ctx, { targetType, targetId }) => {
    const { profile } = await getProfileForUser(ctx);
    if (!profile) return { signedIn: false, following: false };
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower_target", (q) => q.eq("followerId", profile._id).eq("targetType", targetType).eq("targetId", targetId))
      .unique();
    return { signedIn: true, following: Boolean(existing) };
  },
});

// Everything the signed-in user follows, with the last 7 days of movement and recent milestones.
export const feed = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getProfileForUser(ctx);
    if (!profile) return null;
    const rows = await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", profile._id)).collect();
    const since = Date.now() - 7 * DAY;
    const saasIds = new Set(rows.filter((r) => r.targetType === "saas").map((r) => r.targetId as Id<"saas">));
    const founders = [];
    for (const r of rows.filter((r) => r.targetType === "profile")) {
      const p = await ctx.db.get(r.targetId as Id<"profiles">);
      if (!p) continue;
      founders.push({ _id: p._id, username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl });
      for (const s of await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", p._id)).collect()) if (s.isPublic) saasIds.add(s._id);
    }
    const saas = [];
    const milestones = [];
    for (const id of saasIds) {
      const s = await ctx.db.get(id);
      if (!s || !s.isPublic) continue;
      saas.push({ _id: s._id, slug: s.slug, name: s.name, logoUrl: s.logoUrl, trust: s.trust, totalUsers: s.totalUsers, newUsers7d: s.newUsers7d, growth7dPct: s.growth7dPct ?? 0, rank: s.rank, trendingRank: s.trendingRank, prevTrendingRank: s.prevTrendingRank, followed: rows.some((r) => r.targetType === "saas" && r.targetId === s._id) });
      const ms = await ctx.db.query("milestones").withIndex("by_saas_time", (q) => q.eq("saasId", id).gte("achievedAt", since)).collect();
      milestones.push(...ms.map((m) => ({ _id: m._id, slug: s.slug, name: s.name, title: m.title, copy: m.copy, kind: m.kind, achievedAt: m.achievedAt })));
    }
    saas.sort((a, b) => b.newUsers7d - a.newUsers7d);
    milestones.sort((a, b) => b.achievedAt - a.achievedAt);
    return { saas, founders, milestones: milestones.slice(0, 30) };
  },
});
