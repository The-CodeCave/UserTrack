import { internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { trendingScore } from "./lib/trending";
import { rankMilestones, trendingMilestones } from "./lib/milestones";
import { addMilestones } from "./trust";
import { onRerank } from "./email/growth";

export const rankable = (s: Doc<"saas">) => s.isPublic && s.trust === "verified" && !s.isDemo && s.trustState !== "review";

// Ranks (30-day new users) and trending scores for all public SaaS. Demo rows and data-under-review are never ranked.
export const rerank = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("saas").collect();
    const eligible = all.filter(rankable);

    eligible.sort((a, b) => b.newUsers30d - a.newUsers30d || b.growth30dPct - a.growth30dPct || b.totalUsers - a.totalUsers);
    const ranks = new Map(eligible.map((s, i) => [s._id, i + 1]));

    const scores = new Map(
      all.map((s) => {
        const input = (newUsers: number, prev: number | undefined, base: number) => ({ newUsers, prevNewUsers: prev ?? 0, baseUsers: base, trustScore: s.trustScore, activationRatePct: s.activationRatePct });
        return [
          s._id,
          {
            trendingScore24h: trendingScore(input(s.newUsers24h, s.newUsersPrev24h, s.totalUsers - s.newUsers24h)),
            trendingScore7d: trendingScore(input(s.newUsers7d, s.newUsersPrev7d, s.totalUsers - s.newUsers7d)),
            trendingScore30d: trendingScore(input(s.newUsers30d, s.newUsersPrev30d, s.totalUsers - s.newUsers30d)),
          },
        ] as const;
      }),
    );
    const trending = eligible.filter((s) => scores.get(s._id)!.trendingScore7d > 0).sort((a, b) => scores.get(b._id)!.trendingScore7d - scores.get(a._id)!.trendingScore7d);
    const trendingRanks = new Map(trending.map((s, i) => [s._id, i + 1]));

    for (const s of all) {
      const rank = ranks.get(s._id);
      const trendingRank = trendingRanks.get(s._id);
      const sc = scores.get(s._id)!;
      const patch: Partial<Doc<"saas">> = { ...sc };
      if (s.rank !== rank) { patch.prevRank = s.rank; patch.rank = rank; }
      if (s.trendingRank !== trendingRank) { patch.prevTrendingRank = s.trendingRank; patch.trendingRank = trendingRank; }
      if (rank && (s.bestRank === undefined || rank < s.bestRank)) patch.bestRank = rank;
      await ctx.db.patch(s._id, patch);
      if (!s.isDemo) {
        await addMilestones(ctx, s._id, rankMilestones(s.rank, rank, s.name, s.bestRank));
        await addMilestones(ctx, s._id, trendingMilestones(s.trendingRank, trendingRank, s.name));
        await onRerank(ctx, s, s.rank, rank, eligible.length);
      }
    }
  },
});
