import { v } from "convex/values";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getProvider, ProviderError, type History, type ProviderMetrics, type Role } from "./providers";
import { fetchHistory, fetchMetrics, hasHistory } from "./providerRun";
import { DAY, HOUR, dayKey, dayStart } from "./lib/time";
import { growthPct, pct, previousWindowDelta, windowDelta } from "./lib/metrics";
import { estimateRetention } from "./lib/retention";
import { detectSpike } from "./lib/spikes";
import { thresholdMilestones } from "./lib/milestones";
import { checkSnapshot } from "./lib/trust";
import { addMilestones, openFlags, refreshTrust } from "./trust";
import { onSourceFailure, onSourceSuccess } from "./email/lifecycle";
import { onSpikeCheck, onUsersSnapshot } from "./email/growth";
import { integrationRole, providerKind, trustLevel } from "./schema";

const STAGGER_WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 3;
const BACKFILL_DAYS = 30;
export const STALE_AFTER_MS = 2 * DAY + HOUR;

const metricsValidator = v.object({
  totalUsers: v.optional(v.number()),
  newUsers24h: v.optional(v.number()),
  newUsers7d: v.optional(v.number()),
  newUsers30d: v.optional(v.number()),
  activeUsers30d: v.optional(v.number()),
  activatedUsers: v.optional(v.number()),
  activated24h: v.optional(v.number()),
  activated7d: v.optional(v.number()),
  activated30d: v.optional(v.number()),
  visitors30d: v.optional(v.number()),
  sessions30d: v.optional(v.number()),
  visitorsPrev30d: v.optional(v.number()),
  payingUsers: v.optional(v.number()),
  mrr: v.optional(v.number()),
  currency: v.optional(v.string()),
});

const historyValidator = v.object({
  metric: v.union(v.literal("totalUsers"), v.literal("newUsers"), v.literal("activatedUsers"), v.literal("visitors")),
  points: v.array(v.object({ day: v.string(), value: v.number() })),
});

// Spreads all integrations over a 10-minute window so provider APIs are never hit in one burst.
export const runAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const ids = await ctx.runQuery(internal.integrations.listAll, {});
    const step = ids.length ? STAGGER_WINDOW_MS / ids.length : 0;
    await Promise.all(ids.map((integrationId, i) => ctx.scheduler.runAfter(Math.round(i * step), internal.sync.runOne, { integrationId, attempt: 1 })));
  },
});

export const runOne = internalAction({
  args: { integrationId: v.id("integrations"), attempt: v.optional(v.number()) },
  handler: async (ctx, { integrationId, attempt = 1 }) => {
    const data = await ctx.runQuery(internal.integrations.getForSync, { integrationId });
    if (!data) return;
    const { integration, websiteUrl } = data;
    const role: Role = integration.role ?? "users";
    const provider = getProvider(integration.provider);
    const startedAt = Date.now();
    try {
      const metrics = await fetchMetrics(ctx, integration.provider, integration.config, role);
      await ctx.runMutation(internal.sync.recordSuccess, {
        integrationId,
        startedAt,
        attempt,
        role,
        metrics,
        trust: provider.trust(integration.config, websiteUrl),
      });
      if (hasHistory(integration.provider, integration.config) && (!integration.backfilledAt || role === "traffic")) {
        const days = integration.backfilledAt ? 7 : BACKFILL_DAYS;
        try {
          const history = await fetchHistory(ctx, integration.provider, integration.config, role, days);
          if (history && history.points.length) await ctx.runMutation(internal.sync.recordHistory, { integrationId, role, history });
        } catch (e) {
          console.warn(`history backfill failed for ${integrationId}: ${(e as Error).message}`);
        }
        if (!integration.backfilledAt) await ctx.runMutation(internal.sync.markBackfilled, { integrationId });
      }
    } catch (e) {
      const err = e as Error;
      const retryable = err instanceof ProviderError ? err.retryable : true;
      await ctx.runMutation(internal.sync.recordFailure, { integrationId, startedAt, attempt, error: err.message.slice(0, 300) });
      if (retryable && attempt < MAX_ATTEMPTS) await ctx.scheduler.runAfter(attempt * 10 * 60_000, internal.sync.runOne, { integrationId, attempt: attempt + 1 });
    }
  },
});

