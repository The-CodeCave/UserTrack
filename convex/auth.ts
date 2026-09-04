import { createClient, type AuthFunctions, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import { enabledProviders, socialProviderConfig } from "./lib/authProviders";

const siteUrl = process.env.SITE_URL!;
const VERIFY_TTL_S = 24 * 60 * 60;
const PROFILE_REMINDER_DELAY_MS = 24 * 60 * 60_000;

// Typed explicitly to break the type cycle between `internal` and this module.
const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, user) => {
        // Verified-at-signup users (Google) get the plain welcome now; email+password users get welcome+verify via sendOnSignUp.
        if (user.emailVerified) {
          await ctx.scheduler.runAfter(0, internal.email.send.deliverTransactional, { userId: user._id, to: user.email, type: "welcome", data: { name: user.name || "there" }, dedupeKey: `welcome:${user._id}` });
        } else {
          await ctx.scheduler.runAfter(10 * 60_000, internal.auth.welcomeFallback, { userId: user._id });
        }
        await ctx.scheduler.runAfter(PROFILE_REMINDER_DELAY_MS, internal.email.lifecycle.profileReminder, { userId: user._id });
      },
    },
    account: {
      // Sign-up or link with GitHub / X: import handle + avatar into the founder profile (empty fields only).
      onCreate: async (ctx, account) => {
        if (account.providerId === "github" || account.providerId === "twitter") await ctx.scheduler.runAfter(0, internal.authProfile.importProviderProfile, { userId: account.userId, providerId: account.providerId });
      },
    },
  },
});

export const { onCreate } = authComponent.triggersApi();

// Fire-and-forget from any Better Auth context (HTTP action or mutation).
async function dispatch(ctx: GenericCtx<DataModel>, args: { userId?: string; to: string; type: "welcome" | "verify-email" | "reset-password"; data: Record<string, unknown>; dedupeKey: string }) {
  if ("scheduler" in ctx) await ctx.scheduler.runAfter(0, internal.email.send.deliverTransactional, args);
  else console.error(`email ${args.type}: no scheduler in this auth context, not sent`);
}

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: siteUrl,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await dispatch(ctx, { userId: user.id, to: user.email, type: "reset-password", data: { name: user.name || "there", resetUrl: url }, dedupeKey: `reset-password:${user.id}:${Date.now()}` });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: VERIFY_TTL_S,
      sendVerificationEmail: async ({ user, url }) => {
        // First verification mail doubles as the welcome; later re-sends use the short security template.
        const first = !user.emailVerified && Date.now() - new Date(user.createdAt).getTime() < 5 * 60_000;
        if (first) await dispatch(ctx, { userId: user.id, to: user.email, type: "welcome", data: { name: user.name || "there", verifyUrl: url }, dedupeKey: `welcome:${user.id}` });
        else await dispatch(ctx, { userId: user.id, to: user.email, type: "verify-email", data: { name: user.name || "there", verifyUrl: url }, dedupeKey: `verify-email:${user.id}:${Date.now()}` });
      },
    },
    socialProviders: socialProviderConfig(process.env),
    // All three providers hand us provider-verified emails; X may hand us none, so linking from Settings must not require a match.
    account: { accountLinking: { enabled: true, trustedProviders: ["google", "github", "twitter"], allowDifferentEmails: true } },
    plugins: [convex({ authConfig })],
  });

// Which social buttons the sign-in page and the Connected-accounts panel may offer on this deployment.
export const providers = query({
  args: {},
  handler: async () => enabledProviders(process.env),
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => authComponent.safeGetAuthUser(ctx),
});

export { welcomeFallback } from "./email/welcome";
