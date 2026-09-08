import { v } from "convex/values";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getProfileForUser, requireProfile } from "./profiles";
import { createProject, removeSaas, requireVerifiedToPublish, updateProject } from "./domain/projects";
import { integrationView } from "./domain/integrations";
import { markLaunched } from "./domain/events";
import { MIN_SAMPLE } from "./lib/benchmarks";
import { benchmarkCards, benchmarkHistoryFor, isBenchmarkEligible } from "./domain/benchmarks";
import { publicTrustLabel } from "./lib/trust";
import { FUNNEL_TIMEFRAMES, OWNER_FUNNEL, funnelFor, funnelHistoryFor } from "./domain/funnel";
import { VISIBILITY_KEYS, visibilityOf } from "./domain/visibility";
import { storedImageUrl } from "./lib/uploads";
import { cofounder, funding, projectType, teamSize, visibility } from "./schema";

export async function requireOwnedSaas(ctx: QueryCtx | MutationCtx, id: Id<"saas">) {
  const { user, profile } = await requireProfile(ctx);
  const saas = await ctx.db.get(id);
  if (!saas || saas.ownerId !== profile._id) throw new Error("SaaS not found");
  return { user, profile, saas };
}

// Ownership check callable from actions (auth identity propagates through ctx.runQuery).
export const ownedForAction = internalQuery({
  args: { id: v.id("saas") },
  handler: async (ctx, { id }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    return { _id: saas._id, websiteUrl: saas.websiteUrl, totalUsers: saas.totalUsers };
  },
});

const editable = {
  name: v.string(),
  description: v.string(),
  websiteUrl: v.string(),
  logoUrl: v.optional(v.string()),
  category: v.optional(v.string()),
  tags: v.array(v.string()),
  projectType: v.optional(projectType),
  appStoreUrl: v.optional(v.string()),
  playStoreUrl: v.optional(v.string()),
  authMethods: v.optional(v.array(v.string())),
  foundedAt: v.optional(v.number()),
  markets: v.optional(v.array(v.string())),
  techStack: v.optional(v.array(v.string())),
  marketingChannels: v.optional(v.array(v.string())),
  cofounders: v.optional(v.array(cofounder)),
  country: v.optional(v.string()),
  funding: v.optional(funding),
  teamSize: v.optional(teamSize),
  valueProposition: v.optional(v.string()),
  problemSolved: v.optional(v.string()),
  audience: v.optional(v.string()),
  pricingSummary: v.optional(v.string()),
  additionalInfo: v.optional(v.string()),
  anonymous: v.optional(v.boolean()),
  hideFromSearch: v.optional(v.boolean()),
  trustmrrSlug: v.optional(v.string()),
  // Uploaded logo (generateLogoUploadUrl); wins over logoUrl when set.
  logoStorageId: v.optional(v.id("_storage")),
};

// Short-lived URL for a direct browser → Convex storage POST (docs/PROFILES.md → Logo upload).
export const generateLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

async function uploadedLogo(ctx: MutationCtx, storageId: Id<"_storage">, previous?: Id<"_storage">) {
  const { url, storageId: id } = await storedImageUrl(ctx, storageId, "Logo", previous);
  return { logoUrl: url, logoStorageId: id };
}

export const create = mutation({
  args: editable,
  handler: async (ctx, { logoStorageId, ...args }) => {
    const { profile } = await requireProfile(ctx);
    const logo = logoStorageId ? await uploadedLogo(ctx, logoStorageId) : null;
    const id = await createProject(ctx, profile._id, { ...args, logoUrl: logo?.logoUrl ?? args.logoUrl });
    if (logo) await ctx.db.patch(id, { logoStorageId: logo.logoStorageId });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("saas"), ...editable, slug: v.optional(v.string()) },
  handler: async (ctx, { id, slug, logoStorageId, ...args }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    const logo = logoStorageId ? await uploadedLogo(ctx, logoStorageId, saas.logoStorageId) : null;
    await updateProject(ctx, saas, { ...args, logoUrl: logo?.logoUrl ?? args.logoUrl, slug });
    // A pasted URL (or a cleared logo) replaces the uploaded file, which is dropped from storage.
    if (logo) await ctx.db.patch(id, { logoStorageId: logo.logoStorageId });
    else if (saas.logoStorageId && args.logoUrl !== saas.logoUrl) { await ctx.storage.delete(saas.logoStorageId); await ctx.db.patch(id, { logoStorageId: undefined }); }
  },
});

