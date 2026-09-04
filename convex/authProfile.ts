// Profile import from a GitHub / X sign-in: handle + avatar fill empty profile fields, never overwrite what the founder set.
import { v } from "convex/values";
import { internalAction, internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { fetchProviderHandle, type ProviderHandle } from "./lib/authProviders";

const prefillFields = { github: v.optional(v.string()), x: v.optional(v.string()), avatarUrl: v.optional(v.string()), xFollowers: v.optional(v.number()) };

// Entries of `info` that are set and still empty on `current`.
export const fillEmpty = (current: ProviderHandle, info: ProviderHandle): ProviderHandle =>
  Object.fromEntries(Object.entries(info).filter(([k, value]) => k !== "xFollowers" && value && !current[k as keyof ProviderHandle]));

// Followers are a live number, not a field the founder typed: every fresh read replaces the stored one.
export const followerPatch = (info: ProviderHandle, now = Date.now()) => (info.xFollowers === undefined ? {} : { xFollowers: info.xFollowers, xFollowersAt: now });

const pendingFor = (ctx: QueryCtx | MutationCtx, userId: string) => ctx.db.query("profilePrefills").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();

export async function prefillFor(ctx: QueryCtx | MutationCtx, userId: string): Promise<ProviderHandle | null> {
  const p = await pendingFor(ctx, userId);
  return p ? { github: p.github, x: p.x, avatarUrl: p.avatarUrl, xFollowers: p.xFollowers } : null;
}

// Consumed exactly once, when the profile is created.
export async function takePrefill(ctx: MutationCtx, userId: string): Promise<ProviderHandle> {
  const p = await pendingFor(ctx, userId);
  if (!p) return {};
  await ctx.db.delete(p._id);
  return { github: p.github, x: p.x, avatarUrl: p.avatarUrl, xFollowers: p.xFollowers };
}

// Scheduled by the account.onCreate trigger; the provider token is read back through the component adapter, not passed around.
export const importProviderProfile = internalAction({
  args: { userId: v.string(), providerId: v.union(v.literal("github"), v.literal("twitter")) },
  handler: async (ctx, { userId, providerId }) => {
    const account = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [{ field: "userId", operator: "eq", value: userId }, { field: "providerId", operator: "eq", value: providerId }],
    })) as { accessToken?: string | null } | null;
    if (!account?.accessToken) return;
    const info = await fetchProviderHandle(providerId, account.accessToken).catch(() => null);
    if (info) await ctx.runMutation(internal.authProfile.applyProviderProfile, { userId, ...info });
  },
});

export const applyProviderProfile = internalMutation({
  args: { userId: v.string(), ...prefillFields },
  handler: async (ctx, { userId, ...info }) => {
    const profile = await ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if (profile) {
      await ctx.db.patch(profile._id, { ...fillEmpty(profile, info), ...followerPatch(info) });
      return;
    }
    const pending = await pendingFor(ctx, userId);
    if (pending) await ctx.db.patch(pending._id, { ...fillEmpty(pending, info), xFollowers: info.xFollowers ?? pending.xFollowers });
    else await ctx.db.insert("profilePrefills", { userId, ...info });
  },
});
