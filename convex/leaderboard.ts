import { internalMutation } from "./_generated/server";

// Verified + public SaaS ranked by new users in the last 30 days. Everything else loses its rank.
export const rerank = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ranked = await ctx.db
      .query("saas")
      .withIndex("by_public_trust_new30d", (q) => q.eq("isPublic", true).eq("trust", "verified"))
      .order("desc")
      .collect();
    const real = ranked.filter((s) => !s.isDemo);
    real.sort((a, b) => b.newUsers30d - a.newUsers30d || b.growth30dPct - a.growth30dPct || b.totalUsers - a.totalUsers);
    const rankedIds = new Set<string>();
    for (const [i, s] of real.entries()) {
      rankedIds.add(s._id);
      if (s.rank !== i + 1) await ctx.db.patch(s._id, { rank: i + 1 });
    }
    const others = await ctx.db.query("saas").collect();
    for (const s of others) {
      if (!rankedIds.has(s._id) && s.rank !== undefined) await ctx.db.patch(s._id, { rank: undefined });
    }
  },
});
