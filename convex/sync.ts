import { v } from "convex/values";
import { internalAction, internalMutation, type ActionCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getProvider, normalizeRole, ProviderError, providerLabel, type History, type LifecycleStage, type ProviderMetrics, type Role, type StageIdentities } from "./providers";
import { recordReported } from "./domain/integrations";
import { identitySalt, subjectHash } from "./lib/identity";
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
import { recordSpikeShare } from "./share";
import { addEvent, addOnceEvent } from "./domain/events";
import { dispatchEvent } from "./webhooks";
import { conversionMode, integrationRole, lifecycleStage, providerKind, trustLevel } from "./schema";
import { trackEvent } from "./lib/analytics";

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
  trialUsers: v.optional(v.number()),
  newTrials7d: v.optional(v.number()),
  newTrials30d: v.optional(v.number()),
  convertedUsers: v.optional(v.number()),
  newConverted24h: v.optional(v.number()),
  newConverted7d: v.optional(v.number()),
  newConverted30d: v.optional(v.number()),
  conversionMode: v.optional(conversionMode),
  payingUsers: v.optional(v.number()),
  sourceVersion: v.optional(v.string()),
  protocolVersion: v.optional(v.number()),
  reported: v.optional(v.object({ roles: v.array(v.union(v.literal("users"), v.literal("activation"), v.literal("traffic"), v.literal("conversion"))), history: v.boolean(), identity: v.boolean(), exactCounts: v.boolean() })),
});
const IDENTITY_BATCH = 500;

const historyValidator = v.object({
  metric: v.union(v.literal("totalUsers"), v.literal("newUsers"), v.literal("activatedUsers"), v.literal("visitors"), v.literal("convertedUsers"), v.literal("trialUsers")),
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
    const role: Role = normalizeRole(integration.role);
    const provider = getProvider(integration.provider);
    const startedAt = Date.now();
    try {
      const { identities, ...metrics } = await fetchMetrics(ctx, integration.provider, integration.config, role);
      await ctx.runMutation(internal.sync.recordSuccess, {
        integrationId,
        startedAt,
        attempt,
        role,
        metrics,
        trust: provider.trust(integration.config, websiteUrl),
      });
      if (identities?.length) await recordIdentityBatches(ctx, integrationId, String(integration.saasId), identities);
      if (hasHistory(integration.provider, integration.config) && (!integration.backfilledAt || role === "traffic")) {
        await runBackfill(ctx, integration, role, integration.backfilledAt ? 7 : BACKFILL_DAYS, integration.backfilledAt ? "rolling" : "first_sync");
      }
      await trackEvent("sync_completed", { provider: integration.provider, role, ok: true });
    } catch (e) {
      const err = e as Error;
      const retryable = err instanceof ProviderError ? err.retryable : true;
      await ctx.runMutation(internal.sync.recordFailure, { integrationId, startedAt, attempt, error: err.message.slice(0, 300) });
      await trackEvent("sync_completed", { provider: integration.provider, role, ok: false });
      if (retryable && attempt < MAX_ATTEMPTS) await ctx.scheduler.runAfter(attempt * 10 * 60_000, internal.sync.runOne, { integrationId, attempt: attempt + 1 });
    }
  },
});

// One history import with provenance (backfills row). Idempotent: recordHistory never duplicates a day, and `backfilledAt`
// is only stamped after a successful import so a transient provider error keeps the backfill pending for the next sync.
export type BackfillResult = { ok: true; points: number; ms: number } | { ok: false; error: string };

export async function runBackfill(ctx: ActionCtx, integration: Doc<"integrations">, role: Role, days: number, trigger: "first_sync" | "rolling" | "manual"): Promise<BackfillResult> {
  const now = Date.now();
  const backfillId = await ctx.runMutation(internal.sync.startBackfill, { integrationId: integration._id, role, days, trigger });
  try {
    const history = await fetchHistory(ctx, integration.provider, integration.config, role, days);
    const points = history?.points.length ?? 0;
    if (history && points) await ctx.runMutation(internal.sync.recordHistory, { integrationId: integration._id, role, history, backfillId });
    else await ctx.runMutation(internal.sync.finishBackfill, { backfillId, status: "empty", pointsWritten: 0 });
    if (trigger !== "rolling") await ctx.runMutation(internal.sync.markBackfilled, { integrationId: integration._id });
    return { ok: true, points, ms: Date.now() - now };
  } catch (e) {
    const message = (e as Error).message.slice(0, 300);
    console.warn(`history backfill failed for ${integration._id}: ${message}`);
    await ctx.runMutation(internal.sync.finishBackfill, { backfillId, status: "error", error: message });
    return { ok: false, error: message };
  }
}

