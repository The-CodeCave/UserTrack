// Self-service GDPR: export (Art. 20) and hard deletion (Art. 17) of the signed-in account.
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getProfileForUser } from "./profiles";
import { drain, listOwnedProjects, projectSummary, removeProjectRows } from "./domain/projects";
import { integrationView, listIntegrations } from "./domain/integrations";
import { listEndpoints } from "./webhooks";
import { getPreferences } from "./email/prefs";
import { deleteAuthUser } from "./email/users";
import { maskToken } from "./lib/tokens";
import { revokeXToken } from "./social";

export const EXPORT_FORMAT = "usertrack-account-export/1";
// Rows deleted per scheduler step; well under the Convex per-transaction limits even with the parent deletes on top.
export const PURGE_BUDGET = 400;

type AuthUser = { _id: string; email: string; name?: string; emailVerified?: boolean; createdAt?: number };

// ---- Export ----------------------------------------------------------------------------------------------------------

// Everything stored about one account, without a single secret: integrations through publicConfig, webhook secrets
// and developer tokens masked, X tokens omitted. Shared by /api/account/export and the MCP tool.
export async function buildExport(ctx: QueryCtx | MutationCtx, user: AuthUser, profile: Doc<"profiles"> | null) {
  const projects = profile ? await listOwnedProjects(ctx, profile._id) : [];
  const tokens = profile ? await ctx.db.query("developerTokens").withIndex("by_profile", (q) => q.eq("profileId", profile._id)).collect() : [];
  const follows = profile ? await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", profile._id)).collect() : [];
  const x = profile ? await ctx.db.query("socialConnections").withIndex("by_profile_provider", (q) => q.eq("profileId", profile._id).eq("provider", "x")).unique() : null;
  const iso = (t?: number) => (t === undefined ? undefined : new Date(t).toISOString());
  return {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    account: { id: user._id, email: user.email, name: user.name, emailVerified: user.emailVerified ?? false, createdAt: iso(user.createdAt) },
    profile: profile
      ? { username: profile.username, displayName: profile.displayName, avatarUrl: profile.avatarUrl, bio: profile.bio, website: profile.website, x: profile.x, github: profile.github, linkedin: profile.linkedin, location: profile.location, profilePublic: profile.profilePublic ?? true, onboardingCompleted: profile.onboardingCompleted, digestOptIn: profile.digestOptIn, socialPrefs: profile.socialPrefs, followerCount: profile.followerCount ?? 0, createdAt: iso(profile._creationTime) }
      : null,
    projects: await Promise.all(
      projects.map(async (s) => ({
        ...projectSummary(s),
        visibility: s.visibility,
        foundedAt: iso(s.foundedAt),
        launchedAt: iso(s.launchedAt),
        verifiedAt: iso(s.verifiedAt),
        integrations: (await listIntegrations(ctx, s._id)).map(integrationView),
        milestones: (await ctx.db.query("milestones").withIndex("by_saas_time", (q) => q.eq("saasId", s._id)).collect()).map((m) => ({ key: m.key, kind: m.kind, metric: m.metric, value: m.value, title: m.title, copy: m.copy, achievedAt: iso(m.achievedAt) })),
      })),
    ),
    follows: await Promise.all(
      follows.map(async (f) => {
        const target = f.targetType === "saas" ? await ctx.db.get(f.targetId as Id<"saas">) : await ctx.db.get(f.targetId as Id<"profiles">);
        return { type: f.targetType, target: target ? ("slug" in target ? target.slug : target.username) : undefined, since: iso(f._creationTime) };
      }),
    ),
    webhookEndpoints: profile ? await listEndpoints(ctx, profile._id) : [],
    developerTokens: tokens.map((t) => ({ id: t._id, type: t.type, name: t.name, token: maskToken(t.prefix), scopes: t.scopes, createdAt: iso(t.createdAt), lastUsedAt: iso(t.lastUsedAt), revokedAt: iso(t.revokedAt), expiresAt: iso(t.expiresAt) })),
    emailPreferences: await getPreferences(ctx, user._id),
    socialConnections: x ? [{ provider: x.provider, handle: x.handle, providerUserId: x.providerUserId, status: x.status, connectedAt: iso(x.connectedAt), lastPostAt: iso(x.lastPostAt) }] : [],
  };
}

