import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { DAY, HOUR, dayKey } from "./lib/time";
import { growthPct, windowDelta } from "./lib/metrics";

const DEMO = [
  { name: "Northwind Analytics", slug: "demo-northwind", description: "Product analytics for indie SaaS teams.", tags: ["analytics", "devtools"], start: 4200, growth: 0.032, site: "https://northwind.example" },
  { name: "Ledgerly", slug: "demo-ledgerly", description: "Bookkeeping that closes itself.", tags: ["fintech"], start: 12800, growth: 0.011, site: "https://ledgerly.example" },
  { name: "Pixelpost", slug: "demo-pixelpost", description: "Schedule and design social posts in one place.", tags: ["marketing", "social"], start: 900, growth: 0.06, site: "https://pixelpost.example" },
  { name: "Formwave", slug: "demo-formwave", description: "Forms and surveys with instant dashboards.", tags: ["forms", "nocode"], start: 2300, growth: 0.02, site: "https://formwave.example" },
  { name: "Shipnote", slug: "demo-shipnote", description: "Changelogs your users actually read.", tags: ["devtools"], start: 640, growth: 0.045, site: "https://shipnote.example" },
];

// Labelled demo data so the board is never empty. Idempotent: skips if the demo profile exists.
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("profiles").withIndex("by_username", (q) => q.eq("username", "demo")).unique();
    if (existing) return "already seeded";
    const ownerId = await ctx.db.insert("profiles", { userId: "demo", username: "demo", displayName: "UserTrack Demo", bio: "Synthetic sample data. Real listings replace these.", onboardingCompleted: true });
    const now = Date.now();
    for (const [i, d] of DEMO.entries()) {
      const saasId = await ctx.db.insert("saas", {
        ownerId, name: d.name, slug: d.slug, description: d.description, websiteUrl: d.site, tags: d.tags,
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
      for (const [day, totalUsers] of byDay) {
        await ctx.db.insert("dailyMetrics", { saasId, day, totalUsers, newUsers: totalUsers - prevTotal });
        prevTotal = totalUsers;
      }
      const first = points[0];
      const last = points[points.length - 1];
      const at = (cut: number) => [...points].reverse().find((p) => p.capturedAt <= cut) ?? null;
      await ctx.db.patch(saasId, {
        totalUsers: last.totalUsers,
        newUsers24h: windowDelta(last.totalUsers, at(now - DAY), first),
        newUsers7d: windowDelta(last.totalUsers, at(now - 7 * DAY), first),
        newUsers30d: windowDelta(last.totalUsers, at(now - 30 * DAY), first),
        growth30dPct: growthPct(last.totalUsers, at(now - 30 * DAY), first),
        lastSyncedAt: now - HOUR,
        firstSnapshotAt: first.capturedAt,
      });
    }
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
    return "seeded";
  },
});

export const clear = internalMutation({
  args: {},
  handler: async (ctx) => {
    const p = await ctx.db.query("profiles").withIndex("by_username", (q) => q.eq("username", "demo")).unique();
    if (!p) return "nothing to clear";
    const list = await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", p._id)).collect();
    for (const s of list) {
      for (const r of await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", s._id)).collect()) await ctx.db.delete(r._id);
      for (const r of await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", s._id)).collect()) await ctx.db.delete(r._id);
      await ctx.db.delete(s._id);
    }
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
    for (const s of list) {
      for (const t of ["integrations"] as const) for (const r of await ctx.db.query(t).withIndex("by_saas", (q) => q.eq("saasId", s._id)).collect()) await ctx.db.delete(r._id);
      for (const r of await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", s._id)).collect()) await ctx.db.delete(r._id);
      for (const r of await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", s._id)).collect()) await ctx.db.delete(r._id);
      for (const r of await ctx.db.query("syncRuns").withIndex("by_saas_time", (q) => q.eq("saasId", s._id)).collect()) await ctx.db.delete(r._id);
      await ctx.db.delete(s._id);
    }
    await ctx.db.delete(p._id);
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
    return `removed ${username} (${list.length} saas)`;
  },
});
