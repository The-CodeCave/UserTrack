import { describe, expect, it } from "vitest";
import { benchmarkShareKey, botWorthy, shareCategoryFor, shareScore } from "./shareRules";

describe("share rules", () => {
  it("only significant milestones become share events", () => {
    expect(shareCategoryFor({ kind: "users", value: 10 })).toBeNull();
    expect(shareCategoryFor({ kind: "users", value: 100 })).toBe("userMilestones");
    expect(shareCategoryFor({ kind: "activated", value: 500 })).toBeNull();
    expect(shareCategoryFor({ kind: "activated", value: 1000 })).toBe("userMilestones");
    expect(shareCategoryFor({ kind: "top100", value: 80 })).toBe("leaderboardMilestones");
    expect(shareCategoryFor({ kind: "trending_top10", value: 4 })).toBe("leaderboardMilestones");
    expect(shareCategoryFor({ kind: "best_day", value: 40 })).toBeNull();
    expect(shareCategoryFor({ kind: "best_week", value: 120 })).toBe("growthRecords");
    expect(shareCategoryFor({ kind: "streak", value: 7 })).toBeNull();
    expect(shareCategoryFor({ kind: "streak", value: 30 })).toBe("growthRecords");
    expect(shareCategoryFor({ kind: "monthly_growth", value: 25 })).toBe("monthlyGrowth");
    expect(shareCategoryFor({ kind: "spike", value: 2.5 })).toBeNull();
    expect(shareCategoryFor({ kind: "spike", value: 3.1 })).toBe("growthRecords");
    expect(shareCategoryFor({ kind: "benchmark", value: 85 })).toBeNull();
    expect(shareCategoryFor({ kind: "benchmark", value: 90 })).toBe("activationBenchmarks");
    expect(shareCategoryFor({ kind: "launched", value: 0 })).toBeNull();
  });
  it("ranks big user milestones and top ranks first", () => {
    expect(shareScore({ kind: "rank", value: 1 })).toBeGreaterThan(shareScore({ kind: "users", value: 10_000 }));
    expect(shareScore({ kind: "users", value: 100_000 })).toBeGreaterThan(shareScore({ kind: "users", value: 100 }));
    expect(shareScore({ kind: "top10", value: 8 })).toBeGreaterThan(shareScore({ kind: "streak", value: 30 }));
    expect(shareScore({ kind: "users", value: 1_000_000 })).toBeLessThanOrEqual(100);
  });
  it("keys benchmark cards per metric and month", () => {
    expect(benchmarkShareKey("activationRatePct", Date.UTC(2026, 8, 3))).toBe("bench:activationRatePct:2026-09");
  });
  it("the bot account only posts verified, major events", () => {
    expect(botWorthy({ kind: "users", value: 1000, verified: true })).toBe(true);
    expect(botWorthy({ kind: "users", value: 1000, verified: false })).toBe(false);
    expect(botWorthy({ kind: "users", value: 500, verified: true })).toBe(false);
    expect(botWorthy({ kind: "rank", value: 3, verified: true })).toBe(true);
    expect(botWorthy({ kind: "best_day", value: 900, verified: true })).toBe(false);
  });
});
