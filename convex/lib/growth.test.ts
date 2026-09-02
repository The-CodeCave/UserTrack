import { describe, expect, it } from "vitest";
import { explainTrending, trendingFactors, trendingScore } from "./trending";
import { checkSnapshot, publicTrustLabel, trustScore, trustState } from "./trust";
import { dailyMilestones, rankMilestones, thresholdMilestones, streakDays } from "./milestones";
import { detectSpike } from "./spikes";
import { estimateRetention } from "./retention";
import { deciles, percentileOf } from "./benchmarks";
import { previousWindowDelta, sizeBucket } from "./metrics";
import { weekKey } from "./time";

describe("trending", () => {
  it("does not let tiny products dominate", () => {
    const tiny = trendingScore({ newUsers: 4, prevNewUsers: 1, baseUsers: 1 });
    const small = trendingScore({ newUsers: 40, prevNewUsers: 10, baseUsers: 60 });
    const big = trendingScore({ newUsers: 4000, prevNewUsers: 3000, baseUsers: 100_000 });
    expect(tiny).toBe(0);
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
  });
  it("rewards acceleration and trust", () => {
    const base = { newUsers: 500, prevNewUsers: 500, baseUsers: 5000 };
    expect(trendingScore({ ...base, prevNewUsers: 100 })).toBeGreaterThan(trendingScore(base));
    expect(trendingScore({ ...base, trustScore: 90 })).toBeGreaterThan(trendingScore({ ...base, trustScore: 30 }));
    expect(trendingScore({ ...base, activationRatePct: 80 })).toBeGreaterThan(trendingScore(base));
  });
  it("does not let huge products win on scale alone", () => {
    const mid = trendingScore({ newUsers: 800, prevNewUsers: 300, baseUsers: 4000 });
    const huge = trendingScore({ newUsers: 3000, prevNewUsers: 3200, baseUsers: 900_000 });
    expect(mid).toBeGreaterThan(huge);
  });
  it("penalises stale sources and short history, never boosts", () => {
    const now = 100 * 86_400_000;
    const base = { newUsers: 200, prevNewUsers: 150, baseUsers: 2000, now, firstSnapshotAt: 0 };
    const fresh = trendingScore({ ...base, lastSyncedAt: now - 3_600_000 });
    const aging = trendingScore({ ...base, lastSyncedAt: now - 48 * 3_600_000 });
    const stale = trendingScore({ ...base, lastSyncedAt: now - 80 * 3_600_000 });
    expect(fresh).toBeGreaterThan(aging);
    expect(aging).toBeGreaterThan(0);
    expect(stale).toBe(0);
    expect(trendingFactors({ ...base, lastSyncedAt: now - 48 * 3_600_000 }).freshness).toBeCloseTo(0.75, 5);
    const young = trendingScore({ ...base, lastSyncedAt: now, firstSnapshotAt: now - 3 * 86_400_000 });
    expect(young).toBeLessThan(fresh);
    expect(trendingFactors({ ...base, lastSyncedAt: now, firstSnapshotAt: now - 3 * 86_400_000 }).history).toBeCloseTo(0.6 + 0.4 * (3 / 14), 5);
    expect(trendingScore({ ...base, lastSyncedAt: now, underReview: true })).toBe(0);
    expect(trendingFactors(base).freshness).toBe(1);
  });
  it("is deterministic and explainable", () => {
    const i = { newUsers: 120, prevNewUsers: 60, baseUsers: 900, activationRatePct: 55 };
    expect(trendingScore(i)).toBe(trendingScore({ ...i }));
    expect(explainTrending(i)).toBe("2.0× prev period · +13% relative · 55% activate");
    expect(explainTrending({ ...i, now: 10 * 86_400_000, lastSyncedAt: 0 })).toContain("stale source");
  });
});

