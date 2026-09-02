import { describe, expect, it } from "vitest";
import { buildFunnel, funnelHistory, funnelOptionsFor, OWNER_FUNNEL, stageHealth, type FunnelSource } from "./funnel";
import { visibilityOf } from "./visibility";

const NOW = Date.UTC(2026, 8, 2, 12);
const src = (provider: string, verification: FunnelSource["verification"] = "verified", extra: Partial<FunnelSource> = {}): FunnelSource => ({ provider, label: provider, verification, updatedAt: NOW - 3_600_000, status: "ok", ...extra });
const saas = { newUsers7d: 70, newUsers30d: 300, newUsersPrev7d: 50, newUsersPrev30d: 250, activated7d: 40, activated30d: 150, activatedUsers: 900, visitors30d: 5000, visitorsPrev30d: 4000, trialUsers: 80, newTrials7d: 20, newTrials30d: 60, convertedUsers: 447, newConverted7d: 9, newConverted30d: 30, identityQuality: undefined };
const day = (i: number, extra: Record<string, number | undefined> = {}) => ({ day: `2026-08-${String(i).padStart(2, "0")}`, newUsers: 10, ...extra });
const ALL = { users: src("clerk"), activation: src("posthog"), traffic: src("plausible"), conversion: src("stripe", "verified", { trial: true }) };

