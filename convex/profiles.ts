import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { isValidHandle } from "../src/lib/slug";
import { isValidXHandle, normalizeXHandle } from "../src/lib/social";
import { setPreferences } from "./email/prefs";
import { socialPrefs } from "./schema";
import { requireVerifiedToPublish } from "./domain/projects";

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

// "@name", "name" or an x.com URL → canonical "name". Stored without the @; the UI always displays "@name".
export function canonicalX(raw?: string) {
  const h = normalizeXHandle(raw);
  if (!h) return undefined;
  if (!isValidXHandle(h)) throw new Error("X handle: 1–15 letters, numbers or underscores");
  return h;
}

const profileFields = {
  username: v.string(),
  displayName: v.string(),
  avatarUrl: v.optional(v.string()),
  bio: v.optional(v.string()),
  website: v.optional(v.string()),
  x: v.optional(v.string()),
  github: v.optional(v.string()),
  linkedin: v.optional(v.string()),
  location: v.optional(v.string()),
  profilePublic: v.optional(v.boolean()),
};

export const upsert = mutation({
  args: { ...profileFields, timezone: v.optional(v.string()) },
  handler: async (ctx, { timezone, ...args }) => {
    const { user, profile } = await getProfileForUser(ctx);
    if (!user) throw new Error("Not signed in");
    if (!isValidHandle(args.username)) throw new Error("Invalid username");
    if (args.profilePublic !== false) requireVerifiedToPublish(user);
    if (args.displayName.trim().length < 2) throw new Error("Display name too short");
    if (args.website && !/^https?:\/\//.test(args.website.trim())) throw new Error("Website must start with https://");
    if (args.avatarUrl && !/^https:\/\//.test(args.avatarUrl.trim())) throw new Error("Avatar URL must start with https://");
    const clash = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
    if (clash && clash._id !== profile?._id) throw new Error("Username already taken");
    const data = {
      ...args,
      displayName: args.displayName.trim(),
      x: canonicalX(args.x),
      github: handle(args.github),
      linkedin: handle(args.linkedin),
      website: args.website?.trim() || undefined,
      avatarUrl: args.avatarUrl?.trim() || undefined,
      location: args.location?.trim().slice(0, 60) || undefined,
      bio: args.bio?.trim().slice(0, 160) || undefined,
    };
    if (timezone) await setPreferences(ctx, user._id, { timezone });
    if (profile) {
      await ctx.db.patch(profile._id, data);
      return profile._id;
    }
    return ctx.db.insert("profiles", { ...data, userId: user._id, onboardingCompleted: false });
  },
});

// Social settings page: X handle and preferences only (the rest of the profile has its own form).
export const updateSocial = mutation({
  args: { x: v.optional(v.string()), clearX: v.optional(v.boolean()), socialPrefs: v.optional(socialPrefs) },
  handler: async (ctx, { x, clearX, socialPrefs: prefs }) => {
    const { profile } = await requireProfile(ctx);
    const patch: Partial<typeof profile> = {};
    if (clearX) patch.x = undefined;
    else if (x !== undefined) patch.x = canonicalX(x);
    if (prefs) patch.socialPrefs = { ...profile.socialPrefs, ...prefs, autoShare: { ...profile.socialPrefs?.autoShare, ...prefs.autoShare } };
    await ctx.db.patch(profile._id, patch);
    return patch.x ?? profile.x;
  },
});

export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, profile } = await requireProfile(ctx);
    requireVerifiedToPublish(user);
    await ctx.db.patch(profile._id, { onboardingCompleted: true });
  },
});
