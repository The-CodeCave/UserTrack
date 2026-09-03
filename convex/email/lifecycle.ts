import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { findAuthUser } from "./users";
import { enqueue } from "./send";
import { providerLabel } from "../providers";
import { DAY } from "../lib/time";
import { evaluateNoGrowth, isUnhealthy, NO_GROWTH } from "../lib/emailRules";
import { dispatchEvent } from "../webhooks";

export const REMINDER_DELAY_MS = 24 * 60 * 60_000;

export const scheduleProfileReminder = async (ctx: MutationCtx, userId: string) => {
  await ctx.scheduler.runAfter(REMINDER_DELAY_MS, internal.email.lifecycle.profileReminder, { userId });
};

// 24h after signup: no profile, or profile without completed onboarding → one reminder, ever.
export const profileReminder = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const user = await findAuthUser(ctx, userId);
    if (!user) return;
    const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if (profile?.onboardingCompleted) return;
    await enqueue(ctx, { userId, type: "profile-reminder", dedupeKey: `profile-reminder:${userId}`, data: { name: user.name || "there" } });
  },
});

export const scheduleMissingSourceReminder = async (ctx: MutationCtx, saasId: Id<"saas">) => {
  await ctx.scheduler.runAfter(REMINDER_DELAY_MS, internal.email.lifecycle.missingSourceReminder, { saasId });
};

// 24h after a SaaS is created without a working users source.
export const missingSourceReminder = internalMutation({
  args: { saasId: v.id("saas") },
  handler: async (ctx, { saasId }) => {
    const saas = await ctx.db.get(saasId);
    if (!saas || saas.isDemo) return;
    const integrations = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).collect();
    const users = integrations.find((i) => (i.role ?? "users") === "users");
    if (users?.lastSuccessAt) return;
    const owner = await ctx.db.get(saas.ownerId);
    if (!owner) return;
    await enqueue(ctx, { userId: owner.userId, type: "missing-source", dedupeKey: `missing-source:${saasId}`, saasId, data: { name: owner.displayName, saasName: saas.name, saasId } });
  },
});

// Called from sync.recordSuccess for the users role.
export async function onSourceSuccess(ctx: MutationCtx, integration: Doc<"integrations">, saas: Doc<"saas">, totalUsers: number | undefined, firstEver: boolean) {
  const owner = await ctx.db.get(saas.ownerId);
  if (!owner || saas.isDemo) return;
  const provider = providerLabel(integration.provider, integration.config);
  if (integration.healthState === "unhealthy") {
    const since = integration.unhealthySince ?? Date.now();
    await ctx.db.patch(integration._id, { healthState: "healthy", unhealthySince: undefined });
    await enqueue(ctx, { userId: owner.userId, type: "source-recovered", dedupeKey: `source-recovered:${integration._id}:${since}`, saasId: saas._id, data: { saasName: saas.name, saasId: saas._id, provider, totalUsers, downForMs: Date.now() - since } });
    await dispatchEvent(ctx, { type: "integration.recovered", key: `${integration._id}:${since}`, saas, data: { integration: { id: integration._id, role: integration.role ?? "users", provider: integration.provider, label: provider, unhealthySince: new Date(since).toISOString(), downForMs: Date.now() - since } } });
  } else if (!integration.healthState) await ctx.db.patch(integration._id, { healthState: "healthy" });
  // Manual numbers are typed in, not synced — no "connected" confirmation for them.
  if (firstEver && integration.provider !== "manual") {
    await enqueue(ctx, { userId: owner.userId, type: "source-connected", dedupeKey: `source-connected:${saas._id}`, saasId: saas._id, data: { saasName: saas.name, slug: saas.slug, saasId: saas._id, totalUsers, trust: integration.trust, provider, isPublic: saas.isPublic } });
  }
}

// Called from sync.recordFailure. Enters "unhealthy" once per episode and emails exactly then.
export async function onSourceFailure(ctx: MutationCtx, integration: Doc<"integrations">, failures: number, error: string) {
  if ((integration.role ?? "users") !== "users" || integration.healthState === "unhealthy") return;
  const now = Date.now();
  if (!isUnhealthy({ consecutiveFailures: failures, lastSuccessAt: integration.lastSuccessAt, connectedAt: integration.connectedAt ?? integration._creationTime, now })) return;
  const saas = await ctx.db.get(integration.saasId);
  if (!saas || saas.isDemo) return;
  const owner = await ctx.db.get(saas.ownerId);
  if (!owner) return;
  await ctx.db.patch(integration._id, { healthState: "unhealthy", unhealthySince: now });
  await enqueue(ctx, { userId: owner.userId, type: "source-failed", dedupeKey: `source-failed:${integration._id}:${now}`, saasId: saas._id, data: { saasName: saas.name, saasId: saas._id, provider: providerLabel(integration.provider, integration.config), error, lastSuccessAt: integration.lastSuccessAt, failures } });
  await dispatchEvent(ctx, { type: "integration.failed", key: `${integration._id}:${now}`, saas, at: now, data: { integration: { id: integration._id, role: integration.role ?? "users", provider: integration.provider, label: providerLabel(integration.provider, integration.config), error, consecutiveFailures: failures, lastSuccessAt: integration.lastSuccessAt ? new Date(integration.lastSuccessAt).toISOString() : undefined } } });
}

// Daily: products with traction that went quiet for a week while the source stayed healthy.
export const noGrowthSweep = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("saas").withIndex("by_public_new30d", (q) => q.eq("isPublic", true)).paginate({ cursor: cursor ?? null, numItems: 100 });
    const since = new Date(Date.now() - 40 * DAY).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    for (const s of page.page) {
      if (s.isDemo || s.newUsers7d !== 0 || s.totalUsers < NO_GROWTH.minTotalUsers) continue;
      const users = (await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", s._id)).collect()).find((i) => (i.role ?? "users") === "users");
      const healthy = Boolean(users && users.status === "ok" && users.healthState !== "unhealthy");
      const rows = (await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", s._id).gte("day", since).lt("day", today)).collect()).map((r) => ({ day: r.day, newUsers: r.newUsers }));
      const quiet = evaluateNoGrowth({ totalUsers: s.totalUsers, newUsers7d: s.newUsers7d, newUsers30d: s.newUsers30d, sourceHealthy: healthy, isPublic: s.isPublic, daily: rows });
      if (!quiet) continue;
      const owner = await ctx.db.get(s.ownerId);
      if (!owner) continue;
      await enqueue(ctx, { userId: owner.userId, type: "no-growth", dedupeKey: `no-growth:${s._id}:${quiet.periodStart}`, saasId: s._id, data: { saasName: s.name, slug: s.slug, saasId: s._id, totalUsers: s.totalUsers, newUsers30d: s.newUsers30d, days: NO_GROWTH.days } });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.email.lifecycle.noGrowthSweep, { cursor: page.continueCursor });
  },
});
