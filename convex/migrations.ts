// One-off, idempotent data migrations. Run with `npx convex run migrations:lifecycleV1 --prod`.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// v0.5 lifecycle: revenue role → conversion, Stripe config gets a conversion mode, legacy show* toggles → visibility,
// payingUsers → convertedUsers, and amounts (mrr / currency) are cleared everywhere. Never touches snapshots.
export const lifecycleV1 = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    if (!cursor) {
      for (const i of await ctx.db.query("integrations").collect()) {
        if (i.role !== "revenue") continue;
        const config = i.provider === "stripe" ? { ...(i.config as Record<string, unknown>), mode: (i.config as { mode?: string })?.mode ?? "active_paid" } : i.config;
        await ctx.db.patch(i._id, { role: "conversion", config });
      }
      for (const s of await ctx.db.query("saas").collect()) {
        const patch: Record<string, unknown> = {};
        if (s.showRevenue !== undefined || s.showTraffic !== undefined) {
          patch.visibility = { ...(s.visibility ?? {}), conversionRate: s.visibility?.conversionRate ?? s.showRevenue ?? false, convertedCount: s.visibility?.convertedCount ?? s.showRevenue ?? false, traffic: s.visibility?.traffic ?? s.showTraffic ?? false };
          patch.showRevenue = undefined;
        }
        if (s.convertedUsers === undefined && s.payingUsers !== undefined) { patch.convertedUsers = s.payingUsers; patch.conversionMode = "active_paid"; patch.signupToConvertedPct = s.totalUsers > 0 ? Math.round((s.payingUsers / s.totalUsers) * 1000) / 10 : undefined; }
        if (s.mrr !== undefined || s.currency !== undefined || s.payingUsers !== undefined) { patch.mrr = undefined; patch.currency = undefined; patch.payingUsers = undefined; }
        if (Object.keys(patch).length) await ctx.db.patch(s._id, patch);
      }
    }
    const page = await ctx.db.query("dailyMetrics").paginate({ cursor: cursor ?? null, numItems: 500 });
    for (const r of page.page) {
      if (r.payingUsers === undefined && r.mrr === undefined) continue;
      await ctx.db.patch(r._id, { convertedUsers: r.convertedUsers ?? r.payingUsers, payingUsers: undefined, mrr: undefined });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.migrations.lifecycleV1, { cursor: page.continueCursor });
    return page.isDone ? "done" : "continuing";
  },
});
