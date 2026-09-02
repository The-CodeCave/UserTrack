import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { EMAIL_TYPES, type EmailType } from "./types";

// Operator smoke test: `npx convex run --prod email/testSend:run '{"to":"you@example.com"}'`. Never targets real users.
export const run = internalAction({
  args: { to: v.string(), type: v.optional(v.string()) },
  handler: async (ctx, { to, type = "welcome" }) => {
    if (!EMAIL_TYPES.includes(type as EmailType)) throw new Error(`Unknown type. One of: ${EMAIL_TYPES.join(", ")}`);
    const t = type as "welcome" | "verify-email" | "reset-password";
    const data = t === "welcome" ? { name: "Test" } : t === "reset-password" ? { name: "Test", resetUrl: `${process.env.SITE_URL}/reset-password` } : { name: "Test", verifyUrl: `${process.env.SITE_URL}/app` };
    await ctx.runAction(internal.email.send.deliverTransactional, { to, type: t, data, dedupeKey: `test:${Date.now()}` });
    return `queued ${t} → ${to}; check the emailEvents table and Resend → Emails`;
  },
});
