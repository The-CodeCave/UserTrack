import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { trendingScore } from "./lib/trending";
import { rankMilestones, trendingMilestones } from "./lib/milestones";
import { addMilestones } from "./trust";
import { onRerank } from "./email/growth";
import { DAY, dayKey } from "./lib/time";
import { isRankJump } from "./lib/history";
import { addEvent } from "./domain/events";
import { dispatchEvent } from "./webhooks";

export const rankable = (s: Doc<"saas">) => s.isPublic && s.trust === "verified" && !s.isDemo && s.trustState !== "review";

const WINDOWS = ["24h", "7d", "30d"] as const;
type Window = (typeof WINDOWS)[number];
type Kind = "leaderboard" | "trending";

export function trendingInputs(s: Doc<"saas">, now = Date.now()) {
  const input = (newUsers: number, prev: number | undefined) => ({
    newUsers, prevNewUsers: prev ?? 0, baseUsers: s.totalUsers - newUsers, trustScore: s.trustScore, activationRatePct: s.activationRatePct, signupToConvertedPct: s.signupToConvertedPct,
    lastSyncedAt: s.lastSyncedAt, firstSnapshotAt: s.firstSnapshotAt, underReview: s.trustState === "review", now,
  });
  return { "24h": input(s.newUsers24h, s.newUsersPrev24h), "7d": input(s.newUsers7d, s.newUsersPrev7d), "30d": input(s.newUsers30d, s.newUsersPrev30d) } satisfies Record<Window, unknown>;
}

// One history row per (project, board, window, UTC day): the day's last position. Past days are never rewritten.
async function upsertRankHistory(ctx: MutationCtx, saasId: Id<"saas">, kind: Kind, window: Window, day: string, rank: number, at: number, score?: number) {
  const row = await ctx.db.query("rankHistory").withIndex("by_saas_kind_window_day", (q) => q.eq("saasId", saasId).eq("kind", kind).eq("window", window).eq("day", day)).unique();
  if (row) {
    if (row.rank !== rank || row.score !== score) await ctx.db.patch(row._id, { rank, score, at });
  } else await ctx.db.insert("rankHistory", { saasId, kind, window, day, rank, score, at });
}

// Position on (or the closest stored day before) `day`, no older than `floorDay`. Undefined = not ranked then.
export async function rankOn(ctx: MutationCtx, saasId: Id<"saas">, kind: Kind, window: Window, day: string, floorDay: string) {
  const row = await ctx.db.query("rankHistory").withIndex("by_saas_kind_window_day", (q) => q.eq("saasId", saasId).eq("kind", kind).eq("window", window).gte("day", floorDay).lte("day", day)).order("desc").first();
  return row?.rank;
}