describe("lifecycle funnel", () => {
  it("full funnel: Reached → Signed up → Activated → Trial → Converted with adjacent + strategic rates", () => {
    const cur = Array.from({ length: 7 }, (_, i) => day(10 + i, { newActivated: 5, visitors: 100, newTrials: 2, newConverted: 1 }));
    const prev = Array.from({ length: 7 }, (_, i) => day(3 + i, { newActivated: 4, visitors: 80, newTrials: 2, newConverted: 0 }));
    const f = buildFunnel(saas, "7d", cur, prev, ALL, OWNER_FUNNEL, NOW);
    expect(f.stages.map((s) => s.key)).toEqual(["reached", "signed_up", "activated", "trial", "converted"]);
    expect(f.stages.map((s) => s.value)).toEqual([700, 70, 35, 14, 7]);
    expect(f.stages[1].conversionPct).toBe(10);
    expect(f.stages[2].conversionPct).toBe(50);
    expect(f.stages[3].conversionPct).toBe(40);
    expect(f.stages[4].conversionPct).toBe(50);
    expect(f.stages[2].previousConversionPct).toBe(40);
    expect(f.stages.every((s) => s.kind === "flow")).toBe(true);
    expect(f.rates.find((r) => r.label === "Signup → Converted")?.pct).toBe(10);
    expect(f.rates.find((r) => r.label === "Activated → Converted")?.pct).toBe(20);
    expect(f.rates.find((r) => r.label === "Trial → Converted")).toMatchObject({ pct: 50, adjacent: true });
    expect(f.rates.find((r) => r.label === "Activated → Converted")?.adjacent).toBe(false);
    expect(f.verification).toBe("verified");
    expect(f.basis).toBe("aggregate");
    expect(f.identityQuality).toBe("aggregate_only");
    expect(f.stages.every((s) => s.health === "healthy")).toBe(true);
  });
  it("partial funnels: Signed up → Converted, Signed up → Activated, no empty trial", () => {
    const cur = Array.from({ length: 7 }, (_, i) => day(10 + i, { newConverted: 1 }));
    const f = buildFunnel(saas, "7d", cur, [], { users: src("clerk"), conversion: src("revenuecat") }, OWNER_FUNNEL, NOW);
    expect(f.stages.map((s) => s.key)).toEqual(["signed_up", "converted"]);
    expect(f.rates.map((r) => r.label)).toEqual(["Signup → Converted"]);
    const g = buildFunnel(saas, "7d", cur, [], { users: src("clerk"), activation: src("posthog") }, OWNER_FUNNEL, NOW);
    expect(g.stages.map((s) => s.key)).toEqual(["signed_up", "activated"]);
    const noTrial = buildFunnel(saas, "7d", cur, [], { users: src("clerk"), conversion: src("paddle", "verified", { trial: false }) }, OWNER_FUNNEL, NOW);
    expect(noTrial.stages.some((s) => s.key === "trial")).toBe(false);
  });
  it("respects visibility: connected but private, rate-only, count public", () => {
    const cur = Array.from({ length: 7 }, (_, i) => day(10 + i, { visitors: 100, newTrials: 2, newConverted: 1 }));
    const priv = buildFunnel(saas, "7d", cur, [], ALL, funnelOptionsFor(visibilityOf({})), NOW);
    expect(priv.stages.map((s) => s.key)).toEqual(["signed_up", "activated"]);
    const rateOnly = buildFunnel(saas, "7d", cur, [], ALL, funnelOptionsFor(visibilityOf({ visibility: { conversionRate: true, activationRate: false } })), NOW);
    expect(rateOnly.stages.map((s) => s.key)).toEqual(["signed_up", "converted"]);
    expect(rateOnly.stages[1].value).toBeNull();
    expect(rateOnly.stages[1].conversionPct).toBe(10);
    expect(rateOnly.stages[1].previous).toBeUndefined();
    expect(rateOnly.rates.find((r) => r.label === "Signup → Converted")?.pct).toBe(10);
    const full = buildFunnel(saas, "7d", cur, [], ALL, funnelOptionsFor(visibilityOf({ visibility: { conversionRate: true, convertedCount: true, trialConversion: true, traffic: true } })), NOW);
    expect(full.stages.map((s) => s.key)).toEqual(["reached", "signed_up", "activated", "trial", "converted"]);
    expect(full.stages[4].value).toBe(7);
  });
  it("falls back to materialized windows when history is short, stock when no flows, zero values", () => {
    const f = buildFunnel(saas, "30d", [day(1)], [], { users: src("clerk"), activation: src("supabase"), conversion: src("stripe") }, OWNER_FUNNEL, NOW);
    expect(f.stages.map((s) => s.value)).toEqual([300, 150, 30]);
    expect(f.stages[0].previous).toBe(250);
    const stock = buildFunnel({ ...saas, newConverted7d: undefined, newConverted30d: undefined }, "90d", [], [], { users: src("clerk"), conversion: src("revenuecat") }, OWNER_FUNNEL, NOW);
    expect(stock.stages[1]).toMatchObject({ key: "converted", value: 447, kind: "stock" });
    const zero = buildFunnel({ ...saas, newUsers7d: 0, activated7d: 0 }, "7d", [day(1, { newUsers: 0, newActivated: 0 }), day(2, { newUsers: 0, newActivated: 0 })], [], { users: src("clerk"), activation: src("posthog") }, OWNER_FUNNEL, NOW);
    expect(zero.stages.map((s) => s.value)).toEqual([0, 0]);
    expect(zero.stages[1].conversionPct).toBeUndefined();
    expect(zero.rates[0].pct).toBeUndefined();
  });
  it("verification + health: mixed provenance, broken source needs attention, stale source", () => {
    const f = buildFunnel(saas, "30d", [], [], { users: src("clerk"), activation: src("endpoint", "self_reported"), conversion: src("stripe", "verified", { status: "error" }) }, OWNER_FUNNEL, NOW);
    expect(f.verification).toBe("mixed");
    expect(f.stages.find((s) => s.key === "converted")?.health).toBe("attention");
    expect(f.stages.find((s) => s.key === "signed_up")?.health).toBe("healthy");
    expect(stageHealth(src("x", "verified", { updatedAt: NOW - 4 * 86_400_000 }), NOW)).toBe("stale");
    expect(buildFunnel(saas, "30d", [], [], { users: src("manual", "self_reported") }, OWNER_FUNNEL, NOW).verification).toBe("self_reported");
    expect(buildFunnel(saas, "30d", [], [], {}, OWNER_FUNNEL, NOW).verification).toBe("none");
  });
  it("history: trailing 7-day rates, only for connected stages", () => {
    const rows = Array.from({ length: 10 }, (_, i) => day(1 + i, { newActivated: 5, newConverted: 1, newTrials: 2 }));
    const h = funnelHistory(rows, { activation: true, conversion: true, trial: false });
    expect(h).toHaveLength(4);
    expect(h[0]).toEqual({ day: "2026-08-07", signupToActivatedPct: 50, signupToConvertedPct: 10, activatedToConvertedPct: 20, trialToConvertedPct: undefined });
    expect(funnelHistory(rows, { activation: false, conversion: false, trial: false })[0].signupToActivatedPct).toBeUndefined();
  });
});