// Owner-triggered re-import (dashboard "Backfill history" + MCP). Bounded to 90 days; providers without history return empty.
export const backfill = internalAction({
  args: { integrationId: v.id("integrations"), days: v.optional(v.number()) },
  handler: async (ctx, { integrationId, days }): Promise<BackfillResult> => {
    const data: { integration: Doc<"integrations">; websiteUrl: string } | null = await ctx.runQuery(internal.integrations.getForSync, { integrationId });
    if (!data) return { ok: false, error: "integration not found" };
    const { integration } = data;
    if (!hasHistory(integration.provider, integration.config)) return { ok: false, error: "this source cannot read history" };
    return runBackfill(ctx, integration, normalizeRole(integration.role), Math.min(90, Math.max(1, days ?? BACKFILL_DAYS)), "manual");
  },
});

export const startBackfill = internalMutation({
  args: { integrationId: v.id("integrations"), role: integrationRole, days: v.number(), trigger: v.union(v.literal("first_sync"), v.literal("rolling"), v.literal("manual")) },
  handler: async (ctx, { integrationId, role, days, trigger }) => {
    const integration = await ctx.db.get(integrationId);
    if (!integration) throw new Error("integration not found");
    const now = Date.now();
    return ctx.db.insert("backfills", { saasId: integration.saasId, integrationId, provider: integration.provider, role: normalizeRole(role), fromDay: dayKey(now - days * DAY), toDay: dayKey(now - DAY), status: "running", trigger, startedAt: now });
  },
});

export const finishBackfill = internalMutation({
  args: { backfillId: v.id("backfills"), status: v.union(v.literal("ok"), v.literal("error"), v.literal("empty")), pointsWritten: v.optional(v.number()), error: v.optional(v.string()) },
  handler: async (ctx, { backfillId, status, pointsWritten, error }) => {
    await ctx.db.patch(backfillId, { status, pointsWritten, error, finishedAt: Date.now() });
  },
});

// Raw provider ids are hashed here, inside the action, so a mutation never sees or logs them. Bounded batches per call.
async function recordIdentityBatches(ctx: ActionCtx, integrationId: Id<"integrations">, saasId: string, identities: StageIdentities[]) {
  const salt = identitySalt();
  for (const group of identities) {
    const subjects = await Promise.all(group.ids.map(async (x) => ({ subject: await subjectHash(salt, saasId, x.id), at: x.at })));
    for (let i = 0; i < subjects.length; i += IDENTITY_BATCH) {
      await ctx.runMutation(internal.sync.recordIdentities, { integrationId, stage: group.stage, subjects: subjects.slice(i, i + IDENTITY_BATCH) });
    }
  }
}

export const recordIdentities = internalMutation({
  args: { integrationId: v.id("integrations"), stage: lifecycleStage, subjects: v.array(v.object({ subject: v.string(), at: v.optional(v.number()) })) },
  handler: async (ctx, { integrationId, stage, subjects }) => {
    const integration = await ctx.db.get(integrationId);
    if (!integration) return;
    const now = Date.now();
    for (const { subject, at } of subjects) {
      const existing = await ctx.db.query("identityLinks").withIndex("by_saas_stage_subject", (q) => q.eq("saasId", integration.saasId).eq("stage", stage).eq("subject", subject)).unique();
      if (existing) continue;
      await ctx.db.insert("identityLinks", { saasId: integration.saasId, stage, subject, source: integration.provider, firstSeenAt: now, at: at && Number.isFinite(at) && at > 0 && at <= now ? at : now });
    }
  },
});

async function stageSnapshotAt(ctx: MutationCtx, saasId: Id<"saas">, stage: LifecycleStage, cutoff: number) {
  return ctx.db.query("stageSnapshots").withIndex("by_saas_stage_time", (q) => q.eq("saasId", saasId).eq("stage", stage).lte("capturedAt", cutoff)).order("desc").first();
}

// Ratios between lifecycle stocks. Recomputed whenever any stage changes so a users sync also refreshes conversion %.
function stageRates(s: Pick<Doc<"saas">, "totalUsers" | "activatedUsers" | "convertedUsers" | "newConverted30d" | "newTrials30d" | "trialUsers">) {
  if (s.convertedUsers === undefined) return { signupToConvertedPct: undefined, activatedToConvertedPct: undefined, trialToConvertedPct: undefined };
  return {
    signupToConvertedPct: pct(s.convertedUsers, s.totalUsers),
    activatedToConvertedPct: pct(s.convertedUsers, s.activatedUsers),
    trialToConvertedPct: s.newTrials30d !== undefined && s.newTrials30d > 0 ? pct(s.newConverted30d, s.newTrials30d) : s.trialUsers !== undefined && s.trialUsers + s.convertedUsers > 0 ? pct(s.convertedUsers, s.trialUsers + s.convertedUsers) : undefined,
  };
}

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
    ...stageRates({ ...saas, totalUsers: total }),
    retainedUsers: retention?.retained,
    churnedUsers: retention?.churned,
    retentionRatePct: retention?.ratePct,
    retentionSource: retention ? "estimated" : undefined,
    firstSnapshotAt: first.capturedAt,
  });
}