// Ranks (30-day new users) and trending scores + ranks per window for all public SaaS. Demo rows and data-under-review are never ranked.
// Also appends the daily ranking history, materializes 7-day movement and emits rank-jump events + webhooks.
export const rerank = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const day = dayKey(now);
    const weekAgo = dayKey(now - 7 * DAY);
    const floor = dayKey(now - 10 * DAY);
    const all = await ctx.db.query("saas").collect();
    const eligible = all.filter(rankable);

    eligible.sort((a, b) => b.newUsers30d - a.newUsers30d || b.growth30dPct - a.growth30dPct || b.totalUsers - a.totalUsers);
    const ranks = new Map(eligible.map((s, i) => [s._id, i + 1]));

    const scores = new Map(all.map((s) => {
      const i = trendingInputs(s, now);
      return [s._id, { "24h": trendingScore(i["24h"]), "7d": trendingScore(i["7d"]), "30d": trendingScore(i["30d"]) }] as const;
    }));
    // Deterministic: score desc, then 30-day new users, then total, then slug.
    const trendingRanks: Record<Window, Map<string, number>> = { "24h": new Map(), "7d": new Map(), "30d": new Map() };
    for (const w of WINDOWS) {
      const list = eligible.filter((s) => scores.get(s._id)![w] > 0).sort((a, b) => scores.get(b._id)![w] - scores.get(a._id)![w] || b.newUsers30d - a.newUsers30d || b.totalUsers - a.totalUsers || a.slug.localeCompare(b.slug));
      list.forEach((s, i) => trendingRanks[w].set(s._id, i + 1));
    }

    for (const s of all) {
      const rank = ranks.get(s._id);
      const sc = scores.get(s._id)!;
      const t7 = trendingRanks["7d"].get(s._id);
      const t24 = trendingRanks["24h"].get(s._id);
      const t30 = trendingRanks["30d"].get(s._id);
      // Trending "previous" is the position at the last refresh (so a stable #1 reads "same", not "new" forever).
      const patch: Partial<Doc<"saas">> = { trendingScore24h: sc["24h"], trendingScore7d: sc["7d"], trendingScore30d: sc["30d"], prevTrendingRank: s.trendingRank, trendingRank: t7, prevTrendingRank24h: s.trendingRank24h, trendingRank24h: t24, prevTrendingRank30d: s.trendingRank30d, trendingRank30d: t30 };
      if (s.rank !== rank) { patch.prevRank = s.rank; patch.rank = rank; }
      if (rank && (s.bestRank === undefined || rank < s.bestRank)) patch.bestRank = rank;
      if (t7 && (s.bestTrendingRank === undefined || t7 < s.bestTrendingRank)) patch.bestTrendingRank = t7;

      // History + 7-day movement (stored positions only; a product without a row a week ago has no movement yet).
      if (rank !== undefined) await upsertRankHistory(ctx, s._id, "leaderboard", "30d", day, rank, now);
      for (const w of WINDOWS) {
        const r = trendingRanks[w].get(s._id);
        if (r !== undefined) await upsertRankHistory(ctx, s._id, "trending", w, day, r, now, sc[w]);
      }
      const rank7dAgo = rank === undefined ? undefined : await rankOn(ctx, s._id, "leaderboard", "30d", weekAgo, floor);
      const trendingRank7dAgo = t7 === undefined ? undefined : await rankOn(ctx, s._id, "trending", "7d", weekAgo, floor);
      patch.rank7dAgo = rank7dAgo;
      patch.rankDelta7d = rank !== undefined && rank7dAgo !== undefined ? rank7dAgo - rank : undefined;
      patch.trendingRank7dAgo = trendingRank7dAgo;
      patch.trendingRankDelta7d = t7 !== undefined && trendingRank7dAgo !== undefined ? trendingRank7dAgo - t7 : undefined;
      await ctx.db.patch(s._id, patch);

      if (!s.isDemo) {
        await addMilestones(ctx, s._id, rankMilestones(s.rank, rank, s.name, s.bestRank));
        await addMilestones(ctx, s._id, trendingMilestones(s.trendingRank, t7, s.name));
        await onRerank(ctx, s, s.rank, rank, eligible.length);
        if (rank !== undefined && isRankJump(rank7dAgo, rank)) {
          const recent = await ctx.db.query("events").withIndex("by_saas_kind_day", (q) => q.eq("saasId", s._id).eq("kind", "rank_jump").gte("day", weekAgo)).first();
          if (!recent) await addEvent(ctx, s._id, "rank_jump", day, now, `#${rank7dAgo} → #${rank}`, `${s.name} climbed ${rank7dAgo! - rank} places on the leaderboard in 7 days.`, rank7dAgo! - rank);
        }
        const fresh = { ...s, ...patch } as Doc<"saas">;
        if (rank !== undefined && s.rank !== undefined && s.rank !== rank) await dispatchEvent(ctx, { type: "rank.changed", key: day, saas: fresh, data: { rank: { board: "leaderboard", window: "30d", from: s.rank, to: rank, best: patch.bestRank ?? s.bestRank } } });
        if (t7 !== undefined && s.trendingRank !== undefined && s.trendingRank !== t7) await dispatchEvent(ctx, { type: "trending.rank_changed", key: day, saas: fresh, data: { rank: { board: "trending", window: "7d", from: s.trendingRank, to: t7, score: sc["7d"] } } });
      }
    }
  },
});