describe("trust", () => {
  const now = 30 * 86_400_000;
  it("scores by provider, age, continuity", () => {
    const ok = Array(10).fill({ status: "ok" as const });
    expect(trustScore({ provider: "clerk", trust: "verified", connectedAt: 0, now, recentRuns: ok, openFlags: [] })).toBe(85);
    expect(trustScore({ provider: "manual", trust: "unverified", connectedAt: now, now, recentRuns: ok, openFlags: [] })).toBe(25);
    expect(trustScore({ provider: "clerk", trust: "verified", connectedAt: 0, now, recentRuns: ok, openFlags: [{ severity: "high" }] })).toBe(70);
  });
  it("states and labels stay neutral", () => {
    expect(trustState(80, [])).toBe("healthy");
    expect(trustState(80, [{ severity: "high" }])).toBe("review");
    expect(trustState(20, [])).toBe("low_confidence");
    expect(publicTrustLabel("verified", "review", 80)).toBe("Data under review");
    expect(publicTrustLabel("verified", "healthy", 50)).toBe("Partially verified");
    expect(publicTrustLabel("unverified", "healthy", 90)).toBe("Self-reported");
  });
  it("flags impossible growth and drops, not organic growth", () => {
    expect(checkSnapshot({ prevTotal: 1000, newTotal: 1100, elapsedMs: 4 * 3.6e6, provider: "clerk", reconnectsLast7d: 0 })).toEqual([]);
    expect(checkSnapshot({ prevTotal: 1000, newTotal: 9000, elapsedMs: 4 * 3.6e6, provider: "clerk", reconnectsLast7d: 0 })[0].kind).toBe("impossible_growth");
    expect(checkSnapshot({ prevTotal: 1000, newTotal: 400, elapsedMs: 4 * 3.6e6, provider: "clerk", reconnectsLast7d: 0 })[0]).toMatchObject({ kind: "sudden_drop", severity: "high" });
    expect(checkSnapshot({ prevTotal: 100, newTotal: 100, elapsedMs: 1, provider: "clerk", reconnectsLast7d: 4 })[0].kind).toBe("reconnect_churn");
    expect(checkSnapshot({ prevTotal: 100, newTotal: 100, elapsedMs: 1, provider: "clerk", reconnectsLast7d: 0, activatedUsers: 200 })[0].kind).toBe("activation_exceeds_users");
  });
});

describe("milestones", () => {
  it("crosses thresholds once", () => {
    expect(thresholdMilestones(90, 1200, "Acme").map((m) => m.value)).toEqual([100, 500, 1000]);
    expect(thresholdMilestones(1200, 1300, "Acme")).toEqual([]);
    expect(thresholdMilestones(null, 12, "Acme").map((m) => m.value)).toEqual([10]);
  });
  it("rank milestones", () => {
    expect(rankMilestones(undefined, 8, "Acme", undefined).map((m) => m.kind)).toEqual(["top10", "top100"]);
    expect(rankMilestones(9, 2, "Acme", 5).map((m) => m.key)).toEqual(["rank:2"]);
    expect(rankMilestones(2, 2, "Acme", 2)).toEqual([]);
  });
  it("daily milestones: best day, streak, monthly growth", () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({ day: `2026-08-${String(i + 1).padStart(2, "0")}`, newUsers: i === 20 ? 300 : 10 }));
    const ms = dailyMilestones(rows, "Acme", 60, new Set());
    expect(ms.find((m) => m.kind === "best_day")?.value).toBe(300);
    expect(ms.filter((m) => m.kind === "streak").map((m) => m.value)).toEqual([7, 30]);
    expect(ms.filter((m) => m.kind === "monthly_growth").map((m) => m.value)).toEqual([25, 50]);
    expect(dailyMilestones(rows, "Acme", 60, new Set(ms.map((m) => m.key)))).toEqual([]);
    expect(streakDays(rows)).toBe(30);
  });
});

describe("spikes / retention / benchmarks / misc", () => {
  it("spike detection", () => {
    expect(detectSpike([10, 12, 9, 11, 10, 10, 10], 40)).toEqual({ multiple: 3.9, average: 10 });
    expect(detectSpike([10, 12, 9, 11, 10], 15)).toBeNull();
    expect(detectSpike([1, 1, 1, 1, 1], 5)).toBeNull();
  });
  it("retention estimate", () => {
    expect(estimateRetention({ totalUsers: 1000, newUsers30d: 200, activeUsers30d: 600 })).toEqual({ cohort: 800, retained: 400, churned: 400, ratePct: 50 });
    expect(estimateRetention({ totalUsers: 10, newUsers30d: 0, activeUsers30d: 5 })).toBeNull();
  });
  it("deciles + percentile", () => {
    const d = deciles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(d[4]).toBeCloseTo(5.5);
    expect(percentileOf(0, d)).toBe(5);
    expect(percentileOf(5.5, d)).toBe(50);
    expect(percentileOf(100, d)).toBe(95);
  });
  it("previous window + buckets + week key", () => {
    expect(previousWindowDelta({ capturedAt: 2, totalUsers: 150 }, { capturedAt: 1, totalUsers: 100 }, null)).toBe(50);
    expect(previousWindowDelta(null, null, { capturedAt: 0, totalUsers: 1 })).toBe(0);
    expect(sizeBucket(0)).toBe("0-100");
    expect(sizeBucket(1000)).toBe("1k-10k");
    expect(sizeBucket(5_000_000)).toBe("100k+");
    expect(weekKey(Date.UTC(2026, 8, 2))).toBe("2026-W36");
  });
});
