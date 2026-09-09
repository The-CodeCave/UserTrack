import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { DAY, HOUR, dayKey } from "./lib/time";
import { recomputeDerived } from "./sync";
import { addMilestones } from "./trust";
import { thresholdMilestones } from "./lib/milestones";
import { removeSaas } from "./domain/projects";

interface Demo {
  name: string; slug: string; description: string; category: string; tags: string[]; start: number; growth: number; site: string; activation?: number;
  // Lifecycle demo: converted ≈ rate × users, trials ≈ trialShare × activated. Never amounts.
  conversion?: { mode: "active_paid"; rate: number; trialShare?: number };
  visibility?: Doc<"saas">["visibility"];
  cohorts?: boolean;
  projectType?: "mobile";
  appStoreUrl?: string;
}

const DEMO: Demo[] = [
  // Rate public, count private + cohort-verified identity.
  { name: "Northwind Analytics", slug: "demo-northwind", description: "Product analytics for indie SaaS teams.", category: "analytics", tags: ["analytics", "devtools"], start: 4200, growth: 0.032, site: "https://northwind.example", activation: 0.62, conversion: { mode: "active_paid", rate: 0.06, trialShare: 0.28 }, visibility: { conversionRate: true, trialConversion: true, convertedCount: false }, cohorts: true },
  { name: "Ledgerly", slug: "demo-ledgerly", description: "Bookkeeping that closes itself.", category: "fintech", tags: ["fintech"], start: 12800, growth: 0.011, site: "https://ledgerly.example" },
  { name: "Pixelpost", slug: "demo-pixelpost", description: "Schedule and design social posts in one place.", category: "marketing", tags: ["marketing", "social"], start: 900, growth: 0.06, site: "https://pixelpost.example", activation: 0.48 },
  { name: "Formwave", slug: "demo-formwave", description: "Forms and surveys with instant dashboards.", category: "no-code", tags: ["forms", "nocode"], start: 2300, growth: 0.02, site: "https://formwave.example" },
  // Mobile profile, converted only (no trial), conversion connected but private.
  { name: "Shipnote", slug: "demo-shipnote", description: "Changelogs your users actually read.", category: "developer-tools", tags: ["devtools"], start: 640, growth: 0.045, site: "https://shipnote.example", activation: 0.71, conversion: { mode: "active_paid", rate: 0.045 }, projectType: "mobile", appStoreUrl: "https://apps.apple.com/app/id123456789" },
];

