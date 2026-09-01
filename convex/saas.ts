import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getProfileForUser, requireProfile } from "./profiles";
import { slugify, RESERVED } from "../src/lib/slug";

export async function requireOwnedSaas(ctx: QueryCtx | MutationCtx, id: Id<"saas">) {
  const { profile } = await requireProfile(ctx);
  const saas = await ctx.db.get(id);
  if (!saas || saas.ownerId !== profile._id) throw new Error("SaaS not found");
  return { profile, saas };
}

async function uniqueSlug(ctx: MutationCtx, base: string, ignore?: Id<"saas">) {
  const root = slugify(base) || "saas";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`;
    if (RESERVED.has(slug)) continue;
    const hit = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!hit || hit._id === ignore) return slug;
  }
  throw new Error("Could not find a free slug");
}

const editable = {
  name: v.string(),
  description: v.string(),
  websiteUrl: v.string(),
  logoUrl: v.optional(v.string()),
  tags: v.array(v.string()),
};

function normalize(args: { name: string; description: string; websiteUrl: string; tags: string[]; logoUrl?: string }) {
  const name = args.name.trim();
  if (name.length < 2) throw new Error("Name is too short");
  if (!/^https?:\/\//.test(args.websiteUrl.trim())) throw new Error("Website must start with https://");
  return {
    name,
    description: args.description.trim().slice(0, 160),
    websiteUrl: args.websiteUrl.trim(),
    logoUrl: args.logoUrl?.trim() || undefined,
    tags: [...new Set(args.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 5),
  };
}

export const create = mutation({
  args: editable,
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    const data = normalize(args);
    return ctx.db.insert("saas", {
      ...data,
      ownerId: profile._id,
      slug: await uniqueSlug(ctx, data.name),
      isPublic: false,
      trust: "pending",
      totalUsers: 0,
      newUsers24h: 0,
      newUsers7d: 0,
      newUsers30d: 0,
      growth30dPct: 0,
    });
  },
});

export const update = mutation({
  args: { id: v.id("saas"), ...editable, slug: v.optional(v.string()) },
  handler: async (ctx, { id, slug, ...args }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    const data = normalize(args);
    const patch: Partial<Doc<"saas">> = data;
    if (slug && slugify(slug) !== saas.slug) patch.slug = await uniqueSlug(ctx, slug, id);
    await ctx.db.patch(id, patch);
  },
});

export const setPublic = mutation({
  args: { id: v.id("saas"), isPublic: v.boolean() },
  handler: async (ctx, { id, isPublic }) => {
    await requireOwnedSaas(ctx, id);
    await ctx.db.patch(id, { isPublic });
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
  },
});

export const remove = mutation({
  args: { id: v.id("saas") },
  handler: async (ctx, { id }) => {
    await requireOwnedSaas(ctx, id);
    const rows = [
      ...(await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", id)).collect()),
      ...(await ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", id)).collect()),
      ...(await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", id)).collect()),
      ...(await ctx.db.query("syncRuns").withIndex("by_saas_time", (q) => q.eq("saasId", id)).collect()),
    ];
    for (const r of rows) await ctx.db.delete(r._id);
    await ctx.db.delete(id);
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getProfileForUser(ctx);
    if (!profile) return [];
    return ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", profile._id)).collect();
  },
});

export const getMine = query({
  args: { id: v.id("saas") },
  handler: async (ctx, { id }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    const integration = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", id)).first();
    return {
      ...saas,
      integration: integration && {
        _id: integration._id,
        provider: integration.provider,
        status: integration.status,
        trust: integration.trust,
        lastError: integration.lastError,
        lastSyncAt: integration.lastSyncAt,
      },
    };
  },
});