export const exportAccount = query({
  args: {},
  handler: async (ctx) => {
    const { user, profile } = await getProfileForUser(ctx);
    if (!user) return null;
    return buildExport(ctx, user, profile);
  },
});

// ---- Deletion --------------------------------------------------------------------------------------------------------

// First transaction: public pages and credentials die now and the paged purge is scheduled. Nothing here depends on
// the auth call succeeding later.
export async function startDeletion(ctx: MutationCtx, user: AuthUser, profile: Doc<"profiles"> | null) {
  const now = Date.now();
  if (profile) {
    await ctx.db.patch(profile._id, { profilePublic: false });
    for (const s of await listOwnedProjects(ctx, profile._id)) if (s.isPublic && !s.isDemo) await ctx.db.patch(s._id, { isPublic: false });
    for (const t of await ctx.db.query("developerTokens").withIndex("by_profile", (q) => q.eq("profileId", profile._id)).collect()) if (t.revokedAt === undefined) await ctx.db.patch(t._id, { revokedAt: now });
    for (const w of await ctx.db.query("webhookEndpoints").withIndex("by_profile", (q) => q.eq("profileId", profile._id)).collect()) if (w.status === "active") await ctx.db.patch(w._id, { status: "disabled", disabledReason: "account deleted", updatedAt: now });
  }
  await ctx.scheduler.runAfter(0, internal.account.purge, { userId: user._id, email: user.email, name: user.name, profileId: profile?._id });
  await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
}

export const deleteAccount = mutation({
  args: { confirm: v.literal("DELETE") },
  handler: async (ctx) => {
    const { user, profile } = await getProfileForUser(ctx);
    if (!user) throw new Error("Not signed in");
    await startDeletion(ctx, user, profile);
  },
});

const purgeArgs = { userId: v.string(), email: v.string(), name: v.optional(v.string()), profileId: v.optional(v.id("profiles")) };

export const xConnection = internalQuery({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    const c = await ctx.db.query("socialConnections").withIndex("by_profile_provider", (q) => q.eq("profileId", profileId).eq("provider", "x")).unique();
    return c ? { accessToken: c.accessToken } : null;
  },
});

// Sends the confirmation while the address still exists, revokes the X token best-effort (both need fetch), then
// hands over to the paged purge, which also removes the mail's own log row.
export const purge = internalAction({
  args: purgeArgs,
  handler: async (ctx, args): Promise<void> => {
    await ctx.runAction(internal.email.send.deliverTransactional, { userId: args.userId, to: args.email, type: "account-deleted", data: { name: args.name || "there" }, dedupeKey: `account-deleted:${args.userId}:${Date.now()}` });
    if (args.profileId) {
      const c = await ctx.runQuery(internal.account.xConnection, { profileId: args.profileId });
      if (c) await revokeXToken(c.accessToken);
    }
    await ctx.runMutation(internal.account.purgeStep, args);
  },
});

