import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";
import { findAuthUser } from "./users";
import { DEFAULT_PREFERENCES, PREFERENCE_KEYS, type EmailPreferences } from "./types";
import { isValidTimezone } from "../lib/emailRules";
import { signPrefsToken, verifyPrefsToken } from "./token";

const partialFields = {
  productNudges: v.optional(v.boolean()),
  growthMilestones: v.optional(v.boolean()),
  rankingMilestones: v.optional(v.boolean()),
  growthAlerts: v.optional(v.boolean()),
  monthlyReport: v.optional(v.boolean()),
  weeklyDigest: v.optional(v.boolean()),
  followedSaasUpdates: v.optional(v.boolean()),
  followedMilestones: v.optional(v.boolean()),
  followedRanking: v.optional(v.boolean()),
  followedSpikes: v.optional(v.boolean()),
};

export function tokenSecret() {
  const secret = process.env.EMAIL_TOKEN_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("EMAIL_TOKEN_SECRET is not set");
  return secret;
}

export async function getPreferences(ctx: QueryCtx | MutationCtx, userId: string): Promise<EmailPreferences & { timezone?: string }> {
  const row = await ctx.db.query("emailPreferences").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
  if (!row) return { ...DEFAULT_PREFERENCES };
  const out: EmailPreferences & { timezone?: string } = { ...DEFAULT_PREFERENCES, timezone: row.timezone };
  // Keys added after a row was written are missing on old rows: fall back to the default.
  for (const k of PREFERENCE_KEYS) out[k] = row[k] ?? DEFAULT_PREFERENCES[k];
  return out;
}

export async function setPreferences(ctx: MutationCtx, userId: string, patch: Partial<EmailPreferences> & { timezone?: string }) {
  const row = await ctx.db.query("emailPreferences").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
  const tz = patch.timezone && isValidTimezone(patch.timezone) ? patch.timezone : undefined;
  const prefPatch: Partial<EmailPreferences> = {};
  for (const k of PREFERENCE_KEYS) if (typeof patch[k] === "boolean") prefPatch[k] = patch[k];
  if (row) {
    await ctx.db.patch(row._id, { ...prefPatch, ...(tz ? { timezone: tz } : {}), updatedAt: Date.now() });
    return;
  }
  await ctx.db.insert("emailPreferences", { userId, ...DEFAULT_PREFERENCES, ...prefPatch, timezone: tz, updatedAt: Date.now() });
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return null;
    const prefs = await getPreferences(ctx, user._id);
    return { ...prefs, email: user.email, emailVerified: user.emailVerified };
  },
});

export const update = mutation({
  args: { ...partialFields, timezone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not signed in");
    await setPreferences(ctx, user._id, args);
  },
});

// Browser-detected IANA zone, stored on first sight; never overwrites an explicit value with something invalid.
export const setTimezone = mutation({
  args: { timezone: v.string() },
  handler: async (ctx, { timezone }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user || !isValidTimezone(timezone)) return;
    await setPreferences(ctx, user._id, { timezone });
  },
});

// ---- Signed-link access (no login) ------------------------------------------

async function readByToken(ctx: QueryCtx, token: string) {
  const payload = await verifyPrefsToken(tokenSecret(), token);
  if (!payload) return null;
  const user = await findAuthUser(ctx, payload.userId);
  if (!user) return null;
  const prefs = await getPreferences(ctx, payload.userId);
  const [local, domain] = user.email.split("@");
  return { ...prefs, emailMasked: `${local.slice(0, 2)}…@${domain}` };
}

export const byToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => readByToken(ctx, token),
});

export const byTokenInternal = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => readByToken(ctx, token),
});

export const updateByToken = mutation({
  args: { token: v.string(), ...partialFields },
  handler: async (ctx, { token, ...patch }) => {
    const payload = await verifyPrefsToken(tokenSecret(), token);
    if (!payload) throw new Error("This link is invalid or has expired. Sign in to change your preferences.");
    await setPreferences(ctx, payload.userId, patch);
  },
});

export async function unsubscribeAll(ctx: MutationCtx, userId: string) {
  const off = Object.fromEntries(PREFERENCE_KEYS.map((k) => [k, false])) as unknown as EmailPreferences;
  await setPreferences(ctx, userId, off);
}

export const unsubscribeByToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const payload = await verifyPrefsToken(tokenSecret(), token);
    if (!payload) return false;
    await unsubscribeAll(ctx, payload.userId);
    return true;
  },
});

export const tokenFor = internalQuery({
  args: { userId: v.string() },
  handler: async (_ctx, { userId }) => signPrefsToken(tokenSecret(), userId),
});
