import { describe, expect, it } from "vitest";
import {
  crossedThresholds, enteredRankThresholds, evaluateNoGrowth, evaluateSpike, isUnhealthy, monthLabel, monthRange, monthlySummary, nextLocalHour, previousMonthKey, projectReport, isValidTimezone,
} from "./emailRules";

const DAY = 86_400_000;

describe("user thresholds", () => {
  it("returns every threshold crossed between two totals, in order", () => {
    expect(crossedThresholds(90, 1200)).toEqual([100, 250, 500, 1000]);
    expect(crossedThresholds(1200, 1300)).toEqual([]);
    expect(crossedThresholds(9, 10)).toEqual([10]);
  });
  it("never fires on the first snapshot", () => {
    expect(crossedThresholds(null, 50_000)).toEqual([]);
  });
});

describe("rank thresholds", () => {
  it("fires when entering a tier the board is big enough for", () => {
    expect(enteredRankThresholds(undefined, 8, 200)).toEqual([100, 50, 25, 10]);
    expect(enteredRankThresholds(12, 9, 200)).toEqual([10]);
    expect(enteredRankThresholds(9, 8, 200)).toEqual([]);
    expect(enteredRankThresholds(2, 1, 200)).toEqual([1]);
  });
  it("stays quiet for trivial rankings on a small board", () => {
    expect(enteredRankThresholds(undefined, 3, 4)).toEqual([1].filter(() => false));
    expect(enteredRankThresholds(undefined, 1, 4)).toEqual([1]);
    expect(enteredRankThresholds(undefined, 3, 12)).toEqual([10, 5]);
  });
  it("does not resend when re-entering", () => {
    // Re-entry is prevented by the dedupe key, but falling and rising within the same tier is not a crossing.
    expect(enteredRankThresholds(11, 10, 100)).toEqual([10].filter((t) => 100 > t));
    expect(enteredRankThresholds(4, 5, 100)).toEqual([]);
  });
});

describe("spike", () => {
  const flat = Array(30).fill(10);
  it("needs history, a floor and a real multiple", () => {
    expect(evaluateSpike({ dailyNewUsers: Array(5).fill(10), last24h: 100, now: 0 })).toBeNull();
    expect(evaluateSpike({ dailyNewUsers: flat, last24h: 24, now: 0 })).toBeNull();
    expect(evaluateSpike({ dailyNewUsers: Array(30).fill(2), last24h: 19, now: 0 })).toBeNull();
    expect(evaluateSpike({ dailyNewUsers: flat, last24h: 28, now: 0 })).toEqual({ multiple: 2.8, average: 10, days: 30 });
  });
  it("respects the 7-day cooldown", () => {
    const now = 100 * DAY;
    expect(evaluateSpike({ dailyNewUsers: flat, last24h: 50, lastSpikeAt: now - 2 * DAY, now })).toBeNull();
    expect(evaluateSpike({ dailyNewUsers: flat, last24h: 50, lastSpikeAt: now - 8 * DAY, now })).not.toBeNull();
  });
  it("ignores products with no baseline", () => {
    expect(evaluateSpike({ dailyNewUsers: Array(20).fill(0), last24h: 40, now: 0 })).toBeNull();
  });
});

describe("source health", () => {
  const now = 10 * DAY;
  it("is not unhealthy after a transient failure", () => {
    expect(isUnhealthy({ consecutiveFailures: 1, lastSuccessAt: now - 3_600_000, connectedAt: 0, now })).toBe(false);
    expect(isUnhealthy({ consecutiveFailures: 3, lastSuccessAt: now - 3_600_000, connectedAt: 0, now })).toBe(false);
  });
  it("is unhealthy after two failed cycles or a silent day", () => {
    expect(isUnhealthy({ consecutiveFailures: 6, lastSuccessAt: now - 3_600_000, connectedAt: 0, now })).toBe(true);
    expect(isUnhealthy({ consecutiveFailures: 3, lastSuccessAt: now - 25 * 3_600_000, connectedAt: 0, now })).toBe(true);
    expect(isUnhealthy({ consecutiveFailures: 3, connectedAt: now - 2 * DAY, now })).toBe(true);
  });
});

describe("no growth", () => {
  const daily = (values: number[]) => values.map((n, i) => ({ day: `2026-08-${String(i + 1).padStart(2, "0")}`, newUsers: n }));
  it("requires traction, health, publicity and a full quiet week", () => {
    const base = { totalUsers: 500, newUsers7d: 0, newUsers30d: 40, sourceHealthy: true, isPublic: true, daily: daily([5, 5, 5, 0, 0, 0, 0, 0, 0, 0]) };
    expect(evaluateNoGrowth(base)).toEqual({ periodStart: "2026-08-03" });
    expect(evaluateNoGrowth({ ...base, sourceHealthy: false })).toBeNull();
    expect(evaluateNoGrowth({ ...base, isPublic: false })).toBeNull();
    expect(evaluateNoGrowth({ ...base, totalUsers: 20 })).toBeNull();
    expect(evaluateNoGrowth({ ...base, newUsers30d: 3 })).toBeNull();
    expect(evaluateNoGrowth({ ...base, newUsers7d: 1 })).toBeNull();
    expect(evaluateNoGrowth({ ...base, daily: daily([5, 5, 5, 0, 0, 0, 1, 0, 0, 0]) })).toBeNull();
  });
});

