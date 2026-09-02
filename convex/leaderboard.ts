import { internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { trendingScore } from "./lib/trending";
import { rankMilestones, trendingMilestones } from "./lib/milestones";
import { addMilestones } from "./trust";
import { onRerank } from "./email/growth";

export const rankable = (s: Doc<"saas">) => s.isPublic && s.trust === "verified" && !s.isDemo && s.trustState !== "review";

const WINDOWS = ["24h", "7d", "30d"] as const;
type Window = (typeof WINDOWS)[number];

export function trendingInputs(s: Doc<"saas">, now = Date.now()) {
  const input = (newUsers: number, prev: number | undefined) => ({
    newUsers, prevNewUsers: prev ?? 0, baseUsers: s.totalUsers - newUsers, trustScore: s.trustScore, activationRatePct: s.activationRatePct, signupToConvertedPct: s.signupToConvertedPct,
    lastSyncedAt: s.lastSyncedAt, firstSnapshotAt: s.firstSnapshotAt, underReview: s.trustState === "review", now,
  });
  return { "24h": input(s.newUsers24h, s.newUsersPrev24h), "7d": input(s.newUsers7d, s.newUsersPrev7d), "30d": input(s.newUsers30d, s.newUsersPrev30d) } satisfies Record<Window, unknown>;
}

// Ranks (30-day new users) and trending scores + ranks per window for all public SaaS. Demo rows and data-under-review are never ranked.
export const rerank = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
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
      await ctx.db.patch(s._id, patch);
      if (!s.isDemo) {
        await addMilestones(ctx, s._id, rankMilestones(s.rank, rank, s.name, s.bestRank));
        await addMilestones(ctx, s._id, trendingMilestones(s.trendingRank, t7, s.name));
        await onRerank(ctx, s, s.rank, rank, eligible.length);
      }
    }
  },
});
