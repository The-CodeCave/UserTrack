import { describe, expect, it } from "vitest";
import { benchmarkInsight, deciles, medianMultiple, percentileOf, publicBenchmarkStatement } from "./benchmarks";

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