async function snapshotAt(ctx: MutationCtx, saasId: Id<"saas">, cutoff: number) {
  return ctx.db
    .query("snapshots")
    .withIndex("by_saas_time", (q) => q.eq("saasId", saasId).lte("capturedAt", cutoff))
    .order("desc")
    .first();
}

async function upsertDaily(ctx: MutationCtx, saasId: Id<"saas">, day: string, patch: Partial<Doc<"dailyMetrics">>) {
  const row = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId).eq("day", day)).unique();
  if (row) await ctx.db.patch(row._id, patch);
  else await ctx.db.insert("dailyMetrics", { saasId, day, totalUsers: patch.totalUsers ?? 0, newUsers: patch.newUsers ?? 0, ...patch });
}

// Recompute the window metrics on `saas` from snapshots. Provider-reported counts fill in when history is shorter than the window.
export async function recomputeDerived(ctx: MutationCtx, saasId: Id<"saas">, reported: ProviderMetrics = {}) {
  const saas = await ctx.db.get(saasId);
  if (!saas) return;
  const now = Date.now();
  const latest = await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", saasId)).order("desc").first();
  const first = await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", saasId)).order("asc").first();
  if (!latest || !first) return;
  const total = latest.totalUsers;
  const [b24h, b7d, b30d, b48h, b14d, b60d] = await Promise.all([1, 7, 30, 2, 14, 60].map((d) => snapshotAt(ctx, saasId, now - d * DAY)));
  const win = (b: typeof b24h, reportedValue: number | undefined) => (b ? total - b.totalUsers : (reportedValue ?? windowDelta(total, null, first)));
  const newUsers24h = win(b24h, reported.newUsers24h);
  const newUsers7d = win(b7d, reported.newUsers7d);
  const newUsers30d = win(b30d, reported.newUsers30d);
  const retention = saas.activeUsers30d !== undefined ? estimateRetention({ totalUsers: total, newUsers30d, activeUsers30d: saas.activeUsers30d }) : null;
  await ctx.db.patch(saasId, {
    totalUsers: total,
    newUsers24h,
    newUsers7d,
    newUsers30d,
    growth30dPct: growthPct(total, b30d, first),
    growth7dPct: growthPct(total, b7d, first),
    newUsersPrev24h: previousWindowDelta(b24h, b48h, first),
    newUsersPrev7d: previousWindowDelta(b7d, b14d, first),
    newUsersPrev30d: previousWindowDelta(b30d, b60d, first),
    activationRatePct: pct(saas.activatedUsers, total),
    retainedUsers: retention?.retained,
    churnedUsers: retention?.churned,
    retentionRatePct: retention?.ratePct,
    retentionSource: retention ? "estimated" : undefined,
    firstSnapshotAt: first.capturedAt,
  });
}

