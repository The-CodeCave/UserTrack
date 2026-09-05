// Follows + the personalized watchlist feed (docs/FOLLOWS.md). One row per (follower, target); counters are denormalized.
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getProfileForUser, requireProfile } from "./profiles";
import { DAY } from "./lib/time";
import { publicTrustLabel } from "./lib/trust";
import { publicLogo } from "./domain/visibility";
import { rankMovement } from "./lib/history";

const targetType = v.union(v.literal("saas"), v.literal("profile"));
type TargetType = "saas" | "profile";
type Ctx = QueryCtx | MutationCtx;

export const MAX_FOLLOWS = 500;
// Events shown in the personal feed. Small metric changes never appear; these are the stored, deduplicated kinds only.
const FEED_EVENT_KINDS = new Set(["spike", "activation_spike", "launched", "verified", "rank_jump", "traction", "benchmark"]);

async function findFollow(ctx: Ctx, followerId: Id<"profiles">, type: TargetType, targetId: string) {
  return ctx.db.query("follows").withIndex("by_follower_target", (q) => q.eq("followerId", followerId).eq("targetType", type).eq("targetId", targetId)).unique();
}

async function loadTarget(ctx: Ctx, type: TargetType, targetId: string) {
  const target = type === "saas" ? await ctx.db.get(targetId as Id<"saas">).catch(() => null) : await ctx.db.get(targetId as Id<"profiles">).catch(() => null);
  if (!target) throw new Error("Not found");
  if (type === "saas" && !(target as Doc<"saas">).isPublic) throw new Error("This project is private");
  if (type === "profile" && (target as Doc<"profiles">).profilePublic === false) throw new Error("This profile is private");
  return target;
}

// Idempotent follow: a second call is a no-op and returns following=true. Used by the button, the API and MCP.
export async function followTarget(ctx: MutationCtx, profile: Doc<"profiles">, type: TargetType, targetId: string) {
  const target = await loadTarget(ctx, type, targetId);
  if (type === "profile" && target._id === profile._id) throw new Error("You cannot follow yourself");
  const existing = await findFollow(ctx, profile._id, type, targetId);
  if (existing) return { following: true, created: false };
  const count = await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", profile._id)).take(MAX_FOLLOWS);
  if (count.length >= MAX_FOLLOWS) throw new Error(`You can follow at most ${MAX_FOLLOWS} products and founders`);
  await ctx.db.insert("follows", { followerId: profile._id, targetType: type, targetId });
  await ctx.db.patch(target._id, { followerCount: (target.followerCount ?? 0) + 1 });
  return { following: true, created: true };
}

export async function unfollowTarget(ctx: MutationCtx, profile: Doc<"profiles">, type: TargetType, targetId: string) {
  const existing = await findFollow(ctx, profile._id, type, targetId);
  if (!existing) return { following: false, removed: false };
  await ctx.db.delete(existing._id);
  const target = type === "saas" ? await ctx.db.get(targetId as Id<"saas">) : await ctx.db.get(targetId as Id<"profiles">);
  if (target) await ctx.db.patch(target._id, { followerCount: Math.max(0, (target.followerCount ?? 0) - 1) });
  return { following: false, removed: true };
}

export const follow = mutation({
  args: { targetType, targetId: v.string() },
  handler: async (ctx, { targetType, targetId }) => {
    const { profile } = await requireProfile(ctx);
    return followTarget(ctx, profile, targetType, targetId);
  },
});

export const unfollow = mutation({
  args: { targetType, targetId: v.string() },
  handler: async (ctx, { targetType, targetId }) => {
    const { profile } = await requireProfile(ctx);
    return unfollowTarget(ctx, profile, targetType, targetId);
  },
});