// Lifecycle demo data (profile, trial / converted daily columns, stage snapshots, cohorts) derived from the stored daily rows.
// Idempotent so `run` and `refresh` share it; the conversion rates themselves come from recomputeDerived, which callers run next.
async function applyLifecycle(ctx: MutationCtx, saasId: Id<"saas">, d: Demo, now: number) {
  for (const r of await ctx.db.query("stageSnapshots").withIndex("by_saas_stage_time", (q) => q.eq("saasId", saasId)).collect()) await ctx.db.delete(r._id);
  for (const r of await ctx.db.query("cohortMetrics").withIndex("by_saas_cohort", (q) => q.eq("saasId", saasId)).collect()) await ctx.db.delete(r._id);
  const profile: Partial<Doc<"saas">> = { category: d.category, projectType: d.projectType, appStoreUrl: d.appStoreUrl, visibility: d.visibility, identityQuality: d.cohorts ? "cohort_verified" : undefined, identityCoveragePct: d.cohorts ? 92 : undefined };
  const c = d.conversion;
  // One "connected" source per lifecycle stage so the funnel shows provenance; demo integrations are never synced (integrations.pageAll skips demo products).
  for (const r of await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).collect()) await ctx.db.delete(r._id);
  const roles: Doc<"integrations">["role"][] = ["users", ...(d.activation ? ["activation" as const] : []), ...(c ? ["conversion" as const] : [])];
  for (const role of roles) await ctx.db.insert("integrations", { saasId, provider: "endpoint", role, config: { url: `${d.site}/api/usertrack`, token: "demo" }, status: "ok", trust: "verified", lastSyncAt: now, lastSuccessAt: now, connectedAt: now, backfilledAt: now });
  const rows = (await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId)).collect()).sort((a, b) => a.day.localeCompare(b.day));
  if (!c || rows.length === 0) return ctx.db.patch(saasId, profile);
  const daily: { day: string; convertedUsers: number; newConverted: number; trialUsers?: number; newTrials?: number }[] = [];
  for (const r of rows) {
    const prev = daily[daily.length - 1];
    const convertedUsers = Math.round(r.totalUsers * c.rate);
    const trialUsers = c.trialShare !== undefined && r.activatedUsers !== undefined ? Math.round(r.activatedUsers * c.trialShare) : undefined;
    const patch = { convertedUsers, newConverted: prev ? Math.max(0, convertedUsers - prev.convertedUsers) : 0, trialUsers, newTrials: trialUsers === undefined ? undefined : prev?.trialUsers === undefined ? 0 : Math.max(0, trialUsers - prev.trialUsers) };
    await ctx.db.patch(r._id, patch);
    daily.push({ day: r.day, ...patch });
  }
  const last = daily[daily.length - 1];
  const at30 = [...daily].reverse().find((r) => r.day <= dayKey(now - 30 * DAY));
  const flow = (days: number, pick: (r: typeof last) => number | undefined) => daily.filter((r) => r.day > dayKey(now - days * DAY)).reduce((a, r) => a + (pick(r) ?? 0), 0);
  for (const r of new Set([daily[0], at30, daily[Math.max(0, daily.length - 8)], last])) {
    if (!r) continue;
    const capturedAt = r === last ? now : Date.parse(`${r.day}T00:00:00Z`);
    await ctx.db.insert("stageSnapshots", { saasId, stage: "converted", value: r.convertedUsers, capturedAt, source: "endpoint", trust: "verified", mode: c.mode });
    if (r.trialUsers !== undefined) await ctx.db.insert("stageSnapshots", { saasId, stage: "trial", value: r.trialUsers, capturedAt, source: "endpoint", trust: "verified" });
  }
  if (d.cohorts) {
    const months = new Map<string, number>();
    for (const r of rows) months.set(r.day.slice(0, 7), (months.get(r.day.slice(0, 7)) ?? 0) + Math.max(0, r.newUsers));
    for (const [cohort, signedUp] of months) {
      const activated = Math.round(signedUp * (d.activation ?? 0.5));
      const converted = Math.round(signedUp * c.rate);
      await ctx.db.insert("cohortMetrics", { saasId, cohort, signedUp, activated, trial: Math.round(activated * (c.trialShare ?? 0)), converted, activatedD7: Math.round(activated * 0.85), convertedD30: Math.round(converted * 0.7), medianTimeToActivationMs: 2 * DAY, medianTimeToConversionMs: 9 * DAY, computedAt: now });
    }
  }
  await ctx.db.patch(saasId, {
    ...profile,
    convertedUsers: last.convertedUsers, trialUsers: last.trialUsers, conversionMode: c.mode,
    newTrials7d: last.trialUsers === undefined ? undefined : flow(7, (r) => r.newTrials), newTrials30d: last.trialUsers === undefined ? undefined : flow(30, (r) => r.newTrials),
    newConverted24h: last.newConverted, newConverted7d: flow(7, (r) => r.newConverted), newConverted30d: flow(30, (r) => r.newConverted),
    convertedPrev30d: at30?.convertedUsers, convertedGrowth30dPct: at30 && at30.convertedUsers > 0 ? Math.round(((last.convertedUsers - at30.convertedUsers) / at30.convertedUsers) * 1000) / 10 : undefined,
  });
}

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
      await applyLifecycle(ctx, saasId, d, now);
      await recomputeDerived(ctx, saasId);
    }
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
    return "seeded";
  },
});

// Re-applies metadata + lifecycle demo fields to existing demo rows without touching user snapshots.
export const refresh = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for (const d of DEMO) {
      const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", d.slug)).unique();
      if (!s?.isDemo) continue;
      await applyLifecycle(ctx, s._id, d, Date.now());
      await recomputeDerived(ctx, s._id);
      n++;
    }
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
    return `refreshed ${n}`;
  },
});

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

// Removes one project and everything attached to it (integrations, snapshots, history, milestones). The dashboard's
// danger zone does the same thing for the owner; this is the ops path for a project that has to go without a session.
export const removeBySlug = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!s) return "not found";
    await removeSaas(ctx, s._id);
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
    return `removed ${slug}`;
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

// Dev / QA helper: append a users snapshot for a product and run the same milestone + share-event hooks the sync engine
// runs, so the Share Center can be exercised without a real provider. Never touches demo products.
export const simulateGrowth = internalMutation({
  args: { slug: v.string(), totalUsers: v.number() },
  handler: async (ctx, { slug, totalUsers }) => {
    const saas = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!saas || saas.isDemo) throw new Error("Unknown or demo product");
    const prev = await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", saas._id)).order("desc").first();
    const now = Date.now();
    await ctx.db.insert("snapshots", { saasId: saas._id, totalUsers, capturedAt: now, source: "manual", trust: saas.trust });
    await ctx.db.patch(saas._id, { totalUsers, newUsers30d: Math.max(0, totalUsers - (prev?.totalUsers ?? totalUsers)), lastSyncedAt: now });
    await addMilestones(ctx, saas._id, thresholdMilestones(prev?.totalUsers ?? 0, totalUsers, saas.name));
    return { previous: prev?.totalUsers ?? null, totalUsers };
  },
});