export const recordSuccess = internalMutation({
  args: { integrationId: v.id("integrations"), startedAt: v.number(), attempt: v.number(), role: integrationRole, metrics: metricsValidator, trust: trustLevel },
  handler: async (ctx, { integrationId, startedAt, attempt, role: rawRole, metrics, trust }) => {
    const role = normalizeRole(rawRole);
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
    await ctx.db.patch(integrationId, { status: "ok", trust, lastError: undefined, lastSyncAt: now, lastSuccessAt: now, consecutiveFailures: 0, ...(metrics.sourceVersion ? { pluginVersion: metrics.sourceVersion, protocolVersion: metrics.protocolVersion } : {}) });
    if (metrics.reported) await recordReported(ctx, integration, metrics.reported);

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
      if (trust === "verified" && saas.verifiedAt === undefined && !saas.isDemo) {
        await ctx.db.patch(saasId, { verifiedAt: now });
        await addOnceEvent(ctx, saasId, "verified", now, "Verified on UserTrack", `${saas.name} now syncs verified user counts read-only from ${providerLabel(integration.provider, integration.config)}.`);
        await dispatchEvent(ctx, { type: "project.verified", key: "verified", saas: { ...saas, totalUsers, verifiedAt: now }, at: now, data: { verification: { level: "verified", provider: integration.provider, verifiedAt: new Date(now).toISOString() } } });
      }

      // Milestones, spikes and anomaly checks only for real (non-demo) products.
      if (!saas.isDemo) {
        // First snapshot is a baseline, not a crossing.
        if (prev) await addMilestones(ctx, saasId, thresholdMilestones(prev.totalUsers, totalUsers, saas.name));
        const history = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId).lt("day", day)).order("desc").take(14);
        const spike = detectSpike(history.reverse().map((r) => r.newUsers), newToday);
        if (spike) {
          const eventId = await addEvent(ctx, saasId, "spike", day, now, `${spike.multiple}× a normal day`, `Gained ${newToday} users today vs a ${spike.average}/day average.`, newToday, spike.multiple);
          if (eventId) {
            await recordSpikeShare(ctx, saas, eventId, day, spike.multiple, newToday);
            await dispatchEvent(ctx, { type: "growth.spike", key: day, saas: { ...saas, totalUsers }, at: now, data: { spike: { day, newUsers: newToday, average: spike.average, multiple: spike.multiple, metric: "newUsers" } } });
          }
        }
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
      await ctx.db.insert("stageSnapshots", { saasId, stage: "activated", value: metrics.activatedUsers, capturedAt: now, source: integration.provider, integrationId, trust });
      await ctx.db.patch(saasId, {
        activatedUsers: metrics.activatedUsers,
        activated24h: metrics.activated24h,
        activated7d: metrics.activated7d,
        activated30d: metrics.activated30d,
        activationRatePct: pct(metrics.activatedUsers, saas.totalUsers),
        ...stageRates({ ...saas, activatedUsers: metrics.activatedUsers }),
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

    if (role === "conversion" && (metrics.convertedUsers ?? metrics.payingUsers) !== undefined) {
      const converted = (metrics.convertedUsers ?? metrics.payingUsers)!;
      const mode = metrics.conversionMode ?? "active_paid";
      const prevConverted = saas.convertedUsers ?? null;
      await ctx.db.insert("stageSnapshots", { saasId, stage: "converted", value: converted, capturedAt: now, source: integration.provider, integrationId, trust, mode });
      if (metrics.trialUsers !== undefined) await ctx.db.insert("stageSnapshots", { saasId, stage: "trial", value: metrics.trialUsers, capturedAt: now, source: integration.provider, integrationId, trust });
      // Daily flows: provider-reported when available, else stock deltas clamped at zero (churn never yields negative conversions).
      const yesterday = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId).lt("day", day)).order("desc").first();
      const base = yesterday?.convertedUsers ?? prevConverted ?? converted;
      const newConverted = metrics.newConverted24h ?? Math.max(0, converted - base);
      const trialBase = yesterday?.trialUsers ?? saas.trialUsers ?? metrics.trialUsers ?? 0;
      const newTrials = metrics.trialUsers === undefined ? undefined : metrics.newTrials7d !== undefined ? Math.max(0, Math.round(metrics.newTrials7d / 7)) : Math.max(0, metrics.trialUsers - trialBase);
      await upsertDaily(ctx, saasId, day, { convertedUsers: converted, newConverted, trialUsers: metrics.trialUsers, newTrials, payingUsers: undefined, mrr: undefined });
      const rows = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId).gte("day", dayKey(now - 30 * DAY))).collect();
      const flow = (days: number, pick: (r: Doc<"dailyMetrics">) => number | undefined) => rows.filter((r) => r.day > dayKey(now - days * DAY)).reduce((a, r) => a + (pick(r) ?? 0), 0);
      const c30 = await stageSnapshotAt(ctx, saasId, "converted", now - 30 * DAY);
      const next = {
        convertedUsers: converted,
        trialUsers: metrics.trialUsers,
        newTrials7d: metrics.newTrials7d ?? (metrics.trialUsers === undefined ? undefined : flow(7, (r) => r.newTrials)),
        newTrials30d: metrics.newTrials30d ?? (metrics.trialUsers === undefined ? undefined : flow(30, (r) => r.newTrials)),
        newConverted24h: newConverted,
        newConverted7d: metrics.newConverted7d ?? flow(7, (r) => r.newConverted),
        newConverted30d: metrics.newConverted30d ?? flow(30, (r) => r.newConverted),
        convertedPrev30d: c30?.value,
        convertedGrowth30dPct: c30 && c30.value > 0 ? Math.round(((converted - c30.value) / c30.value) * 1000) / 10 : undefined,
        conversionMode: mode,
        payingUsers: undefined,
        mrr: undefined,
        currency: undefined,
      };
      await ctx.db.patch(saasId, { ...next, ...stageRates({ ...saas, ...next }) });
      if (!saas.isDemo && prevConverted !== null) await addMilestones(ctx, saasId, thresholdMilestones(prevConverted, converted, saas.name, "converted"));
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
    await ctx.db.insert("syncRuns", { saasId: integration.saasId, integrationId, role: normalizeRole(integration.role), provider: integration.provider, startedAt, finishedAt: now, durationMs: now - startedAt, attempt, status: "error", error });
    await ctx.db.patch(integrationId, { status: "error", lastError: error, lastSyncAt: now, lastFailureAt: now, consecutiveFailures: failures });
    // ~1 day of failed users syncs demotes the SaaS to pending so stale numbers aren't ranked.
    if (normalizeRole(integration.role) === "users" && failures >= 6) await ctx.db.patch(integration.saasId, { trust: "pending" });
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
  args: { integrationId: v.id("integrations"), role: integrationRole, history: historyValidator, backfillId: v.optional(v.id("backfills")) },
  handler: async (ctx, { integrationId, role: rawRole, history, backfillId }) => {
    const role = normalizeRole(rawRole);
    const integration = await ctx.db.get(integrationId);
    if (!integration) return;
    const saas = await ctx.db.get(integration.saasId);
    if (!saas) return;
    const { saasId } = integration;
    const points = [...history.points].sort((a, b) => a.day.localeCompare(b.day));
    let written = 0;
    const done = async () => { if (backfillId) await ctx.db.patch(backfillId, { status: "ok", pointsWritten: written, finishedAt: Date.now() }); };
    if (history.metric === "visitors") {
      for (const p of points) { await upsertDaily(ctx, saasId, p.day, { visitors: p.value }); written++; }
      return done();
    }
    if (history.metric === "convertedUsers" || history.metric === "trialUsers") {
      let prev: number | null = null;
      for (const p of points) {
        const delta = prev === null ? 0 : Math.max(0, p.value - prev);
        await upsertDaily(ctx, saasId, p.day, history.metric === "convertedUsers" ? { convertedUsers: p.value, newConverted: delta } : { trialUsers: p.value, newTrials: delta });
        prev = p.value;
        written++;
      }
      return done();
    }
    if (history.metric === "activatedUsers" && role === "activation") {
      let prev: number | null = null;
      for (const p of points) {
        await upsertDaily(ctx, saasId, p.day, { activatedUsers: p.value, newActivated: prev === null ? 0 : p.value - prev });
        prev = p.value;
        written++;
      }
      return done();
    }
    if (role !== "users") return done();
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
      // Idempotent: a day that already has a backfilled snapshot is left untouched (history is never rewritten).
      const dup = await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", saasId).eq("capturedAt", at)).first();
      if (!dup) {
        await ctx.db.insert("snapshots", { saasId, totalUsers: t.value, capturedAt: at, source: integration.provider, trust: integration.trust, backfilled: true });
        await upsertDaily(ctx, saasId, t.day, { totalUsers: t.value, newUsers: prev === null ? 0 : t.value - prev });
        written++;
      }
      prev = t.value;
    }
    // Live day's newUsers now has a real baseline.
    const liveRow = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saasId).eq("day", liveDay)).unique();
    if (liveRow && prev !== null && written > 0) await ctx.db.patch(liveRow._id, { newUsers: liveRow.totalUsers - prev });
    if (written > 0) await recomputeDerived(ctx, saasId);
    await done();
  },
});

export { addEvent };

export type { History };
export { providerKind };