export const toggle = mutation({
  args: { targetType, targetId: v.string() },
  handler: async (ctx, { targetType, targetId }) => {
    const { profile } = await requireProfile(ctx);
    const existing = await findFollow(ctx, profile._id, targetType, targetId);
    const r = existing ? await unfollowTarget(ctx, profile, targetType, targetId) : await followTarget(ctx, profile, targetType, targetId);
    return r.following;
  },
});

export const status = query({
  args: { targetType, targetId: v.string() },
  handler: async (ctx, { targetType, targetId }) => {
    const { user, profile } = await getProfileForUser(ctx);
    if (!profile) return { signedIn: Boolean(user), following: false };
    const existing = await findFollow(ctx, profile._id, targetType, targetId);
    return { signedIn: true, following: Boolean(existing) };
  },
});

// Everything the signed-in user follows, as id sets. One subscription serves every follow chip on a page.
export const ids = query({
  args: {},
  handler: async (ctx) => {
    const { user, profile } = await getProfileForUser(ctx);
    if (!profile) return { signedIn: Boolean(user), saas: [] as string[], profiles: [] as string[] };
    const rows = await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", profile._id)).take(MAX_FOLLOWS);
    return { signedIn: true, saas: rows.filter((r) => r.targetType === "saas").map((r) => r.targetId), profiles: rows.filter((r) => r.targetType === "profile").map((r) => r.targetId) };
  },
});

// Public projects a follower is interested in: direct follows plus every public project of followed founders.
export async function watchedProjects(ctx: Ctx, profileId: Id<"profiles">) {
  const rows = await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", profileId)).take(MAX_FOLLOWS);
  const direct = new Set(rows.filter((r) => r.targetType === "saas").map((r) => r.targetId));
  const founders: Doc<"profiles">[] = [];
  const projects = new Map<string, { saas: Doc<"saas">; via: "direct" | "founder"; founder?: Doc<"profiles"> }>();
  for (const id of direct) {
    const s = await ctx.db.get(id as Id<"saas">).catch(() => null);
    if (s && s.isPublic) projects.set(s._id, { saas: s, via: "direct" });
  }
  for (const r of rows.filter((r) => r.targetType === "profile")) {
    const p = await ctx.db.get(r.targetId as Id<"profiles">).catch(() => null);
    if (!p) continue;
    founders.push(p);
    for (const s of await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", p._id)).collect()) {
      if (s.isPublic && !projects.has(s._id)) projects.set(s._id, { saas: s, via: "founder", founder: p });
    }
  }
  return { founders, projects: [...projects.values()], directIds: direct };
}

const card = (s: Doc<"saas">) => ({ _id: s._id, slug: s.slug, name: s.name, logoUrl: publicLogo(s), category: s.category, totalUsers: s.totalUsers, trust: s.trust, trustLabel: publicTrustLabel(s.trust, s.trustState, s.trustScore) });

export type WatchlistItemKind = "milestone" | "spike" | "activation_spike" | "launched" | "verified" | "rank_jump" | "traction" | "benchmark" | "rank_change" | "new_project";

