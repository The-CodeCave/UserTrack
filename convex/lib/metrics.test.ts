import { describe, expect, it } from "vitest";
import { growthPct, toSeries, windowDelta } from "./metrics";
import { dayKey } from "./time";

describe("metrics", () => {
  const first = { capturedAt: 1, totalUsers: 100 };
  it("uses baseline when present, first snapshot otherwise", () => {
    expect(windowDelta(150, { capturedAt: 5, totalUsers: 120 }, first)).toBe(30);
    expect(windowDelta(150, null, first)).toBe(50);
    expect(windowDelta(150, null, null)).toBe(0);
  });
  it("growth pct rounds to one decimal and guards zero", () => {
    expect(growthPct(150, null, first)).toBe(50);
    expect(growthPct(133, null, first)).toBe(33);
    expect(growthPct(10, null, { capturedAt: 0, totalUsers: 0 })).toBe(0);
  });
  it("series deltas", () => {
    expect(toSeries([{ capturedAt: 1, totalUsers: 10 }, { capturedAt: 2, totalUsers: 15 }])).toEqual([
      { t: 1, total: 10, delta: 0 },
      { t: 2, total: 15, delta: 5 },
    ]);
  });
  it("day key is UTC", () => {
    expect(dayKey(Date.UTC(2026, 8, 1, 23, 59))).toBe("2026-09-01");
  });
});
