import { createClient, type AuthFunctions, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

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
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
    plugins: [convex({ authConfig })],
  });

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => authComponent.safeGetAuthUser(ctx),
});

export { welcomeFallback } from "./email/welcome";
