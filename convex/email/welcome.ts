import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { findAuthUser } from "./users";

// Safety net: if no welcome went out within 10 minutes of signup (verification path did not fire), send the plain one.
export const welcomeFallback = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const sent = await ctx.db.query("emailEvents").withIndex("by_dedupe", (q) => q.eq("dedupeKey", `welcome:${userId}`)).first();
    if (sent) return;
    const user = await findAuthUser(ctx, userId);
    if (!user?.email) return;
    await ctx.scheduler.runAfter(0, internal.email.send.deliverTransactional, { userId, to: user.email, type: "welcome", data: { name: user.name || "there" }, dedupeKey: `welcome:${userId}` });
  },
});
