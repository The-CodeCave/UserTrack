import { describe, expect, it } from "vitest";
import { aggregateHistory, founderAggregates, type FounderProject } from "./founder";

const p = (o: Partial<FounderProject>): FounderProject => ({ name: "A", slug: "a", totalUsers: 0, newUsers7d: 0, newUsers30d: 0, trust: "verified", ...o });

describe("founderAggregates", () => {
  it("sums users and weights activation instead of averaging rates", () => {
    const a = founderAggregates([
      p({ slug: "a", totalUsers: 10_000, newUsers30d: 1_000, newUsersPrev30d: 500, activatedUsers: 5_000, rank: 12, trendingRank: 3 }),
      p({ slug: "b", name: "B", totalUsers: 100, newUsers30d: 50, newUsersPrev30d: 50, activatedUsers: 90, rank: 4 }),
      p({ slug: "c", name: "C", totalUsers: 400, newUsers30d: 20, newUsersPrev30d: 10, trust: "unverified" }),
    ]);
    expect(a.projectCount).toBe(3);
    expect(a.verifiedCount).toBe(2);
    expect(a.totalUsers).toBe(10_500);
    expect(a.newUsers30d).toBe(1_070);
    // (5000 + 90) / (10000 + 100) — not the mean of 50% and 90%.
    expect(a.activationRatePct).toBe(50.4);
    expect(a.activationProjects).toBe(2);
    expect(a.convertedUsers).toBeUndefined();
    expect(a.bestRank).toBe(4);
    expect(a.trendingCount).toBe(1);
    expect(a.biggestGrowth).toEqual({ slug: "a", name: "A", newUsers30d: 1_000 });
    expect(a.growth30dPct).toBe(11.3);
    expect(a.changeVsPrev30dPct).toBe(91.1);
  });
  it("handles a founder without projects", () => {
    const a = founderAggregates([]);
    expect(a).toMatchObject({ projectCount: 0, totalUsers: 0, newUsers30d: 0, growth30dPct: 0, activationRatePct: undefined, bestRank: undefined, biggestGrowth: undefined });
  });
  it("leaves the previous-window change undefined when any project lacks history", () => {
    expect(founderAggregates([p({ totalUsers: 10, newUsers30d: 5, newUsersPrev30d: 2 }), p({ totalUsers: 10, newUsers30d: 5 })]).changeVsPrev30dPct).toBeUndefined();
  });
});

describe("aggregateHistory", () => {
  it("forward-fills gaps per project and contributes 0 before the first row", () => {
    const out = aggregateHistory([
      [{ day: "2026-09-01", totalUsers: 100, newUsers: 5 }, { day: "2026-09-03", totalUsers: 120, newUsers: 10 }],
      [{ day: "2026-09-02", totalUsers: 10, newUsers: 10 }, { day: "2026-09-03", totalUsers: 12, newUsers: 2 }],
    ]);
    expect(out).toEqual([
      { day: "2026-09-01", total: 100, delta: 5, byProject: [100, 0] },
      { day: "2026-09-02", total: 110, delta: 10, byProject: [100, 10] },
      { day: "2026-09-03", total: 132, delta: 12, byProject: [120, 12] },
    ]);
  });
  it("returns nothing without history", () => {
    expect(aggregateHistory([[], []])).toEqual([]);
  });
});
