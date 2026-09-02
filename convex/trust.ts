import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DAY } from "./lib/time";
import { trustScore, trustState, type Flag } from "./lib/trust";
import type { Milestone } from "./lib/milestones";

export async function addMilestones(ctx: MutationCtx, saasId: Id<"saas">, list: Milestone[]) {
  const now = Date.now();
  for (const m of list) {
    const exists = await ctx.db.query("milestones").withIndex("by_saas_key", (q) => q.eq("saasId", saasId).eq("key", m.key)).first();
    if (exists) continue;
    await ctx.db.insert("milestones", { saasId, key: m.key, kind: m.kind, metric: m.metric, value: m.value, title: m.title, copy: m.copy, achievedAt: now });
  }
}

export async function listOpenFlags(ctx: MutationCtx, saasId: Id<"saas">) {
  return ctx.db.query("fraudFlags").withIndex("by_saas_open", (q) => q.eq("saasId", saasId).eq("resolvedAt", undefined)).collect();
}

export async function openFlags(ctx: MutationCtx, saasId: Id<"saas">, flags: Flag[]) {
  if (!flags.length) return;
  const open = await listOpenFlags(ctx, saasId);
  for (const f of flags) {
    if (open.some((o) => o.kind === f.kind)) continue;
    await ctx.db.insert("fraudFlags", { saasId, kind: f.kind, severity: f.severity, detail: f.detail, createdAt: Date.now() });
  }
}

// Recomputes trustScore/trustState for a SaaS from its users integration, recent runs and open flags.
export async function refreshTrust(ctx: MutationCtx, saasId: Id<"saas">) {
  const saas = await ctx.db.get(saasId);
  if (!saas) return;
  const integrations = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).collect();
  const users = integrations.find((i) => (i.role ?? "users") === "users");
  if (!users) {
    await ctx.db.patch(saasId, { trustScore: undefined, trustState: undefined });
    return;
  }
  const runs = await ctx.db.query("syncRuns").withIndex("by_saas_time", (q) => q.eq("saasId", saasId)).order("desc").take(30);
  const open = await listOpenFlags(ctx, saasId);
  const score = trustScore({
    provider: users.provider,
    trust: saas.trust,
    connectedAt: users.connectedAt ?? users._creationTime,
    now: Date.now(),
    recentRuns: runs.filter((r) => r.integrationId === users._id),
    activationRatePct: saas.activationRatePct,
    openFlags: open,
  });
  await ctx.db.patch(saasId, { trustScore: score, trustState: trustState(score, open) });
}

const AUTO_RESOLVE_DAYS: Record<Doc<"fraudFlags">["kind"], number> = {
  impossible_growth: 7,
  sudden_drop: 7,
  reconnect_churn: 7,
  source_switching: 14,
  activation_exceeds_users: 7,
  stale_source: 3,
};

// Daily: auto-resolve aged flags, open stale-source flags, refresh scores for everyone.
export const dailyReview = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const all = await ctx.db.query("saas").collect();
    for (const s of all) {
      const open = await listOpenFlags(ctx, s._id);
      for (const f of open) {
        if (now - f.createdAt > AUTO_RESOLVE_DAYS[f.kind] * DAY) await ctx.db.patch(f._id, { resolvedAt: now });
      }
      const stale = s.isPublic && s.trust === "verified" && s.lastSyncedAt !== undefined && now - s.lastSyncedAt > 3 * DAY;
      if (stale && !open.some((f) => f.kind === "stale_source")) {
        await ctx.db.insert("fraudFlags", { saasId: s._id, kind: "stale_source", severity: "low", detail: "No successful sync for 3+ days", createdAt: now });
      }
      await refreshTrust(ctx, s._id);
    }
  },
});
