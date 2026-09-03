import { describe, expect, it } from "vitest";
import { BENCHMARK_METRICS, BENCHMARK_METRIC_BASIS, BENCHMARK_METRIC_LABEL, CONVERSION_BENCHMARK_METRICS, MIN_SAMPLE, MIN_SAMPLE_CONVERSION, acceleration30dPct, ageBucket, benchmarkInsight, benchmarkValue, cohortsFor, deciles, describeCohort, isConversionBenchmark, medianMultiple, percentileChangeInsight, percentileOf, publicBenchmarkStatement, topBand } from "./benchmarks";

const DEC = [10, 20, 30, 40, 50, 60, 70, 80, 90];

describe("deciles", () => {
  it("interpolates p10..p90", () => {
    expect(deciles([])).toEqual([]);
    expect(deciles([5, 1, 4, 2, 3]).map((d) => Number(d.toFixed(2)))).toEqual([1.4, 1.8, 2.2, 2.6, 3, 3.4, 3.8, 4.2, 4.6]);
    expect(deciles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).map((d) => Number(d.toFixed(2)))).toEqual([1.9, 2.8, 3.7, 4.6, 5.5, 6.4, 7.3, 8.2, 9.1]);
  });
});

describe("percentileOf", () => {
  it("clamps and rounds to 5", () => {
    expect(percentileOf(1, [1, 2])).toBeNull();
    expect(percentileOf(3, DEC)).toBe(5);
    expect(percentileOf(10, DEC)).toBe(5);
    expect(percentileOf(95, DEC)).toBe(95);
    expect(percentileOf(90, DEC)).toBe(95);
    expect(percentileOf(50, DEC)).toBe(50);
    expect(percentileOf(42, DEC)).toBe(40);
    expect(percentileOf(43, DEC)).toBe(45);
    expect(percentileOf(47, DEC)).toBe(45);
  });
});

describe("medianMultiple", () => {
  it("needs a positive median", () => {
    expect(medianMultiple(10, 0)).toBeNull();
    expect(medianMultiple(-1, 10)).toBeNull();
    expect(medianMultiple(18, 10)).toBe(1.8);
    expect(medianMultiple(1, 3)).toBe(0.3);
  });
});

describe("benchmarkInsight", () => {
  const base = { metricLabel: "30-day growth", groupLabel: "AI tools", value: 18, median: 10 };
  it("wording per position", () => {
    expect(benchmarkInsight({ ...base, percentile: 90 })).toBe("Your 30-day growth is ahead of 90% of AI tools. Top 10%.");
    expect(benchmarkInsight({ ...base, percentile: 60 })).toBe("Your 30-day growth is ahead of 60% of AI tools. 1.8× the median.");
    expect(benchmarkInsight({ ...base, percentile: 60, value: 11 })).toBe("Your 30-day growth is ahead of 60% of AI tools.");
    expect(benchmarkInsight({ ...base, percentile: 30, value: 5 })).toBe("Your 30-day growth is behind 70% of AI tools.");
  });
});

describe("publicBenchmarkStatement", () => {
  it("only for strong positions", () => {
    const i = { metricLabel: "30-day growth", groupLabel: "AI tools" };
    expect(publicBenchmarkStatement({ ...i, percentile: 70 })).toBeNull();
    expect(publicBenchmarkStatement({ ...i, percentile: 75 })).toBe("Top 25% 30-day growth in AI tools");
    expect(publicBenchmarkStatement({ ...i, percentile: 90 })).toBe("Top 10% 30-day growth in AI tools");
  });
});

describe("conversion metrics", () => {
  it("are registered as aggregate-basis metrics with founder-facing labels", () => {
    for (const m of CONVERSION_BENCHMARK_METRICS) {
      expect(BENCHMARK_METRICS).toContain(m);
      expect(BENCHMARK_METRIC_BASIS[m]).toBe("aggregate");
      expect(isConversionBenchmark(m)).toBe(true);
    }
    expect(isConversionBenchmark("growth30dPct")).toBe(false);
    expect(MIN_SAMPLE_CONVERSION).toBeGreaterThanOrEqual(5);
  });
  it("insight sentences read naturally", () => {
    expect(benchmarkInsight({ metricLabel: BENCHMARK_METRIC_LABEL.signupToConvertedPct, groupLabel: "SaaS with 1k-5k users", percentile: 65, value: 8, median: 5 })).toBe("Your signup → converted rate is ahead of 65% of SaaS with 1k-5k users. 1.6× the median.");
    expect(benchmarkInsight({ metricLabel: BENCHMARK_METRIC_LABEL.convertedGrowth30dPct, groupLabel: "all SaaS on UserTrack", percentile: 90, value: 30, median: 10 })).toBe("Your converted-user growth (30d) is ahead of 90% of all SaaS on UserTrack. Top 10%.");
    expect(publicBenchmarkStatement({ metricLabel: BENCHMARK_METRIC_LABEL.trialToConvertedPct, groupLabel: "Developer Tools", percentile: 85 })).toBe("Top 15% trial → converted rate in Developer Tools");
  });
});

