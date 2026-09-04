import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getProfileForUser, requireProfile } from "./profiles";
import { DAY, weekKey } from "./lib/time";
import { getPreferences } from "./email/prefs";
import { recordPage, startRun } from "./jobs";
import { enqueue } from "./email/send";
import type { WeeklyDigestData } from "./email/templates";

export interface DigestSaas {
  slug: string; name: string; totalUsers: number; newUsers7d: number; growth7dPct: number;
  rank?: number; prevRank?: number; trendingRank?: number; trust: string; activationRatePct?: number;
}
export interface DigestPayload {
  week: string;
  own: DigestSaas[];
  followed: DigestSaas[];
  milestones: { title: string; copy: string; slug: string; achievedAt: number }[];
  movers: DigestSaas[];
  trending: DigestSaas[];
  generatedAt: number;
}

// Movers/followed are read from bounded windows: the top MOVERS_SCAN ranked products and at most FOLLOW_SCAN follows per profile.
const MOVERS_SCAN = 200;
const FOLLOW_SCAN = 500;

const brief = (s: Doc<"saas">): DigestSaas => ({
  slug: s.slug, name: s.name, totalUsers: s.totalUsers, newUsers7d: s.newUsers7d, growth7dPct: s.growth7dPct ?? 0, rank: s.rank, prevRank: s.prevRank, trendingRank: s.trendingRank, trust: s.trust, activationRatePct: s.activationRatePct,
});

// Builds one digest per opted-in profile for the current ISO week (paged), and emails it through the mailer.
export const generate = internalMutation({
  args: { cursor: v.optional(v.string()), onlyProfileId: v.optional(v.id("profiles")), runId: v.optional(v.id("jobRuns")) },
  handler: async (ctx, { cursor, onlyProfileId, runId: prevRun }) => {
    const now = Date.now();
    const runId = onlyProfileId ? undefined : (prevRun ?? (await startRun(ctx, "weekly digest")));
    const week = weekKey(now);
    const since = now - 7 * DAY;
    // Bounded reads of the current standings instead of the whole public table (docs/ARCHITECTURE.md → Jobs).
    const trending = (await ctx.db.query("saas").withIndex("by_public_trending", (q) => q.eq("isPublic", true).gte("trendingRank", 1)).take(10)).filter((s) => !s.isDemo).sort((a, b) => a.trendingRank! - b.trendingRank!).slice(0, 5).map(brief);
    const ranked = (await ctx.db.query("saas").withIndex("by_public_rank", (q) => q.eq("isPublic", true).gte("rank", 1)).take(MOVERS_SCAN)).filter((s) => !s.isDemo);
    const movers = ranked.filter((s) => s.prevRank && s.prevRank > s.rank!).sort((a, b) => (b.prevRank! - b.rank!) - (a.prevRank! - a.rank!)).slice(0, 5).map(brief);
    const recent = await ctx.db.query("milestones").withIndex("by_time", (q) => q.gte("achievedAt", since)).order("desc").take(50);
    const page = onlyProfileId
      ? { page: [await ctx.db.get(onlyProfileId)].filter((p): p is Doc<"profiles"> => Boolean(p)), isDone: true, continueCursor: "" }
      : await ctx.db.query("profiles").paginate({ cursor: cursor ?? null, numItems: 50 });
    for (const p of page.page) {
      if (!p.onboardingCompleted || p.userId === "demo") continue;
      const prefs = await getPreferences(ctx, p.userId);
      if (!prefs.weeklyDigest && !onlyProfileId) continue;
      const exists = await ctx.db.query("digests").withIndex("by_profile_week", (q) => q.eq("profileId", p._id).eq("weekKey", week)).unique();
      if (exists && !onlyProfileId) continue;
      const ownRows = (await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", p._id)).collect()).filter((s) => !s.isDemo);
      const own = ownRows.map(brief);
      const follows = await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", p._id)).take(FOLLOW_SCAN);
      const followedIds = new Set<string>(follows.filter((f) => f.targetType === "saas").map((f) => f.targetId));
      for (const f of follows.filter((f) => f.targetType === "profile")) {
        for (const s of await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", f.targetId as Id<"profiles">)).collect()) followedIds.add(s._id);
      }
      const followedRows = (await Promise.all([...followedIds].map((id) => ctx.db.get(id as Id<"saas">)))).filter((s): s is Doc<"saas"> => Boolean(s) && s!.isPublic && !s!.isDemo);
      const followed = followedRows.sort((a, b) => b.newUsers7d - a.newUsers7d).slice(0, 5).map(brief);
      const ownIds = new Set<string>(ownRows.map((o) => o._id));
      const milestones = [];
      for (const m of recent.filter((m) => followedIds.has(m.saasId) || ownIds.has(m.saasId)).slice(0, 8)) {
        const s = ownRows.find((o) => o._id === m.saasId) ?? followedRows.find((f) => f._id === m.saasId) ?? (await ctx.db.get(m.saasId));
        milestones.push({ title: m.title, copy: m.copy, slug: s?.slug ?? "", achievedAt: m.achievedAt });
      }
      const payload: DigestPayload = { week, own, followed, milestones, movers, trending, generatedAt: now };
      // Silence beats an empty digest.
      const hasSignal = own.some((s) => s.newUsers7d !== 0) || followed.length > 0 || milestones.length > 0;
      if (exists) await ctx.db.patch(exists._id, { payload, createdAt: now });
      else await ctx.db.insert("digests", { profileId: p._id, weekKey: week, payload, createdAt: now });
      if (onlyProfileId || !hasSignal) continue;
      const data: WeeklyDigestData = { week, name: p.displayName, own, followed, milestones, movers, trending };
      const res = await enqueue(ctx, { userId: p.userId, type: "weekly-digest", dedupeKey: `weekly-digest:${p.userId}:${week}`, data });
      const row = await ctx.db.query("digests").withIndex("by_profile_week", (q) => q.eq("profileId", p._id).eq("weekKey", week)).unique();
      if (row) await ctx.db.patch(row._id, res.status === "queued" ? { sentAt: now } : { sendError: res.status === "skipped" ? res.reason : "duplicate" });
    }
    if (runId) await recordPage(ctx, runId, { items: page.page.length, done: page.isDone });
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.digest.generate, { cursor: page.continueCursor, runId });
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

// Owner-triggered preview: builds this week's digest for the caller only, in-app, without emailing.
export const previewMine = mutation({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx);
    await ctx.scheduler.runAfter(0, internal.digest.generate, { onlyProfileId: profile._id });
  },
});
