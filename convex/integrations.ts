import { v } from "convex/values";
import { internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOwnedSaas } from "./saas";
import { getProvider } from "./providers";
import { providerKind } from "./schema";

const SYNC_COOLDOWN_MS = 60_000;

// One integration per SaaS. Replacing it keeps historical snapshots (provenance lives on each snapshot).
export const connect = mutation({
  args: { saasId: v.id("saas"), provider: providerKind, config: v.any() },
  handler: async (ctx, { saasId, provider, config }) => {
    const { saas } = await requireOwnedSaas(ctx, saasId);
    const p = getProvider(provider);
    const validated = p.validate(config);
    if (!validated.ok) throw new Error(validated.error);
    const existing = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).first();
    const doc = {
      saasId,
      provider,
      config: validated.config,
      status: "running" as const,
      trust: p.trust(validated.config, saas.websiteUrl),
      lastError: undefined,
    };
    const id = existing ? (await ctx.db.patch(existing._id, doc), existing._id) : await ctx.db.insert("integrations", doc);
    await ctx.db.patch(saasId, { trust: "pending" });
    await ctx.scheduler.runAfter(0, internal.sync.runOne, { integrationId: id });
    return id;
  },
});

export const syncNow = mutation({
  args: { saasId: v.id("saas") },
  handler: async (ctx, { saasId }) => {
    await requireOwnedSaas(ctx, saasId);
    const integration = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).first();
    if (!integration) throw new Error("No data source connected");
    if (integration.lastSyncAt && Date.now() - integration.lastSyncAt < SYNC_COOLDOWN_MS) throw new Error("Please wait a minute between syncs");
    await ctx.db.patch(integration._id, { status: "running" });
    await ctx.scheduler.runAfter(0, internal.sync.runOne, { integrationId: integration._id });
  },
});

export const disconnect = mutation({
  args: { saasId: v.id("saas") },
  handler: async (ctx, { saasId }) => {
    await requireOwnedSaas(ctx, saasId);
    const integration = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).first();
    if (integration) await ctx.db.delete(integration._id);
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
