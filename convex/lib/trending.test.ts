import { describe, expect, it } from "vitest";
import { explainTrending, trendingFactors, trendingScore, type TrendingInput } from "./trending";

const base: TrendingInput = { newUsers: 120, prevNewUsers: 60, baseUsers: 900, trustScore: 80, lastSyncedAt: 1_000, firstSnapshotAt: 1_000 - 30 * 86_400_000, now: 1_000 };

describe("trending conversion factor", () => {
  it("is a small optional lift capped at 1.10", () => {
    expect(trendingFactors(base).conversion).toBe(1);
    expect(trendingFactors({ ...base, signupToConvertedPct: 0 }).conversion).toBe(1);
    expect(trendingFactors({ ...base, signupToConvertedPct: 12.5 }).conversion).toBeCloseTo(1.05);
    expect(trendingFactors({ ...base, signupToConvertedPct: 25 }).conversion).toBeCloseTo(1.1);
    expect(trendingFactors({ ...base, signupToConvertedPct: 80 }).conversion).toBeCloseTo(1.1);
    expect(trendingFactors({ ...base, signupToConvertedPct: -5 }).conversion).toBe(1);
  });
  it("cannot beat a product with meaningfully more verified new users", () => {
    const converting = trendingScore({ ...base, signupToConvertedPct: 40 });
    const growing = trendingScore({ ...base, newUsers: 180, prevNewUsers: 90 });
    expect(converting).toBeGreaterThan(trendingScore(base));
    expect(converting).toBeLessThanOrEqual(trendingScore(base) * 1.1 + 0.1);
    expect(growing).toBeGreaterThan(converting);
  });
  it("shows up in the explanation", () => {
    expect(explainTrending({ ...base, activationRatePct: 61, signupToConvertedPct: 6.4 })).toBe("2.0× prev period · +13% relative · 61% activate · 6% convert");
    expect(explainTrending(base)).not.toContain("convert");
  });
});