describe("cohorts v2", () => {
  const DAY = 86_400_000;
  const now = Date.UTC(2026, 8, 3);
  const base = { totalUsers: 2500, newUsers30d: 400, newUsersPrev30d: 200, growth30dPct: 19, category: "ai" as const, projectType: "mobile" as const, firstSnapshotAt: now - 200 * DAY };

  it("builds category, category×size, size, platform, tracked-age and all cohorts in that order", () => {
    const keys = cohortsFor(base, now).map((c) => c.key);
    expect(keys).toEqual(["cat:ai", "cat:ai|size:1k-10k", "size:1k-10k", "platform:mobile", "tracked:6-12m", "all"]);
    expect(cohortsFor(base, now).find((c) => c.key === "cat:ai|size:1k-10k")?.label).toBe("AI SaaS with 1K – 10K users");
    expect(cohortsFor(base, now).find((c) => c.dimension === "tracked")?.label).toBe("products tracked on UserTrack for 6–12 months");
  });

  it("uses the founder-entered founding date as a separate age family, never mixed with tracking age", () => {
    const keys = cohortsFor({ ...base, foundedAt: now - 800 * DAY }, now).map((c) => c.key);
    expect(keys).toContain("age:2y+");
    expect(keys.some((k) => k.startsWith("tracked:"))).toBe(false);
    expect(describeCohort("age:2y+")).toMatch(/founder-entered/);
    expect(describeCohort("tracked:3-6m")).toMatch(/tracked on UserTrack for 3–6 months/);
  });

  it("skips the category cohorts for uncategorized products and defaults the platform to web", () => {
    const keys = cohortsFor({ ...base, category: undefined, projectType: undefined, firstSnapshotAt: undefined }, now).map((c) => c.key);
    expect(keys).toEqual(["size:1k-10k", "platform:web", "all"]);
  });

  it("buckets age deterministically at the boundaries", () => {
    expect(ageBucket(now - 89 * DAY, now)).toBe("lt3m");
    expect(ageBucket(now - 90 * DAY, now)).toBe("3-6m");
    expect(ageBucket(now - 365 * DAY, now)).toBe("1-2y");
    expect(ageBucket(now - 5000 * DAY, now)).toBe("2y+");
  });

  it("computes growth acceleration only with a meaningful previous window", () => {
    expect(acceleration30dPct({ newUsers30d: 400, newUsersPrev30d: 200 })).toBe(100);
    expect(acceleration30dPct({ newUsers30d: 100, newUsersPrev30d: 200 })).toBe(-50);
    expect(acceleration30dPct({ newUsers30d: 400, newUsersPrev30d: 5 })).toBeUndefined();
    expect(acceleration30dPct({ newUsers30d: 400 })).toBeUndefined();
    expect(benchmarkValue(base, "acceleration30dPct")).toBe(100);
    expect(benchmarkValue(base, "activationRatePct")).toBeUndefined();
    expect(benchmarkValue({ ...base, growth30dPct: Number.NaN }, "growth30dPct")).toBeUndefined();
  });

  it("raises the sample floor to 10 and describes changes without false precision", () => {
    expect(MIN_SAMPLE).toBe(10);
    expect(percentileChangeInsight({ metricLabel: "activation rate", percentile: 70, previousPercentile: 55, sinceLabel: "last month" })).toBe("Your activation rate improved from the 55th to the 70th percentile since last month.");
    expect(percentileChangeInsight({ metricLabel: "activation rate", percentile: 45, previousPercentile: 60, sinceLabel: "last month" })).toBe("Your activation rate slipped from the 60th to the 45th percentile since last month.");
    expect(percentileChangeInsight({ metricLabel: "activation rate", percentile: 60, previousPercentile: 55, sinceLabel: "last month" })).toBeNull();
    expect(topBand(95)).toBe("Top 5%");
    expect(topBand(85)).toBe("Top 20%");
    expect(topBand(75)).toBe("Top 25%");
    expect(topBand(70)).toBeNull();
  });
});
