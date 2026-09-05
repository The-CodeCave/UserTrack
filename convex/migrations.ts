// One-off, idempotent data migrations. Run with `npx convex run migrations:<name> --prod`.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { encryptConfig } from "./lib/secrets";
import { getProvider } from "./providers";

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

// v0.7 native SDK provider: `better_auth` integrations become `native` with `config.source = "better-auth"`; snapshot,
// stage-snapshot and sync-run provenance follow. Never touches metrics.
export const nativeV1 = internalMutation({
  args: { table: v.optional(v.union(v.literal("snapshots"), v.literal("stageSnapshots"), v.literal("syncRuns"))), cursor: v.optional(v.string()) },
  handler: async (ctx, { table = "snapshots", cursor }) => {
    if (table === "snapshots" && !cursor) {
      for (const i of await ctx.db.query("integrations").collect()) {
        if (i.provider !== "better_auth") continue;
        await ctx.db.patch(i._id, { provider: "native", config: { ...(i.config as Record<string, unknown>), source: "better-auth" } });
      }
    }
    const page = table === "snapshots" ? await ctx.db.query("snapshots").paginate({ cursor: cursor ?? null, numItems: 500 }) : table === "stageSnapshots" ? await ctx.db.query("stageSnapshots").paginate({ cursor: cursor ?? null, numItems: 500 }) : await ctx.db.query("syncRuns").paginate({ cursor: cursor ?? null, numItems: 500 });
    for (const r of page.page) {
      const key = table === "syncRuns" ? "provider" : "source";
      if ((r as Record<string, unknown>)[key] !== "better_auth") continue;
      await ctx.db.patch(r._id, { [key]: "native" });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.migrations.nativeV1, { table, cursor: page.continueCursor });
    else if (table === "snapshots") await ctx.scheduler.runAfter(0, internal.migrations.nativeV1, { table: "stageSnapshots" });
    else if (table === "stageSnapshots") await ctx.scheduler.runAfter(0, internal.migrations.nativeV1, { table: "syncRuns" });
    return page.isDone && table === "syncRuns" ? "done" : "continuing";
  },
});

// v0.8 credential encryption: every stored provider config is rewritten with its secret fields as AES-256-GCM
// ciphertext, and the display view is materialized while the plaintext is still readable. Idempotent — already
// encrypted values are left alone. Requires CONFIG_ENCRYPTION_KEY; throws (and changes nothing) without it.
export const encryptSecretsV1 = internalMutation({
  args: {},
  handler: async (ctx) => {
    let encrypted = 0;
    for (const i of await ctx.db.query("integrations").collect()) {
      const config = await encryptConfig(i.provider, i.config);
      if (config === i.config && i.publicConfig) continue;
      await ctx.db.patch(i._id, { config, publicConfig: i.publicConfig ?? getProvider(i.provider).publicConfig(i.config) });
      encrypted++;
    }
    return { integrations: encrypted };
  },
});
