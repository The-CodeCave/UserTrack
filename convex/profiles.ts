import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { isValidHandle, slugify } from "../src/lib/slug";
import { isValidXHandle, normalizeXHandle } from "../src/lib/social";
import { sanitizeAttribution } from "../src/lib/attribution";
import { setPreferences } from "./email/prefs";
import { socialPrefs } from "./schema";
import { requireVerifiedToPublish } from "./domain/projects";
import { isHandleConfirmed } from "./domain/visibility";
import { storedImageUrl } from "./lib/uploads";
import { fillEmpty, followerPatch, prefillFor, takePrefill } from "./authProfile";

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
    return { user: { id: user._id, email: user.email, name: user.name }, profile, prefill: profile ? null : await prefillFor(ctx, user._id) };
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

// First free handle for a server-minted profile; numeric suffixes exactly like uniqueSlug in domain/projects.ts.
async function mintHandle(ctx: MutationCtx, base: string) {
  const root = (slugify(base).slice(0, 24).replace(/-+$/, "") || "founder").padEnd(3, "0");
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    if (!isValidHandle(candidate)) continue;
    const hit = await ctx.db.query("profiles").withIndex("by_username", (q) => q.eq("username", candidate)).unique();
    if (!hit) return candidate;
  }
  throw new Error("Could not find a free handle");
}

// The wizard needs saas.ownerId before the founder has picked anything, so the profile row is minted here with a
// derived handle. handleConfirmed: false keeps it out of every public read until the profile step confirms it.
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, profile } = await getProfileForUser(ctx);
    if (!user) throw new Error("Not signed in");
    if (profile) return profile._id;
    const local = user.email?.split("@")[0] ?? "";
    const prefill = await takePrefill(ctx, user._id);
    return ctx.db.insert("profiles", {
      ...fillEmpty({}, prefill),
      ...followerPatch(prefill),
      userId: user._id,
      username: await mintHandle(ctx, user.name || local),
      displayName: (user.name?.trim() || local || "Founder").slice(0, 60),
      onboardingCompleted: false,
      handleConfirmed: false,
    });
  },
});

// Short-lived URL for a direct browser -> Convex storage POST, so an avatar can be a file instead of a hosted link.
export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await getProfileForUser(ctx);
    if (!user) throw new Error("Not signed in");
    return ctx.storage.generateUploadUrl();
  },
});

const profileFields = {
  username: v.string(),
  displayName: v.string(),
  avatarUrl: v.optional(v.string()),
  // Uploaded file or an avatar imported from X; replaces avatarUrl when set.
  avatarStorageId: v.optional(v.id("_storage")),
  bio: v.optional(v.string()),
  website: v.optional(v.string()),
  x: v.optional(v.string()),
  github: v.optional(v.string()),
  linkedin: v.optional(v.string()),
  location: v.optional(v.string()),
  profilePublic: v.optional(v.boolean()),
};

const attribution = v.object({ ref: v.optional(v.string()), source: v.optional(v.string()), medium: v.optional(v.string()), campaign: v.optional(v.string()), at: v.number() });

export const upsert = mutation({
  args: { ...profileFields, timezone: v.optional(v.string()), attribution: v.optional(attribution) },
  handler: async (ctx, { timezone, attribution, avatarStorageId, ...args }) => {
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
    const avatar = avatarStorageId ? await storedImageUrl(ctx, avatarStorageId, "Avatar", profile?.avatarStorageId) : null;
    // A pasted URL (or a cleared avatar) replaces the stored file, which is dropped from storage.
    if (!avatar && profile?.avatarStorageId && args.avatarUrl !== profile.avatarUrl) await ctx.storage.delete(profile.avatarStorageId);
    const data = {
      ...args,
      avatarStorageId: avatar?.storageId,
      displayName: args.displayName.trim(),
      x: canonicalX(args.x),
      github: handle(args.github),
      linkedin: handle(args.linkedin),
      website: args.website?.trim() || undefined,
      avatarUrl: avatar?.url ?? args.avatarUrl?.trim() ?? undefined,
      location: args.location?.trim().slice(0, 60) || undefined,
      bio: args.bio?.trim().slice(0, 160) || undefined,
      // The founder has now seen the handle, so the row leaves placeholder state and the publish gate above applies to it.
      handleConfirmed: true,
    };
    if (timezone) await setPreferences(ctx, user._id, { timezone });
    if (profile) {
      await ctx.db.patch(profile._id, data);
      return profile._id;
    }
    const prefill = await takePrefill(ctx, user._id);
    // First touch only: written with the new profile, re-validated here, never patched later.
    return ctx.db.insert("profiles", { ...data, ...fillEmpty(data, prefill), ...followerPatch(prefill), userId: user._id, onboardingCompleted: false, attribution: sanitizeAttribution(attribution) ?? undefined });
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
    if (!isHandleConfirmed(profile)) throw new Error("Confirm your founder handle before finishing onboarding");
    await ctx.db.patch(profile._id, { onboardingCompleted: true });
  },
});

// Leaves the wizard without publishing anything: an unconfirmed handle keeps the founder page hidden until it is confirmed.
export const skipOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx);
    await ctx.db.patch(profile._id, { onboardingCompleted: true });
  },
});