export const recordSuccess = internalMutation({
  args: { integrationId: v.id("integrations"), startedAt: v.number(), attempt: v.number(), role: integrationRole, metrics: metricsValidator, trust: trustLevel },
  handler: async (ctx, { integrationId, startedAt, attempt, role, metrics, trust }) => {
    const integration = await ctx.db.get(integrationId);
    if (!integration) return;
    const { saasId } = integration;
    const saas = await ctx.db.get(saasId);
    if (!saas) return;
    const now = Date.now();
    const day = dayKey(now);

    const syncRunId = await ctx.db.insert("syncRuns", {
      saasId, integrationId, role, provider: integration.provider, startedAt, finishedAt: now, durationMs: now - startedAt, attempt, status: "ok", totalUsers: metrics.totalUsers,
    });
    await ctx.db.patch(integrationId, { status: "ok", trust, lastError: undefined, lastSyncAt: now, lastSuccessAt: now, consecutiveFailures: 0 });

    if (role === "users" && metrics.totalUsers !== undefined) {
      const totalUsers = metrics.totalUsers;
      const prev = await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", saasId)).order("desc").first();
      const firstEver = !prev && integration.lastSuccessAt === undefined;
      await ctx.db.insert("snapshots", { saasId, totalUsers, capturedAt: now, source: integration.provider, trust, syncRunId });

      const yesterday = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId).lt("day", day)).order("desc").first();
      const dayBase = yesterday?.totalUsers ?? prev?.totalUsers ?? totalUsers;
      const newToday = totalUsers - dayBase;
      await upsertDaily(ctx, saasId, day, { totalUsers, newUsers: newToday, activeUsers30d: metrics.activeUsers30d });

      await ctx.db.patch(saasId, { trust, lastSyncedAt: now, activeUsers30d: metrics.activeUsers30d ?? saas.activeUsers30d });
      await recomputeDerived(ctx, saasId, metrics);

      // Milestones, spikes and anomaly checks only for real (non-demo) products.
      if (!saas.isDemo) {
        // First snapshot is a baseline, not a crossing.
        if (prev) await addMilestones(ctx, saasId, thresholdMilestones(prev.totalUsers, totalUsers, saas.name));
        const history = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId).lt("day", day)).order("desc").take(14);
        const spike = detectSpike(history.reverse().map((r) => r.newUsers), newToday);
        if (spike) await addEvent(ctx, saasId, "spike", day, now, `${spike.multiple}× a normal day`, `Gained ${newToday} users today vs a ${spike.average}/day average.`, newToday, spike.multiple);
        const reconnects = await ctx.db.query("events").withIndex("by_saas_time", (q) => q.eq("saasId", saasId).gte("at", now - 7 * DAY)).collect();
        const flags = checkSnapshot({
          prevTotal: prev?.totalUsers ?? null,
          newTotal: totalUsers,
          elapsedMs: prev ? now - prev.capturedAt : 0,
          prevProvider: prev?.source,
          provider: integration.provider,
          reconnectsLast7d: reconnects.filter((e) => e.kind === "reconnect").length,
          activatedUsers: saas.activatedUsers,
        });
        await openFlags(ctx, saasId, flags);
        // Email hooks: threshold crossings, spike alerts, source connected / recovered.
        const fresh = (await ctx.db.get(saasId))!;
        if (prev) await onUsersSnapshot(ctx, fresh, prev.totalUsers, totalUsers);
        const closed = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId).lt("day", day)).order("desc").take(30);
        await onSpikeCheck(ctx, fresh, closed.reverse().map((r) => r.newUsers));
        await onSourceSuccess(ctx, integration, fresh, totalUsers, firstEver);
      }
    }

    if (role === "activation" && metrics.activatedUsers !== undefined) {
      const prevActivated = saas.activatedUsers ?? null;
      const yesterday = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId).lt("day", day)).order("desc").first();
      const base = yesterday?.activatedUsers ?? prevActivated ?? metrics.activatedUsers;
      const newActivated = metrics.activatedUsers - base;
      await upsertDaily(ctx, saasId, day, { activatedUsers: metrics.activatedUsers, newActivated });
      await ctx.db.patch(saasId, {
        activatedUsers: metrics.activatedUsers,
        activated24h: metrics.activated24h,
        activated7d: metrics.activated7d,
        activated30d: metrics.activated30d,
        activationRatePct: pct(metrics.activatedUsers, saas.totalUsers),
      });
      if (!saas.isDemo) {
        if (prevActivated !== null) await addMilestones(ctx, saasId, thresholdMilestones(prevActivated, metrics.activatedUsers, saas.name, "activated"));
        const history = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId).lt("day", day)).order("desc").take(14);
        const spike = detectSpike(history.reverse().map((r) => r.newActivated ?? 0), newActivated);
        if (spike) await addEvent(ctx, saasId, "activation_spike", day, now, `${spike.multiple}× activations`, `${newActivated} users activated today vs a ${spike.average}/day average.`, newActivated, spike.multiple);
        await openFlags(ctx, saasId, checkSnapshot({ prevTotal: null, newTotal: saas.totalUsers, elapsedMs: 0, provider: integration.provider, reconnectsLast7d: 0, activatedUsers: metrics.activatedUsers }));
      }
    }

    if (role === "traffic" && metrics.visitors30d !== undefined) {
      await ctx.db.patch(saasId, { visitors30d: metrics.visitors30d, sessions30d: metrics.sessions30d, visitorsPrev30d: metrics.visitorsPrev30d });
    }

    if (role === "revenue" && metrics.payingUsers !== undefined) {
      await upsertDaily(ctx, saasId, day, { payingUsers: metrics.payingUsers, mrr: metrics.mrr });
      await ctx.db.patch(saasId, { payingUsers: metrics.payingUsers, mrr: metrics.mrr, currency: metrics.currency ?? saas.currency });
    }

    await refreshTrust(ctx, saasId);
  },
});

