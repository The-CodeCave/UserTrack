import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { enqueue } from "./send";
import { crossedThresholds, enteredRankThresholds, evaluateSpike, FOLLOWER_RANK_THRESHOLD_MAX, FOLLOWER_USER_THRESHOLD_MIN, SPIKE } from "../lib/emailRules";

const fmt = (n: number) => new Intl.NumberFormat("en").format(n);

// Only the highest crossed threshold gets an email; lower ones crossed in the same jump are recorded as skipped.
export async function onUsersSnapshot(ctx: MutationCtx, saas: Doc<"saas">, prevTotal: number | null, totalUsers: number) {
  if (saas.isDemo) return;
  const crossed = crossedThresholds(prevTotal, totalUsers);
  if (!crossed.length) return;
  const owner = await ctx.db.get(saas.ownerId);
  if (!owner) return;
  const top = crossed[crossed.length - 1];
  for (const t of crossed.slice(0, -1)) {
    const key = `user-milestone:${saas._id}:${t}`;
    const dup = await ctx.db.query("emailEvents").withIndex("by_dedupe", (q) => q.eq("dedupeKey", key)).first();
    if (!dup) await ctx.db.insert("emailEvents", { userId: owner.userId, emailType: "user-milestone", category: "growth", saasId: saas._id, recipient: "", dedupeKey: key, status: "skipped", attempts: 0, metadata: { reason: "superseded", totalUsers, at: Date.now() }, createdAt: Date.now() });
  }
  const previous = await ctx.db.query("emailEvents").withIndex("by_saas_type_time", (q) => q.eq("saasId", saas._id).eq("emailType", "user-milestone")).order("desc").first();
  const prevThreshold = previous ? Number(previous.dedupeKey.split(":").pop()) : undefined;
  const res = await enqueue(ctx, {
    userId: owner.userId,
    type: "user-milestone",
    dedupeKey: `user-milestone:${saas._id}:${top}`,
    saasId: saas._id,
    data: { saasName: saas.name, slug: saas.slug, threshold: top, totalUsers, previousThreshold: prevThreshold && prevThreshold < top ? prevThreshold : undefined, sinceMs: previous ? Date.now() - previous.createdAt : undefined, isPublic: saas.isPublic },
  });
  if (res.status === "queued" || res.status === "skipped") {
    const ev = await ctx.db.query("emailEvents").withIndex("by_dedupe", (q) => q.eq("dedupeKey", `user-milestone:${saas._id}:${top}`)).first();
    if (ev) await ctx.db.patch(ev._id, { metadata: { ...(ev.metadata ?? {}), totalUsers, at: Date.now() } });
  }
  if (top >= FOLLOWER_USER_THRESHOLD_MIN && saas.isPublic) {
    await ctx.scheduler.runAfter(0, internal.email.growth.notifyFollowers, { saasId: saas._id, key: `users:${top}`, kind: "milestone", headline: `${saas.name} just crossed ${fmt(top)} users`, detail: `A product you follow on UserTrack reached ${fmt(top)} verified users.` });
  }
}

