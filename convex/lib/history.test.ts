import { describe, expect, it } from "vitest";
import { downsample, findGaps, isRankJump, rankMovement, reconstructTotals, resolutionFor } from "./history";

const DAY = 86_400_000;
const day = (d: number) => new Date(Date.UTC(2026, 0, 1) + d * DAY).toISOString().slice(0, 10);

describe("resolutionFor", () => {
  it("maps ranges to storage resolutions", () => {
    expect(resolutionFor("24h")).toBe("raw");
    expect(resolutionFor("7d")).toBe("raw");
    expect(resolutionFor("30d")).toBe("day");
    expect(resolutionFor("90d")).toBe("day");
    expect(resolutionFor("1y")).toBe("week");
    expect(resolutionFor("all", 400)).toBe("week");
    expect(resolutionFor("all", 900)).toBe("month");
  });
});

describe("downsample", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ day: day(i), totalUsers: 100 + i * 10, newUsers: 10, activatedUsers: 50 + i, visitors: 5 }));

  it("keeps daily rows as they are", () => {
    expect(downsample(rows, "day").length).toBe(60);
    expect(downsample(rows, "day")[0]).toMatchObject({ total: 100, delta: 10, activated: 50, visitors: 5 });
  });

  it("collapses weeks: last total, summed new users and visitors, last activated", () => {
    const weekly = downsample(rows, "week");
    expect(weekly.length).toBeGreaterThanOrEqual(9);
    expect(weekly.length).toBeLessThanOrEqual(10);
    const full = weekly[1];
    expect(full.delta).toBe(70);
    expect(full.visitors).toBe(35);
    expect(weekly.reduce((a, p) => a + p.delta, 0)).toBe(600);
    expect(weekly[weekly.length - 1].total).toBe(100 + 59 * 10);
  });

  it("collapses months and never invents points for missing buckets", () => {
    const sparse = [rows[0], rows[1], rows[40], rows[41]];
    const monthly = downsample(sparse, "month");
    expect(monthly.map((p) => new Date(p.t).toISOString().slice(0, 7))).toEqual(["2026-01", "2026-02"]);
    expect(monthly[0].delta).toBe(20);
    expect(monthly[1].total).toBe(rows[41].totalUsers);
  });
});

describe("findGaps", () => {
  it("reports stretches without stored rows", () => {
    const pts = [0, 1, 2, 9, 10, 30].map((d) => ({ t: d * DAY }));
    expect(findGaps(pts)).toEqual([{ from: 2 * DAY, to: 9 * DAY, days: 7 }, { from: 10 * DAY, to: 30 * DAY, days: 20 }]);
    expect(findGaps(pts, 25)).toEqual([]);
    expect(findGaps([])).toEqual([]);
  });
});

describe("rank movement", () => {
  it("derives up / down / same / new from stored positions", () => {
    expect(rankMovement(undefined, undefined)).toBeNull();
    expect(rankMovement(undefined, 3)).toEqual({ kind: "new", delta: 0 });
    expect(rankMovement(10, 3)).toEqual({ kind: "up", delta: 7 });
    expect(rankMovement(3, 10)).toEqual({ kind: "down", delta: -7 });
    expect(rankMovement(4, 4)).toEqual({ kind: "same", delta: 0 });
  });

  it("flags rank jumps only for large climbs into the top 50", () => {
    expect(isRankJump(78, 31)).toBe(true);
    expect(isRankJump(14, 6)).toBe(false);
    expect(isRankJump(120, 60)).toBe(false);
    expect(isRankJump(undefined, 5)).toBe(false);
    expect(isRankJump(20, 30)).toBe(false);
  });
});

describe("reconstructTotals", () => {
  it("walks back from the live total, subtracts today without emitting it, and returns the baseline before the first point", () => {
    const points = [{ day: day(0), value: 20 }, { day: day(1), value: 10 }, { day: day(2), value: 5 }];
    const { totals, before } = reconstructTotals(points, 100, day(2));
    // End of day(1) = 100 − today's 5; end of day(0) = 95 − 10.
    expect(totals).toEqual([{ day: day(0), value: 85 }, { day: day(1), value: 95 }]);
    expect(before).toBe(65);
  });
  it("is order-independent, clamps at zero (hard deletes) and keeps deltas exact across chunk boundaries", () => {
    const series = Array.from({ length: 800 }, (_, i) => ({ day: day(i), value: 1 })).reverse();
    const { totals, before } = reconstructTotals(series, 700, day(800));
    expect(totals).toHaveLength(800);
    expect(totals[799]).toEqual({ day: day(799), value: 700 });
    expect(totals[0]).toEqual({ day: day(0), value: 0 });
    expect(totals[100].value).toBe(1);
    expect(before).toBe(0);
    for (let i = 365; i < 800; i++) expect(totals[i].value - totals[i - 1].value).toBe(i < 100 ? 0 : 1);
  });
});
