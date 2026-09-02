import { describe, expect, it } from "vitest";
import { buildFunnel, type FunnelSource } from "./funnel";

const src = (provider: string, verification: FunnelSource["verification"] = "verified"): FunnelSource => ({ provider, label: provider, verification });
const saas = { newUsers7d: 70, newUsers30d: 300, newUsersPrev7d: 50, newUsersPrev30d: 250, activated7d: 40, activated30d: 150, activatedUsers: 900, visitors30d: 5000, visitorsPrev30d: 4000, payingUsers: 61 };
const day = (i: number, extra: Record<string, number | undefined> = {}) => ({ day: `2026-08-${String(i).padStart(2, "0")}`, newUsers: 10, ...extra });

describe("funnel", () => {
  it("renders the full funnel with conversions and previous-period deltas", () => {
    const cur = Array.from({ length: 7 }, (_, i) => day(10 + i, { newActivated: 5, visitors: 100, payingUsers: 60 + i }));
    const prev = Array.from({ length: 7 }, (_, i) => day(3 + i, { newActivated: 4, visitors: 80, payingUsers: 55 }));
    const f = buildFunnel(saas, "7d", cur, prev, { users: src("clerk"), activation: src("posthog"), traffic: src("plausible"), revenue: src("stripe") }, { includeTraffic: true, includeRevenue: true });
    expect(f.stages.map((s) => s.key)).toEqual(["visitors", "signups", "activated", "paying"]);
    expect(f.stages.map((s) => s.value)).toEqual([700, 70, 35, 66]);
    expect(f.stages[1].conversionPct).toBe(10);
    expect(f.stages[2].conversionPct).toBe(50);
    expect(f.stages[0].changePct).toBe(25);
    expect(f.stages[2].previousConversionPct).toBe(40);
    expect(f.stages[3].kind).toBe("stock");
    expect(f.verification).toBe("verified");
    expect(f.coverageDays).toBe(7);
  });
  it("renders a partial funnel and respects privacy toggles", () => {
    const cur = Array.from({ length: 7 }, (_, i) => day(10 + i, { visitors: 100, payingUsers: 60 }));
    const f = buildFunnel(saas, "7d", cur, [], { users: src("supabase"), traffic: src("plausible"), revenue: src("stripe") }, { includeTraffic: false, includeRevenue: false });
    expect(f.stages.map((s) => s.key)).toEqual(["signups"]);
    expect(f.stages[0].previous).toBe(50);
    const g = buildFunnel(saas, "7d", cur, [], { users: src("supabase"), traffic: src("plausible") }, { includeTraffic: true, includeRevenue: true });
    expect(g.stages.map((s) => s.key)).toEqual(["visitors", "signups"]);
  });
  it("falls back to materialized windows when history is short, and handles zero values", () => {
    const f = buildFunnel(saas, "30d", [day(1)], [], { users: src("clerk"), activation: src("supabase") }, { includeTraffic: true, includeRevenue: true });
    expect(f.stages.map((s) => s.value)).toEqual([300, 150]);
    expect(f.stages[0].previous).toBe(250);
    const zero = buildFunnel({ ...saas, newUsers7d: 0, activated7d: 0 }, "7d", [day(1, { newUsers: 0, newActivated: 0 }), day(2, { newUsers: 0, newActivated: 0 })], [], { users: src("clerk"), activation: src("posthog") }, { includeTraffic: true, includeRevenue: true });
    expect(zero.stages.map((s) => s.value)).toEqual([0, 0]);
    expect(zero.stages[1].conversionPct).toBeUndefined();
    expect(zero.stages[0].changePct).toBe(-100);
  });
  it("never labels a funnel verified when a stage is self-reported", () => {
    const f = buildFunnel(saas, "30d", [], [], { users: src("clerk"), activation: src("endpoint", "self_reported") }, { includeTraffic: false, includeRevenue: false });
    expect(f.verification).toBe("mixed");
    expect(buildFunnel(saas, "30d", [], [], { users: src("manual", "self_reported") }, { includeTraffic: false, includeRevenue: false }).verification).toBe("self_reported");
    expect(buildFunnel(saas, "30d", [], [], {}, { includeTraffic: false, includeRevenue: false }).verification).toBe("none");
  });
});