// After every rerank. `boardSize` keeps Top 100 quiet while the board is small.
export async function onRerank(ctx: MutationCtx, saas: Doc<"saas">, prevRank: number | undefined, rank: number | undefined, boardSize: number) {
  if (saas.isDemo) return;
  const entered = enteredRankThresholds(prevRank, rank, boardSize);
  if (!entered.length || !rank) return;
  const owner = await ctx.db.get(saas.ownerId);
  if (!owner) return;
  const best = entered[entered.length - 1];
  for (const t of entered.slice(0, -1)) {
    const key = `rank-milestone:${saas._id}:top${t}`;
    const dup = await ctx.db.query("emailEvents").withIndex("by_dedupe", (q) => q.eq("dedupeKey", key)).first();
    if (!dup) await ctx.db.insert("emailEvents", { userId: owner.userId, emailType: "rank-milestone", category: "growth", saasId: saas._id, recipient: "", dedupeKey: key, status: "skipped", attempts: 0, metadata: { reason: "superseded", rank }, createdAt: Date.now() });
  }
  await enqueue(ctx, {
    userId: owner.userId,
    type: "rank-milestone",
    dedupeKey: `rank-milestone:${saas._id}:top${best}`,
    saasId: saas._id,
    data: { saasName: saas.name, slug: saas.slug, threshold: best, rank, newUsers30d: saas.newUsers30d, growth30dPct: saas.growth30dPct },
  });
  if (best <= FOLLOWER_RANK_THRESHOLD_MAX) {
    const tier = best === 1 ? "#1" : `the Top ${best}`;
    await ctx.scheduler.runAfter(0, internal.email.growth.notifyFollowers, { saasId: saas._id, key: `rank:top${best}`, kind: "rank", headline: `${saas.name} reached ${tier} on UserTrack`, detail: `Now #${rank} by verified new users in the last 30 days.` });
  }
}

// Spike check after a users snapshot: closed daily history vs the rolling 24h count, 7-day cooldown.
export async function onSpikeCheck(ctx: MutationCtx, saas: Doc<"saas">, history: number[]) {
  if (saas.isDemo) return;
  const last = await ctx.db.query("emailEvents").withIndex("by_saas_type_time", (q) => q.eq("saasId", saas._id).eq("emailType", "growth-spike")).order("desc").first();
  const spike = evaluateSpike({ dailyNewUsers: history, last24h: saas.newUsers24h, lastSpikeAt: last && last.status !== "failed" ? last.createdAt : undefined, now: Date.now() });
  if (!spike) return;
  const owner = await ctx.db.get(saas.ownerId);
  if (!owner) return;
  const bucket = Math.floor(Date.now() / SPIKE.cooldownMs);
  await enqueue(ctx, {
    userId: owner.userId,
    type: "growth-spike",
    dedupeKey: `growth-spike:${saas._id}:${bucket}`,
    saasId: saas._id,
    data: { saasName: saas.name, slug: saas.slug, saasId: saas._id, last24h: saas.newUsers24h, average: spike.average, multiple: spike.multiple, days: spike.days, totalUsers: saas.totalUsers },
  });
  if (spike.multiple >= 3 && saas.isPublic) {
    await ctx.scheduler.runAfter(0, internal.email.growth.notifyFollowers, { saasId: saas._id, key: `spike:${bucket}`, kind: "spike", headline: `${saas.name} is growing ${spike.multiple}× faster than usual`, detail: `${fmt(saas.newUsers24h)} new users in the last 24 hours vs a ${spike.average}/day average.` });
  }
}

// Fan-out to followers of the product and of its founder. Conservative by design; each follower gets one mail per event.
export const notifyFollowers = internalMutation({
  args: { saasId: v.id("saas"), key: v.string(), kind: v.union(v.literal("milestone"), v.literal("rank"), v.literal("spike")), headline: v.string(), detail: v.string() },
  handler: async (ctx, { saasId, key, kind, headline, detail }) => {
    const saas = await ctx.db.get(saasId);
    if (!saas || !saas.isPublic) return;
    const direct = await ctx.db.query("follows").withIndex("by_target", (q) => q.eq("targetType", "saas").eq("targetId", saasId)).collect();
    const viaOwner = await ctx.db.query("follows").withIndex("by_target", (q) => q.eq("targetType", "profile").eq("targetId", saas.ownerId)).collect();
    const followers = new Set<Id<"profiles">>([...direct, ...viaOwner].map((f) => f.followerId));
    for (const profileId of followers) {
      if (profileId === saas.ownerId) continue;
      const p = await ctx.db.get(profileId);
      if (!p) continue;
      await enqueue(ctx, { userId: p.userId, type: "followed-update", dedupeKey: `followed-update:${saasId}:${key}:${p.userId}`, saasId, data: { saasName: saas.name, slug: saas.slug, kind, headline, detail } });
    }
  },
});