async function removeProfileRows(ctx: MutationCtx, profileId: Id<"profiles">, budget: number) {
  let n = 0;
  for (const f of await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", profileId)).take(budget)) {
    const target = f.targetType === "saas" ? await ctx.db.get(f.targetId as Id<"saas">) : await ctx.db.get(f.targetId as Id<"profiles">);
    if (target) await ctx.db.patch(target._id, { followerCount: Math.max(0, (target.followerCount ?? 0) - 1) });
    await ctx.db.delete(f._id);
    n++;
  }
  if (n >= budget) return n;
  for (const ep of await ctx.db.query("webhookEndpoints").withIndex("by_profile", (q) => q.eq("profileId", profileId)).collect()) {
    n += await drain(ctx, budget - n, ctx.db.query("webhookDeliveries").withIndex("by_endpoint_time", (q) => q.eq("endpointId", ep._id)));
    if (n >= budget) return n;
    await ctx.db.delete(ep._id);
    n++;
  }
  for (const t of await ctx.db.query("developerTokens").withIndex("by_profile", (q) => q.eq("profileId", profileId)).collect()) {
    n += await drain(ctx, budget - n, ctx.db.query("apiUsage").withIndex("by_token_day", (q) => q.eq("tokenId", t._id)));
    if (n >= budget) return n;
    n += await drain(ctx, budget - n, ctx.db.query("auditLogs").withIndex("by_token_time", (q) => q.eq("tokenId", t._id)));
    if (n >= budget) return n;
    await ctx.db.delete(t._id);
    n++;
  }
  const rest = [
    ctx.db.query("follows").withIndex("by_target", (q) => q.eq("targetType", "profile").eq("targetId", profileId)),
    ctx.db.query("webhookDeliveries").withIndex("by_profile_time", (q) => q.eq("profileId", profileId)),
    ctx.db.query("auditLogs").withIndex("by_profile_time", (q) => q.eq("profileId", profileId)),
    ctx.db.query("shareEvents").withIndex("by_profile_time", (q) => q.eq("profileId", profileId)),
    ctx.db.query("socialPosts").withIndex("by_profile_time", (q) => q.eq("profileId", profileId)),
    ctx.db.query("socialConnections").withIndex("by_profile_provider", (q) => q.eq("profileId", profileId)),
    // Tiny table with a 10-minute TTL and no profile index: a filter scan is fine.
    ctx.db.query("oauthStates").filter((q) => q.eq(q.field("profileId"), profileId)),
    ctx.db.query("digests").withIndex("by_profile_week", (q) => q.eq("profileId", profileId)),
    ctx.db.query("monthlyReports").withIndex("by_profile_period", (q) => q.eq("profileId", profileId)),
  ];
  for (const q of rest) {
    n += await drain(ctx, budget - n, q);
    if (n >= budget) return n;
  }
  return n;
}

async function removeUserRows(ctx: MutationCtx, userId: string, email: string, budget: number) {
  let n = 0;
  for (const q of [
    ctx.db.query("emailPreferences").withIndex("by_userId", (q) => q.eq("userId", userId)),
    ctx.db.query("emailEvents").withIndex("by_user_time", (q) => q.eq("userId", userId)),
    ctx.db.query("emailRecipients").withIndex("by_email", (q) => q.eq("email", email)),
  ]) {
    n += await drain(ctx, budget - n, q);
    if (n >= budget) return n;
  }
  return n;
}

// One bounded transaction per step; reschedules itself until every table is clean, then removes the profile and the
// Better Auth user. Re-running a step is harmless, so a crash mid-way only delays completion.
export const purgeStep = internalMutation({
  args: purgeArgs,
  handler: async (ctx, args): Promise<void> => {
    const { userId, email, profileId } = args;
    const again = async (): Promise<void> => { await ctx.scheduler.runAfter(0, internal.account.purgeStep, args); };
    let left = PURGE_BUDGET;
    if (profileId) {
      for (const s of await listOwnedProjects(ctx, profileId)) {
        if (s.isDemo) continue;
        left -= await removeProjectRows(ctx, s._id, left);
        if (left <= 0) return again();
        await ctx.db.delete(s._id);
      }
      left -= await removeProfileRows(ctx, profileId, left);
      if (left <= 0) return again();
    }
    left -= await removeUserRows(ctx, userId, email, left);
    if (left <= 0) return again();
    if (profileId && (await ctx.db.get(profileId))) await ctx.db.delete(profileId);
    await deleteAuthUser(ctx, userId, email);
    await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
  },
});
