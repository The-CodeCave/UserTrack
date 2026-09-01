import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getProvider } from "./providers";
import { DAY, HOUR, dayKey } from "./lib/time";
import { growthPct, windowDelta } from "./lib/metrics";

export const runAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const ids = await ctx.runQuery(internal.integrations.listAll, {});
    await Promise.all(ids.map((integrationId) => ctx.scheduler.runAfter(0, internal.sync.runOne, { integrationId })));
  },
});

export const runOne = internalAction({
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, { integrationId }) => {
    const data = await ctx.runQuery(internal.integrations.getForSync, { integrationId });
    if (!data) return;
    const { integration, websiteUrl } = data;
    const provider = getProvider(integration.provider);
    const startedAt = Date.now();
    try {
      const totalUsers = await provider.fetchTotalUsers(integration.config);
      await ctx.runMutation(internal.sync.recordSnapshot, {
        integrationId,
        startedAt,
        totalUsers,
        trust: provider.trust(integration.config, websiteUrl),
      });
    } catch (e) {
      await ctx.runMutation(internal.sync.recordFailure, {
        integrationId,
        startedAt,
        error: (e as Error).message.slice(0, 300),
      });
    }
  },
});

export const recordSnapshot = internalMutation({
  args: {
    integrationId: v.id("integrations"),
    startedAt: v.number(),
    totalUsers: v.number(),
    trust: v.union(v.literal("verified"), v.literal("unverified"), v.literal("pending")),
  },
  handler: async (ctx, { integrationId, startedAt, totalUsers, trust }) => {
    const integration = await ctx.db.get(integrationId);
    if (!integration) return;
    const { saasId } = integration;
    const now = Date.now();

    const syncRunId = await ctx.db.insert("syncRuns", { saasId, integrationId, startedAt, finishedAt: now, status: "ok", totalUsers });
    await ctx.db.insert("snapshots", { saasId, totalUsers, capturedAt: now, source: integration.provider, trust, syncRunId });
    await ctx.db.patch(integrationId, { status: "ok", trust, lastError: undefined, lastSyncAt: now });

    const bySaas = ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", saasId));
    const first = await bySaas.order("asc").first();
    const at = (cutoff: number) =>
      ctx.db
        .query("snapshots")
        .withIndex("by_saas_time", (q) => q.eq("saasId", saasId).lte("capturedAt", cutoff))
        .order("desc")
        .first();
    const [b24h, b7d, b30d] = await Promise.all([at(now - DAY), at(now - 7 * DAY), at(now - 30 * DAY)]);

    const day = dayKey(now);
    const today = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId).eq("day", day)).unique();
    const yesterday = await ctx.db
      .query("dailyMetrics")
      .withIndex("by_saas_day", (q) => q.eq("saasId", saasId).lt("day", day))
      .order("desc")
      .first();
    const dayBase = yesterday?.totalUsers ?? first?.totalUsers ?? totalUsers;
    const dailyDoc = { saasId, day, totalUsers, newUsers: totalUsers - dayBase };
    if (today) await ctx.db.patch(today._id, dailyDoc);
    else await ctx.db.insert("dailyMetrics", dailyDoc);

    await ctx.db.patch(saasId, {
      totalUsers,
      newUsers24h: windowDelta(totalUsers, b24h, first),
      newUsers7d: windowDelta(totalUsers, b7d, first),
      newUsers30d: windowDelta(totalUsers, b30d, first),
      growth30dPct: growthPct(totalUsers, b30d, first),
      trust,
      lastSyncedAt: now,
      firstSnapshotAt: first?.capturedAt ?? now,
    });
  },
});

export const recordFailure = internalMutation({
  args: { integrationId: v.id("integrations"), startedAt: v.number(), error: v.string() },
  handler: async (ctx, { integrationId, startedAt, error }) => {
    const integration = await ctx.db.get(integrationId);
    if (!integration) return;
    await ctx.db.insert("syncRuns", { saasId: integration.saasId, integrationId, startedAt, finishedAt: Date.now(), status: "error", error });
    await ctx.db.patch(integrationId, { status: "error", lastError: error, lastSyncAt: Date.now() });
    const runs = await ctx.db.query("syncRuns").withIndex("by_saas_time", (q) => q.eq("saasId", integration.saasId)).order("desc").take(6);
    // Six consecutive failures (~1 day) demote the SaaS to pending so stale numbers aren't ranked.
    if (runs.length === 6 && runs.every((r) => r.status === "error")) await ctx.db.patch(integration.saasId, { trust: "pending" });
  },
});

export const STALE_AFTER_MS = 2 * DAY + HOUR;
