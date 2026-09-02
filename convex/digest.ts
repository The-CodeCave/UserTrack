import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { authComponent } from "./auth";
import { getProfileForUser } from "./profiles";
import { DAY, weekKey } from "./lib/time";
import { renderDigestEmail, type DigestPayload } from "./lib/digestEmail";

const brief = (s: Doc<"saas">) => ({
  slug: s.slug, name: s.name, totalUsers: s.totalUsers, newUsers7d: s.newUsers7d, growth7dPct: s.growth7dPct ?? 0, rank: s.rank, prevRank: s.prevRank, trendingRank: s.trendingRank, trust: s.trust, activationRatePct: s.activationRatePct,
});

// Builds one digest per opted-in profile for the current ISO week, then hands off to the sender.
export const generate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const week = weekKey(now);
    const since = now - 7 * DAY;
    const all = (await ctx.db.query("saas").collect()).filter((s) => s.isPublic && !s.isDemo);
    const trending = all.filter((s) => s.trendingRank).sort((a, b) => a.trendingRank! - b.trendingRank!).slice(0, 5).map(brief);
    const movers = all.filter((s) => s.rank && s.prevRank && s.prevRank > s.rank).sort((a, b) => (b.prevRank! - b.rank!) - (a.prevRank! - a.rank!)).slice(0, 5).map(brief);
    const recent = (await ctx.db.query("milestones").withIndex("by_time", (q) => q.gte("achievedAt", since)).order("desc").take(50));
    const profiles = await ctx.db.query("profiles").collect();
    let created = 0;
    for (const p of profiles) {
      if (!p.onboardingCompleted || p.digestOptIn === false || p.userId === "demo") continue;
      const exists = await ctx.db.query("digests").withIndex("by_profile_week", (q) => q.eq("profileId", p._id).eq("weekKey", week)).unique();
      if (exists) continue;
      const own = (await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", p._id)).collect()).map(brief);
      const follows = await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", p._id)).collect();
      const followedIds = new Set<string>(follows.filter((f) => f.targetType === "saas").map((f) => f.targetId));
      for (const f of follows.filter((f) => f.targetType === "profile")) {
        for (const s of await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", f.targetId as Id<"profiles">)).collect()) followedIds.add(s._id);
      }
      const followed = all.filter((s) => followedIds.has(s._id)).sort((a, b) => b.newUsers7d - a.newUsers7d).slice(0, 5).map(brief);
      const ownIds = new Set(own.map((o) => o.slug));
      const milestones = recent
        .filter((m) => followedIds.has(m.saasId) || all.some((s) => s._id === m.saasId && ownIds.has(s.slug)))
        .slice(0, 8)
        .map((m) => ({ title: m.title, copy: m.copy, slug: all.find((s) => s._id === m.saasId)?.slug ?? "", achievedAt: m.achievedAt }));
      const payload: DigestPayload = { week, own, followed, milestones, movers, trending, generatedAt: now };
      await ctx.db.insert("digests", { profileId: p._id, weekKey: week, payload, createdAt: now });
      created++;
    }
    if (created) await ctx.scheduler.runAfter(0, internal.digest.sendAll, { week });
    return created;
  },
});

export const unsent = internalQuery({
  args: { week: v.string() },
  handler: async (ctx, { week }) => {
    const rows = await ctx.db.query("digests").withIndex("by_week", (q) => q.eq("weekKey", week)).collect();
    const out = [];
    for (const d of rows.filter((d) => !d.sentAt && !d.sendError)) {
      const profile = await ctx.db.get(d.profileId);
      if (!profile) continue;
      const user = await authComponent.getAnyUserById(ctx, profile.userId);
      if (!user?.email) continue;
      out.push({ digestId: d._id, email: user.email, name: profile.displayName, payload: d.payload as DigestPayload });
    }
    return out;
  },
});

export const markSent = internalMutation({
  args: { digestId: v.id("digests"), error: v.optional(v.string()) },
  handler: async (ctx, { digestId, error }) => {
    await ctx.db.patch(digestId, error ? { sendError: error } : { sentAt: Date.now() });
  },
});

// Sends through Resend when RESEND_API_KEY + DIGEST_FROM_EMAIL are set; otherwise digests stay in-app only.
export const sendAll = internalAction({
  args: { week: v.string() },
  handler: async (ctx, { week }) => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.DIGEST_FROM_EMAIL;
    const siteUrl = process.env.SITE_URL ?? "";
    const list = await ctx.runQuery(internal.digest.unsent, { week });
    if (!apiKey || !from) {
      for (const d of list) await ctx.runMutation(internal.digest.markSent, { digestId: d.digestId, error: "email not configured" });
      console.log(`digest ${week}: ${list.length} digests generated, email not configured (RESEND_API_KEY / DIGEST_FROM_EMAIL)`);
      return;
    }
    for (const d of list) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: d.email, subject: `Your UserTrack week · ${week}`, html: renderDigestEmail(d.payload, d.name, siteUrl) }),
        });
        if (!res.ok) throw new Error(`Resend ${res.status}`);
        await ctx.runMutation(internal.digest.markSent, { digestId: d.digestId });
      } catch (e) {
        await ctx.runMutation(internal.digest.markSent, { digestId: d.digestId, error: (e as Error).message.slice(0, 200) });
      }
    }
  },
});

export const latest = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getProfileForUser(ctx);
    if (!profile) return null;
    const rows = await ctx.db.query("digests").withIndex("by_profile_week", (q) => q.eq("profileId", profile._id)).order("desc").take(4);
    return rows.map((d) => ({ _id: d._id, weekKey: d.weekKey, payload: d.payload as DigestPayload, sentAt: d.sentAt, sendError: d.sendError }));
  },
});

// Owner-triggered preview: builds this week's digest for the caller only (idempotent per week).
export const generateMine = internalMutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    const p = await ctx.db.get(profileId);
    if (!p) return;
    const week = weekKey(Date.now());
    const exists = await ctx.db.query("digests").withIndex("by_profile_week", (q) => q.eq("profileId", p._id).eq("weekKey", week)).unique();
    if (exists) await ctx.db.delete(exists._id);
    await ctx.db.patch(p._id, { digestOptIn: p.digestOptIn ?? true });
    await ctx.scheduler.runAfter(0, internal.digest.generate, {});
  },
});
