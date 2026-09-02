// Stored growth events. One-time kinds (launched, verified) are keyed by kind only so they can never repeat for a SaaS.
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { dayKey } from "../lib/time";

export async function addOnceEvent(ctx: MutationCtx, saasId: Id<"saas">, kind: "launched" | "verified", at: number, title: string, detail: string) {
  const existing = await ctx.db.query("events").withIndex("by_saas_kind_day", (q) => q.eq("saasId", saasId).eq("kind", kind)).first();
  if (existing) return;
  await ctx.db.insert("events", { saasId, kind, day: dayKey(at), at, title, detail });
}

// First publish of a real product: stamps `launchedAt` and writes the discovery-feed event exactly once.
export async function markLaunched(ctx: MutationCtx, saas: Doc<"saas">) {
  if (saas.launchedAt !== undefined || saas.isDemo) return;
  const now = Date.now();
  await ctx.db.patch(saas._id, { launchedAt: now });
  await addOnceEvent(ctx, saas._id, "launched", now, "New on UserTrack", `${saas.name} published its public growth page.`);
}
