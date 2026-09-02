import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { DAY, HOUR, dayKey } from "./lib/time";
import { recomputeDerived } from "./sync";

const DEMO = [
  { name: "Northwind Analytics", slug: "demo-northwind", description: "Product analytics for indie SaaS teams.", category: "analytics", tags: ["analytics", "devtools"], start: 4200, growth: 0.032, site: "https://northwind.example", activation: 0.62 },
  { name: "Ledgerly", slug: "demo-ledgerly", description: "Bookkeeping that closes itself.", category: "fintech", tags: ["fintech"], start: 12800, growth: 0.011, site: "https://ledgerly.example" },
  { name: "Pixelpost", slug: "demo-pixelpost", description: "Schedule and design social posts in one place.", category: "marketing", tags: ["marketing", "social"], start: 900, growth: 0.06, site: "https://pixelpost.example", activation: 0.48 },
  { name: "Formwave", slug: "demo-formwave", description: "Forms and surveys with instant dashboards.", category: "no-code", tags: ["forms", "nocode"], start: 2300, growth: 0.02, site: "https://formwave.example" },
  { name: "Shipnote", slug: "demo-shipnote", description: "Changelogs your users actually read.", category: "developer-tools", tags: ["devtools"], start: 640, growth: 0.045, site: "https://shipnote.example", activation: 0.71 },
];

// Labelled demo data so the board is never empty. Idempotent: skips if the demo profile exists. Never ranked.
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("profiles").withIndex("by_username", (q) => q.eq("username", "demo")).unique();
    if (existing) return "already seeded";
    const ownerId = await ctx.db.insert("profiles", { userId: "demo", username: "demo", displayName: "UserTrack Demo", bio: "Synthetic sample data. Real listings replace these.", onboardingCompleted: true });
    const now = Date.now();
    for (const [i, d] of DEMO.entries()) {
      const saasId = await ctx.db.insert("saas", {
        ownerId, name: d.name, slug: d.slug, description: d.description, websiteUrl: d.site, tags: d.tags, category: d.category,
        isPublic: true, isDemo: true, trust: "verified", totalUsers: 0, newUsers24h: 0, newUsers7d: 0, newUsers30d: 0, growth30dPct: 0,
      });
      const points: { capturedAt: number; totalUsers: number }[] = [];
      let total = d.start;
      for (let day = 60; day >= 0; day--) {
        const perDay = day <= 1 ? 6 : 1;
        for (let k = 0; k < perDay; k++) {
          const t = now - day * DAY - (perDay - 1 - k) * (DAY / perDay);
          const wobble = 0.6 + Math.abs(Math.sin((day + 1) * (i + 1) * 1.3)) * 0.8;
          total += Math.max(0, Math.round((total * d.growth * wobble) / perDay));
          points.push({ capturedAt: t, totalUsers: total });
        }
      }
      const byDay = new Map<string, number>();
      for (const p of points) {
        await ctx.db.insert("snapshots", { saasId, totalUsers: p.totalUsers, capturedAt: p.capturedAt, source: "endpoint", trust: "verified" });
        byDay.set(dayKey(p.capturedAt), p.totalUsers);
      }
      let prevTotal = points[0].totalUsers;
      let prevActivated: number | null = null;
      for (const [day, totalUsers] of byDay) {
        const activatedUsers = d.activation ? Math.round(totalUsers * d.activation) : undefined;
        await ctx.db.insert("dailyMetrics", { saasId, day, totalUsers, newUsers: totalUsers - prevTotal, activatedUsers, newActivated: activatedUsers !== undefined && prevActivated !== null ? activatedUsers - prevActivated : undefined });
        prevTotal = totalUsers;
        prevActivated = activatedUsers ?? null;
      }
      const last = points[points.length - 1];
      if (d.activation) {
        const activated = Math.round(last.totalUsers * d.activation);
        await ctx.db.patch(saasId, { activatedUsers: activated, activated24h: Math.round(activated * 0.01), activated7d: Math.round(activated * 0.06), activated30d: Math.round(activated * 0.2) });
      }
      await ctx.db.patch(saasId, { lastSyncedAt: now - HOUR, trustScore: 80, trustState: "healthy" });
      await recomputeDerived(ctx, saasId);
    }
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
    return "seeded";
  },
});

// Patches metadata (category) on existing demo rows without touching any metrics.
export const refresh = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for (const d of DEMO) {
      const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", d.slug)).unique();
      if (!s?.isDemo) continue;
      await ctx.db.patch(s._id, { category: d.category });
      await recomputeDerived(ctx, s._id);
      n++;
    }
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
    return `refreshed ${n}`;
  },
});

async function removeSaas(ctx: MutationCtx, id: Id<"saas">) {
  for (const r of await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", id)).collect()) await ctx.db.delete(r._id);
  for (const r of await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", id)).collect()) await ctx.db.delete(r._id);
  for (const r of await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", id)).collect()) await ctx.db.delete(r._id);
  for (const r of await ctx.db.query("syncRuns").withIndex("by_saas_time", (q) => q.eq("saasId", id)).collect()) await ctx.db.delete(r._id);
  for (const r of await ctx.db.query("milestones").withIndex("by_saas_time", (q) => q.eq("saasId", id)).collect()) await ctx.db.delete(r._id);
  for (const r of await ctx.db.query("events").withIndex("by_saas_time", (q) => q.eq("saasId", id)).collect()) await ctx.db.delete(r._id);
  for (const r of await ctx.db.query("fraudFlags").withIndex("by_saas", (q) => q.eq("saasId", id)).collect()) await ctx.db.delete(r._id);
  for (const r of await ctx.db.query("follows").withIndex("by_target", (q) => q.eq("targetType", "saas").eq("targetId", id)).collect()) await ctx.db.delete(r._id);
  await ctx.db.delete(id);
}

export const clear = internalMutation({
  args: {},
  handler: async (ctx) => {
    const p = await ctx.db.query("profiles").withIndex("by_username", (q) => q.eq("username", "demo")).unique();
    if (!p) return "nothing to clear";
    for (const s of await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", p._id)).collect()) await removeSaas(ctx, s._id);
    await ctx.db.delete(p._id);
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
    return "cleared";
  },
});

// Removes a profile and everything it owns (used to clean up smoke-test accounts). Auth user stays.
export const removeProfile = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const p = await ctx.db.query("profiles").withIndex("by_username", (q) => q.eq("username", username)).unique();
    if (!p) return "not found";
    const list = await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", p._id)).collect();
    for (const s of list) await removeSaas(ctx, s._id);
    for (const r of await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", p._id)).collect()) await ctx.db.delete(r._id);
    for (const r of await ctx.db.query("digests").withIndex("by_profile_week", (q) => q.eq("profileId", p._id)).collect()) await ctx.db.delete(r._id);
    for (const t of await ctx.db.query("developerTokens").withIndex("by_profile", (q) => q.eq("profileId", p._id)).collect()) {
      for (const u of await ctx.db.query("apiUsage").withIndex("by_token_day", (q) => q.eq("tokenId", t._id)).collect()) await ctx.db.delete(u._id);
      await ctx.db.delete(t._id);
    }
    for (const r of await ctx.db.query("auditLogs").withIndex("by_profile_time", (q) => q.eq("profileId", p._id)).collect()) await ctx.db.delete(r._id);
    await ctx.db.delete(p._id);
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
    return `removed ${username} (${list.length} saas)`;
  },
});