export const setPublic = mutation({
  args: { id: v.id("saas"), isPublic: v.boolean() },
  handler: async (ctx, { id, isPublic }) => {
    const { user, saas } = await requireOwnedSaas(ctx, id);
    if (isPublic && !saas.isPublic) requireVerifiedToPublish(user);
    await ctx.db.patch(id, { isPublic });
    if (isPublic) await markLaunched(ctx, saas);
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
  },
});

// Per-metric public visibility (connection ≠ publication). Legacy showTraffic/showRevenue map onto the same keys.
export const setVisibility = mutation({
  args: { id: v.id("saas"), visibility },
  handler: async (ctx, { id, visibility: patch }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    const current = visibilityOf(saas);
    const next = { ...current };
    for (const k of VISIBILITY_KEYS) if (patch[k] !== undefined) next[k] = patch[k]!;
    // Publishing a rate without a count is fine; publishing a count implies the rate.
    if (next.convertedCount) next.conversionRate = true;
    await ctx.db.patch(id, { visibility: next, showTraffic: undefined, showRevenue: undefined });
  },
});

export const remove = mutation({
  args: { id: v.id("saas") },
  handler: async (ctx, { id }) => {
    await requireOwnedSaas(ctx, id);
    await removeSaas(ctx, id);
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
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
    const integrations = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", id)).collect();
    const flags = await ctx.db.query("fraudFlags").withIndex("by_saas_open", (q) => q.eq("saasId", id).eq("resolvedAt", undefined)).collect();
    const milestones = await ctx.db.query("milestones").withIndex("by_saas_time", (q) => q.eq("saasId", id)).order("desc").take(12);
    const runs = await ctx.db.query("syncRuns").withIndex("by_saas_time", (q) => q.eq("saasId", id)).order("desc").take(10);
    const embedSites = await ctx.db.query("embedSites").withIndex("by_saas_last", (q) => q.eq("saasId", id)).order("desc").take(20);
    return {
      ...saas,
      embedSites: embedSites.map((e) => ({ host: e.host, loads: e.loads, badgeLoads: e.badgeLoads, firstSeenAt: e.firstSeenAt, lastSeenAt: e.lastSeenAt })),
      trustLabel: publicTrustLabel(saas.trust, saas.trustState, saas.trustScore),
      visibility: visibilityOf(saas),
      integrations: integrations.map((i) => ({ _id: i._id, ...integrationView(i) })),
      // Neutral wording only; the owner sees that something is being reviewed, not an accusation.
      review: flags.length ? { count: flags.length, kinds: flags.map((f) => f.kind) } : null,
      milestones: milestones.map((m) => ({ _id: m._id, key: m.key, kind: m.kind, title: m.title, copy: m.copy, value: m.value, achievedAt: m.achievedAt })),
      runs: runs.map((r) => ({ _id: r._id, role: r.role ?? "users", provider: r.provider, status: r.status, startedAt: r.startedAt, durationMs: r.durationMs, error: r.error, attempt: r.attempt })),
    };
  },
});

// Percentile cards for the owner's dashboard (domain/benchmarks.ts). Cohorts below MIN_SAMPLE simply do not exist.
export const benchmarks = query({
  args: { id: v.id("saas") },
  handler: async (ctx, { id }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    const cards = await benchmarkCards(ctx, saas);
    return { eligible: isBenchmarkEligible(saas), minSample: MIN_SAMPLE, cards, history: await benchmarkHistoryFor(ctx, saas, 26) };
  },
});

// Owner funnel: all connected stages, including private traffic/conversion.
export const funnel = query({
  args: { id: v.id("saas"), timeframe: v.optional(v.union(...FUNNEL_TIMEFRAMES.map((t) => v.literal(t)))) },
  handler: async (ctx, { id, timeframe }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    return funnelFor(ctx, saas, timeframe ?? "30d", OWNER_FUNNEL);
  },
});

export const funnelHistory = query({
  args: { id: v.id("saas"), days: v.optional(v.number()) },
  handler: async (ctx, { id, days }) => {
    const { saas } = await requireOwnedSaas(ctx, id);
    return funnelHistoryFor(ctx, saas, Math.min(365, Math.max(14, days ?? 90)), OWNER_FUNNEL);
  },
});
