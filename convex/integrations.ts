import { v } from "convex/values";
import { internalQuery, mutation } from "./_generated/server";
import { requireOwnedSaas } from "./saas";
import { connectIntegration, requestSync } from "./domain/integrations";
import { integrationRole, providerKind } from "./schema";

// One integration per SaaS per role. Replacing it keeps historical snapshots (provenance lives on each snapshot).
export const connect = mutation({
  args: { saasId: v.id("saas"), role: v.optional(integrationRole), provider: providerKind, config: v.any() },
  handler: async (ctx, { saasId, role = "users", provider, config }) => {
    const { saas } = await requireOwnedSaas(ctx, saasId);
    return connectIntegration(ctx, saas, role, provider, config);
  },
});

export const syncNow = mutation({
  args: { saasId: v.id("saas"), role: v.optional(integrationRole) },
  handler: async (ctx, { saasId, role }) => {
    await requireOwnedSaas(ctx, saasId);
    await requestSync(ctx, saasId, role);
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