// Merged, chronological feed for one follower: stored milestones + events of watched projects, weekly leaderboard moves,
// and new public projects of followed founders. Nothing is synthesized from small metric changes.
export async function watchlistFeed(ctx: Ctx, profileId: Id<"profiles">, days = 30, limit = 60) {
  const since = Date.now() - days * DAY;
  const { founders, projects, directIds } = await watchedProjects(ctx, profileId);
  const items: { id: string; kind: WatchlistItemKind; subkind: string; at: number; title: string; detail: string; value?: number; share?: string; via: "direct" | "founder"; founder?: { username: string; displayName: string }; saas: ReturnType<typeof card> }[] = [];
  for (const { saas: s, via, founder } of projects) {
    const f = founder ? { username: founder.username, displayName: founder.displayName } : undefined;
    const ms = await ctx.db.query("milestones").withIndex("by_saas_time", (q) => q.eq("saasId", s._id).gte("achievedAt", since)).order("desc").take(20);
    for (const m of ms) items.push({ id: `milestone:${s._id}:${m.key}`, kind: "milestone", subkind: m.kind, at: m.achievedAt, title: m.title, detail: m.copy, value: m.value, share: `share/milestone-${m._id}`, via, founder: f, saas: card(s) });
    const evs = await ctx.db.query("events").withIndex("by_saas_time", (q) => q.eq("saasId", s._id).gte("at", since)).order("desc").take(20);
    for (const e of evs) {
      if (!FEED_EVENT_KINDS.has(e.kind)) continue;
      const kind = e.kind === "launched" && via === "founder" ? "new_project" : (e.kind as WatchlistItemKind);
      items.push({ id: `${e.kind}:${s._id}:${e.day}`, kind, subkind: e.kind, at: e.at, title: kind === "new_project" ? `New from ${founder?.displayName ?? "a founder you follow"}` : e.title, detail: e.detail, value: e.value, share: e.kind === "spike" ? `share/spike-${e._id}` : undefined, via, founder: f, saas: card(s) });
    }
    // Weekly rank movement from stored history (materialized on the row by rerank); ±5 places or better only.
    if (s.rank !== undefined && s.rankDelta7d !== undefined && Math.abs(s.rankDelta7d) >= 5 && (s.lastSyncedAt ?? 0) >= since) {
      const up = s.rankDelta7d > 0;
      items.push({ id: `rank_change:${s._id}:${s.rank7dAgo}-${s.rank}`, kind: "rank_change", subkind: up ? "up" : "down", at: s.lastSyncedAt ?? Date.now(), title: `#${s.rank7dAgo} → #${s.rank}`, detail: `${s.name} ${up ? "climbed" : "dropped"} ${Math.abs(s.rankDelta7d)} places on the leaderboard this week.`, value: s.rankDelta7d, via, founder: f, saas: card(s) });
    }
  }
  const seen = new Set<string>();
  const merged = items.filter((i) => !seen.has(i.id) && seen.add(i.id)).sort((a, b) => b.at - a.at);
  // Unseen = newer than the last visit to /app/following, counted over the whole window, not just the returned slice.
  const seenAt = (await ctx.db.get(profileId))?.feedSeenAt ?? 0;
  const unseenCount = merged.filter((i) => i.at > seenAt).length;
  const feed = merged.slice(0, limit);
  const saas = projects
    .map(({ saas: s, via }) => ({ _id: s._id, slug: s.slug, name: s.name, logoUrl: publicLogo(s), category: s.category, trust: s.trust, trustLabel: publicTrustLabel(s.trust, s.trustState, s.trustScore), totalUsers: s.totalUsers, newUsers7d: s.newUsers7d, newUsers30d: s.newUsers30d, growth7dPct: s.growth7dPct ?? 0, growth30dPct: s.growth30dPct, rank: s.rank, rank7dAgo: s.rank7dAgo, rankMovement7d: rankMovement(s.rank7dAgo, s.rank), trendingRank: s.trendingRank, trendingMovement7d: rankMovement(s.trendingRank7dAgo, s.trendingRank), via, followed: directIds.has(s._id) }))
    .sort((a, b) => b.newUsers7d - a.newUsers7d);
  return { saas, founders: founders.map((p) => ({ _id: p._id, username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl, followerCount: p.followerCount ?? 0 })), feed, seenAt, unseenCount };
}

// /app/following was opened: everything currently in the feed counts as seen.
export const markFeedSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx);
    await ctx.db.patch(profile._id, { feedSeenAt: Date.now() });
  },
});

// Everything the signed-in user follows, with the last 7 days of movement, plus the personalized feed (last 30 days).
export const feed = query({
  args: { days: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { days, limit }) => {
    const { profile } = await getProfileForUser(ctx);
    if (!profile) return null;
    return watchlistFeed(ctx, profile._id, Math.min(Math.max(days ?? 30, 1), 90), Math.min(Math.max(limit ?? 60, 1), 200));
  },
});
