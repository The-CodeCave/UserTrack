import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent } from "./auth";
import { isValidHandle } from "../src/lib/slug";

export async function getProfileForUser(ctx: QueryCtx | MutationCtx) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) return { user: null, profile: null };
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  return { user, profile };
}

export async function requireProfile(ctx: QueryCtx | MutationCtx) {
  const { user, profile } = await getProfileForUser(ctx);
  if (!user) throw new Error("Not signed in");
  if (!profile) throw new Error("Profile not created yet");
  return { user, profile };
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const { user, profile } = await getProfileForUser(ctx);
    if (!user) return null;
    return { user: { id: user._id, email: user.email, name: user.name }, profile };
  },
});

export const usernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    if (!isValidHandle(username)) return { ok: false, reason: "invalid" as const };
    const { profile } = await getProfileForUser(ctx);
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (existing && existing._id !== profile?._id) return { ok: false, reason: "taken" as const };
    return { ok: true as const };
  },
});

const handle = (s?: string) => s?.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x\.com|twitter\.com|github\.com|linkedin\.com\/in)\//, "").replace(/\/$/, "") || undefined;

const profileFields = {
  username: v.string(),
  displayName: v.string(),
  avatarUrl: v.optional(v.string()),
  bio: v.optional(v.string()),
  website: v.optional(v.string()),
  x: v.optional(v.string()),
  github: v.optional(v.string()),
  linkedin: v.optional(v.string()),
};

export const upsert = mutation({
  args: profileFields,
  handler: async (ctx, args) => {
    const { user, profile } = await getProfileForUser(ctx);
    if (!user) throw new Error("Not signed in");
    if (!isValidHandle(args.username)) throw new Error("Invalid username");
    if (args.displayName.trim().length < 2) throw new Error("Display name too short");
    if (args.website && !/^https?:\/\//.test(args.website.trim())) throw new Error("Website must start with https://");
    const clash = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
    if (clash && clash._id !== profile?._id) throw new Error("Username already taken");
    const data = { ...args, displayName: args.displayName.trim(), x: handle(args.x), github: handle(args.github), linkedin: handle(args.linkedin), website: args.website?.trim() || undefined };
    if (profile) {
      await ctx.db.patch(profile._id, data);
      return profile._id;
    }
    return ctx.db.insert("profiles", { ...data, userId: user._id, onboardingCompleted: false, digestOptIn: true });
  },
});

export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx);
    await ctx.db.patch(profile._id, { onboardingCompleted: true });
  },
});

export const setDigestOptIn = mutation({
  args: { optIn: v.boolean() },
  handler: async (ctx, { optIn }) => {
    const { profile } = await requireProfile(ctx);
    await ctx.db.patch(profile._id, { digestOptIn: optIn });
  },
});

export const previewDigest = mutation({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx);
    await ctx.scheduler.runAfter(0, internal.digest.generateMine, { profileId: profile._id });
  },
});