describe("monthly report", () => {
  it("period helpers use the completed calendar month", () => {
    expect(previousMonthKey(Date.UTC(2026, 8, 1, 5))).toBe("2026-08");
    expect(previousMonthKey(Date.UTC(2026, 0, 1))).toBe("2025-12");
    expect(monthRange("2026-08")).toMatchObject({ firstDay: "2026-08-01", lastDayExclusive: "2026-09-01" });
    expect(monthLabel("2026-08")).toBe("August 2026");
  });
  const saas = { _id: "s1", name: "Acme", slug: "acme", isPublic: true, totalUsers: 1300 };
  it("aggregates per project with activation and rank", () => {
    const before = { day: "2026-07-31", totalUsers: 1000, newUsers: 10, activatedUsers: 400, rank: 14 };
    const rows = [
      { day: "2026-08-01", totalUsers: 1100, newUsers: 100, activatedUsers: 420, rank: 12 },
      { day: "2026-08-15", totalUsers: 1250, newUsers: 150, activatedUsers: 500, rank: 9 },
      { day: "2026-08-31", totalUsers: 1300, newUsers: 50, activatedUsers: 520, rank: 8 },
    ];
    const p = projectReport(saas, before, rows, [{ title: "1,000 users", achievedAt: 1 }]);
    expect(p).toMatchObject({ usersStart: 1000, usersEnd: 1300, newUsers: 300, netGrowth: 300, growthPct: 30, activatedStart: 400, activatedEnd: 520, newActivated: 120, activationRatePct: 40, rankStart: 14, rankEnd: 8, hasData: true });
    expect(p.bestDay).toEqual({ day: "2026-08-15", newUsers: 150 });
  });
  it("handles missing data, zero growth and no activation", () => {
    expect(projectReport(saas, null, [], [])).toMatchObject({ hasData: false, newUsers: 0, usersStart: 0, usersEnd: 0, growthPct: null });
    const zero = projectReport(saas, { day: "2026-07-31", totalUsers: 500, newUsers: 0 }, [{ day: "2026-08-10", totalUsers: 500, newUsers: 0 }], []);
    expect(zero).toMatchObject({ hasData: true, newUsers: 0, growthPct: 0, activatedEnd: undefined, newActivated: undefined, rankStart: undefined, bestDay: undefined });
    const noBefore = projectReport(saas, null, [{ day: "2026-08-10", totalUsers: 500, newUsers: 20 }, { day: "2026-08-11", totalUsers: 530, newUsers: 30 }], []);
    expect(noBefore).toMatchObject({ usersStart: 500, usersEnd: 530, newUsers: 50 });
  });
  it("summarises multiple projects", () => {
    const a = projectReport(saas, { day: "2026-07-31", totalUsers: 1000, newUsers: 0 }, [{ day: "2026-08-31", totalUsers: 1300, newUsers: 300 }], [{ title: "1,000 users", achievedAt: 5 }]);
    const b = projectReport({ ...saas, _id: "s2", name: "Beta", slug: "beta" }, { day: "2026-07-31", totalUsers: 100, newUsers: 0 }, [{ day: "2026-08-31", totalUsers: 120, newUsers: 20 }], []);
    const c = projectReport({ ...saas, _id: "s3", name: "Gamma", slug: "gamma" }, null, [], []);
    const s = monthlySummary("2026-08", [a, b, c], 0);
    expect(s.summary).toEqual({ totalNewUsers: 320, totalUsersEnd: 1420, strongest: "Acme", biggestMilestone: "Acme: 1,000 users", aggregateGrowthPct: 29.1 });
    expect(s.label).toBe("August 2026");
  });
});

describe("delivery time", () => {
  it("lands at 09:00 local, next day if already past", () => {
    const sep1_05utc = Date.UTC(2026, 8, 1, 5);
    expect(new Date(nextLocalHour(sep1_05utc, "Europe/Berlin")).toISOString()).toBe("2026-09-01T07:00:00.000Z");
    expect(new Date(nextLocalHour(sep1_05utc, "America/Los_Angeles")).toISOString()).toBe("2026-09-01T16:00:00.000Z");
    expect(new Date(nextLocalHour(sep1_05utc, "Asia/Tokyo")).toISOString()).toBe("2026-09-02T00:00:00.000Z");
    expect(new Date(nextLocalHour(sep1_05utc, undefined)).toISOString()).toBe("2026-09-01T09:00:00.000Z");
    expect(new Date(nextLocalHour(sep1_05utc, "Not/AZone")).toISOString()).toBe("2026-09-01T09:00:00.000Z");
  });
  it("validates timezones", () => {
    expect(isValidTimezone("Europe/Berlin")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
  });
});