export const recordFailure = internalMutation({
  args: { integrationId: v.id("integrations"), startedAt: v.number(), attempt: v.number(), error: v.string() },
  handler: async (ctx, { integrationId, startedAt, attempt, error }) => {
    const integration = await ctx.db.get(integrationId);
    if (!integration) return;
    const now = Date.now();
    const failures = (integration.consecutiveFailures ?? 0) + 1;
    await ctx.db.insert("syncRuns", { saasId: integration.saasId, integrationId, role: integration.role ?? "users", provider: integration.provider, startedAt, finishedAt: now, durationMs: now - startedAt, attempt, status: "error", error });
    await ctx.db.patch(integrationId, { status: "error", lastError: error, lastSyncAt: now, lastFailureAt: now, consecutiveFailures: failures });
    // ~1 day of failed users syncs demotes the SaaS to pending so stale numbers aren't ranked.
    if ((integration.role ?? "users") === "users" && failures >= 6) await ctx.db.patch(integration.saasId, { trust: "pending" });
    await refreshTrust(ctx, integration.saasId);
    await onSourceFailure(ctx, integration, failures, error);
  },
});

export const markBackfilled = internalMutation({
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, { integrationId }) => {
    await ctx.db.patch(integrationId, { backfilledAt: Date.now() });
  },
});

// One-time (users/activation) or rolling (traffic) history import. Never overwrites days that already have live data.
export const recordHistory = internalMutation({
  args: { integrationId: v.id("integrations"), role: integrationRole, history: historyValidator },
  handler: async (ctx, { integrationId, role, history }) => {
    const integration = await ctx.db.get(integrationId);
    if (!integration) return;
    const saas = await ctx.db.get(integration.saasId);
    if (!saas) return;
    const { saasId } = integration;
    const points = [...history.points].sort((a, b) => a.day.localeCompare(b.day));
    if (history.metric === "visitors") {
      for (const p of points) await upsertDaily(ctx, saasId, p.day, { visitors: p.value });
      return;
    }
    if (history.metric === "activatedUsers" && role === "activation") {
      let prev: number | null = null;
      for (const p of points) {
        await upsertDaily(ctx, saasId, p.day, { activatedUsers: p.value, newActivated: prev === null ? 0 : p.value - prev });
        prev = p.value;
      }
      return;
    }
    if (role !== "users") return;
    const firstLive = await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", saasId)).order("asc").first();
    const liveDay = firstLive ? dayKey(firstLive.capturedAt) : "9999-99-99";
    let totals: { day: string; value: number }[];
    if (history.metric === "newUsers") {
      // Reconstruct totals backwards from the current total using per-day signups.
      let running = saas.totalUsers;
      const rev = [...points].reverse();
      const today = dayKey(Date.now());
      totals = [];
      for (const p of rev) {
        if (p.day >= today) continue;
        running -= p.value;
        totals.push({ day: p.day, value: Math.max(0, running) });
      }
      totals.reverse();
    } else totals = points;
    let prev: number | null = null;
    for (const t of totals) {
      if (t.day >= liveDay) { prev = t.value; continue; }
      const at = dayStart(Date.parse(`${t.day}T00:00:00Z`)) + DAY - 1;
      await ctx.db.insert("snapshots", { saasId, totalUsers: t.value, capturedAt: at, source: integration.provider, trust: integration.trust, backfilled: true });
      await upsertDaily(ctx, saasId, t.day, { totalUsers: t.value, newUsers: prev === null ? 0 : t.value - prev });
      prev = t.value;
    }
    // Live day's newUsers now has a real baseline.
    const liveRow = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId).eq("day", liveDay)).unique();
    if (liveRow && prev !== null) await ctx.db.patch(liveRow._id, { newUsers: liveRow.totalUsers - prev });
    await recomputeDerived(ctx, saasId);
  },
});

export async function addEvent(ctx: MutationCtx, saasId: Id<"saas">, kind: Doc<"events">["kind"], day: string, at: number, title: string, detail: string, value?: number, multiple?: number) {
  const existing = await ctx.db.query("events").withIndex("by_saas_kind_day", (q) => q.eq("saasId", saasId).eq("kind", kind).eq("day", day)).first();
  if (existing) return;
  await ctx.db.insert("events", { saasId, kind, day, at, title, detail, value, multiple });
}

export type { History };
export { providerKind };
