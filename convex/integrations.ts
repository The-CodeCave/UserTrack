import { v } from "convex/values";
import { internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOwnedSaas } from "./saas";
import { getProvider } from "./providers";
import { integrationRole, providerKind } from "./schema";
import { dayKey } from "./lib/time";

const SYNC_COOLDOWN_MS = 60_000;

// One integration per SaaS per role. Replacing it keeps historical snapshots (provenance lives on each snapshot).
export const connect = mutation({
  args: { saasId: v.id("saas"), role: v.optional(integrationRole), provider: providerKind, config: v.any() },
  handler: async (ctx, { saasId, role = "users", provider, config }) => {
    const { saas } = await requireOwnedSaas(ctx, saasId);
    const p = getProvider(provider);
    if (!p.roles.includes(role)) throw new Error(`${p.label} cannot provide ${role} data`);
    const validated = p.validate(config, role);
    if (!validated.ok) throw new Error(validated.error);
    const existing = await ctx.db.query("integrations").withIndex("by_saas_role", (q) => q.eq("saasId", saasId).eq("role", role)).first();
    const legacy = role === "users" && !existing ? await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).filter((q) => q.eq(q.field("role"), undefined)).first() : null;
    const current = existing ?? legacy;
    const now = Date.now();
    const doc = {
      saasId,
      provider,
      role,
      config: validated.config,
      status: "running" as const,
      trust: p.trust(validated.config, saas.websiteUrl),
      lastError: undefined,
      consecutiveFailures: 0,
      connectedAt: now,
      backfilledAt: undefined,
    };
    let id;
    if (current) {
      await ctx.db.patch(current._id, doc);
      id = current._id;
      if (role === "users") {
        const day = dayKey(now);
        const dup = await ctx.db.query("events").withIndex("by_saas_kind_day", (q) => q.eq("saasId", saasId).eq("kind", "reconnect").eq("day", day)).first();
        if (!dup) await ctx.db.insert("events", { saasId, kind: "reconnect", day, at: now, title: "Source reconnected", detail: `Switched to ${p.label}${current.provider !== provider ? ` from ${getProvider(current.provider).label}` : ""}.` });
      }
    } else id = await ctx.db.insert("integrations", doc);
    if (role === "users") await ctx.db.patch(saasId, { trust: "pending" });
    await ctx.scheduler.runAfter(0, internal.sync.runOne, { integrationId: id, attempt: 1 });
    return id;
  },
});

export const syncNow = mutation({
  args: { saasId: v.id("saas"), role: v.optional(integrationRole) },
  handler: async (ctx, { saasId, role }) => {
    await requireOwnedSaas(ctx, saasId);
    const all = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).collect();
    const targets = role ? all.filter((i) => (i.role ?? "users") === role) : all;
    if (!targets.length) throw new Error("No data source connected");
    for (const integration of targets) {
      if (integration.lastSyncAt && Date.now() - integration.lastSyncAt < SYNC_COOLDOWN_MS) throw new Error("Please wait a minute between syncs");
      await ctx.db.patch(integration._id, { status: "running" });
      await ctx.scheduler.runAfter(0, internal.sync.runOne, { integrationId: integration._id, attempt: 1 });
    }
  },
});

export const disconnect = mutation({
  args: { saasId: v.id("saas"), role: v.optional(integrationRole) },
  handler: async (ctx, { saasId, role = "users" }) => {
    await requireOwnedSaas(ctx, saasId);
    const all = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).collect();
    for (const i of all.filter((i) => (i.role ?? "users") === role)) await ctx.db.delete(i._id);
    if (role === "activation") await ctx.db.patch(saasId, { activatedUsers: undefined, activated24h: undefined, activated7d: undefined, activated30d: undefined, activationRatePct: undefined });
    if (role === "traffic") await ctx.db.patch(saasId, { visitors30d: undefined, sessions30d: undefined, visitorsPrev30d: undefined, showTraffic: false });
    if (role === "revenue") await ctx.db.patch(saasId, { payingUsers: undefined, mrr: undefined, showRevenue: false });
  },
});

export const getForSync = internalQuery({
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, { integrationId }) => {
    const integration = await ctx.db.get(integrationId);
    if (!integration) return null;
    const saas = await ctx.db.get(integration.saasId);
    if (!saas) return null;
    return { integration, websiteUrl: saas.websiteUrl };
  },
});

export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("integrations").collect()).map((i) => i._id),
});
