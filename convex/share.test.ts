/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { addMilestones } from "./trust";
import { recordSpikeShare } from "./share";

vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const modules = import.meta.glob("./**/*.*s");
const DAY = 86_400_000;
const t = () => convexTest(schema, modules);
const seedOwner = (tx: ReturnType<typeof t>, patch: Record<string, unknown> = {}) => tx.run((ctx) => ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: true, x: "ada", ...patch }));
const seedSaas = (tx: ReturnType<typeof t>, ownerId: Id<"profiles">, patch: Record<string, unknown> = {}) =>
  tx.run((ctx) => ctx.db.insert("saas", { ownerId, name: "Acme", slug: "acme", description: "d", websiteUrl: "https://acme.io", tags: [], category: "ai", isPublic: true, trust: "verified", totalUsers: 10_000, newUsers24h: 20, newUsers7d: 120, newUsers30d: 1_842, newUsersPrev30d: 900, growth30dPct: 22.6, growth7dPct: 1.2, activatedUsers: 5_000, activationRatePct: 50, rank: 3, trendingRank: 4, trustScore: 80, lastSyncedAt: Date.now(), firstSnapshotAt: Date.now() - 60 * DAY, ...patch }));

describe("share engine", () => {
  it("turns significant milestones into share events exactly once and ignores small ones", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const acme = await seedSaas(tx, owner);
    await tx.run(async (ctx) => {
      await addMilestones(ctx, acme, [
        { key: "users:10", kind: "users", metric: "totalUsers", value: 10, title: "10 users", copy: "c" },
        { key: "users:10000", kind: "users", metric: "totalUsers", value: 10_000, title: "10,000 users", copy: "Acme just crossed 10,000 users on UserTrack." },
        { key: "top10", kind: "top10", metric: "rank", value: 3, title: "Top 10 on UserTrack", copy: "Acme entered the top 10 (#3)." },
      ]);
      // Re-running the same milestones (idempotent addMilestones) must not duplicate share events.
      await addMilestones(ctx, acme, [{ key: "users:10000", kind: "users", metric: "totalUsers", value: 10_000, title: "10,000 users", copy: "c" }]);
    });
    const events = await tx.run((ctx) => ctx.db.query("shareEvents").collect());
    expect(events.map((e) => e.key).sort()).toEqual(["top10", "users:10000"]);
    const top = events.find((e) => e.key === "top10")!;
    expect(top).toMatchObject({ category: "leaderboardMilestones", rank: 3, status: "ready", profileId: owner });
    expect(top.cardKind).toMatch(/^milestone-/);
    expect(events.find((e) => e.key === "users:10000")!.category).toBe("userMilestones");
  });

  it("never creates share events for demo products, and only strong spikes qualify", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const demo = await seedSaas(tx, owner, { slug: "demo", isDemo: true });
    const real = await seedSaas(tx, owner, { slug: "real" });
    await tx.run(async (ctx) => {
      await addMilestones(ctx, demo, [{ key: "users:10000", kind: "users", metric: "totalUsers", value: 10_000, title: "10,000 users", copy: "c" }]);
      const s = (await ctx.db.get(real))!;
      const weak = await ctx.db.insert("events", { saasId: real, kind: "spike", day: "2026-09-01", at: Date.now(), title: "2.5×", detail: "d" });
      const strong = await ctx.db.insert("events", { saasId: real, kind: "spike", day: "2026-09-02", at: Date.now(), title: "3.4×", detail: "d" });
      await recordSpikeShare(ctx, s, weak, "2026-09-01", 2.5, 50);
      await recordSpikeShare(ctx, s, strong, "2026-09-02", 3.4, 70);
    });
    const events = await tx.run((ctx) => ctx.db.query("shareEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ saasId: real, key: "spike:2026-09-02", kind: "spike", category: "growthRecords", cardKind: expect.stringMatching(/^spike-/) });
  });

  it("benchmark sweep records one top-10% card per metric per month", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    await seedSaas(tx, owner, { growth30dPct: 90 });
    await tx.run(async (ctx) => {
      await ctx.db.insert("benchmarkAggregates", { groupKey: "cat:ai", metric: "growth30dPct", sampleSize: 12, deciles: [1, 2, 3, 4, 5, 6, 7, 8, 9], computedAt: Date.now() });
      await ctx.db.insert("benchmarkAggregates", { groupKey: "all", metric: "activationRatePct", sampleSize: 12, deciles: [5, 10, 15, 20, 25, 30, 35, 40, 45], computedAt: Date.now() });
    });
    await tx.mutation(internal.share.benchmarkSweep, {});
    await tx.mutation(internal.share.benchmarkSweep, {});
    const events = await tx.run((ctx) => ctx.db.query("shareEvents").collect());
    expect(events.map((e) => e.metric).sort()).toEqual(["activationRatePct", "growth30dPct"]);
    expect(events.every((e) => e.category === "activationBenchmarks" && e.cardKind === "benchmark" && (e.percentile ?? 0) >= 90)).toBe(true);
    expect(events[0].key).toMatch(/^bench:.*:\d{4}-\d{2}$/);
  });

  it("share center lists the owner's events, dismiss / restore / markShared work and stats are counted anonymously", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const acme = await seedSaas(tx, owner);
    await tx.run((ctx) => addMilestones(ctx, acme, [{ key: "users:1000", kind: "users", metric: "totalUsers", value: 1000, title: "1,000 users", copy: "c" }]));
    const asAda = tx.withIdentity({ subject: "u1" });
    vi.doMock("./auth", () => ({ authComponent: { safeGetAuthUser: async () => ({ _id: "u1" }) } }));
    const list = await tx.run(async (ctx) => ctx.db.query("shareEvents").collect());
    expect(list).toHaveLength(1);
    await tx.mutation(api.share.track, { kind: "milestone-abc", action: "downloaded" });
    await tx.mutation(api.share.track, { kind: "milestone-abc", action: "downloaded" });
    await tx.mutation(api.share.track, { kind: "users", action: "bogus" });
    const stats = await tx.run((ctx) => ctx.db.query("shareStats").collect());
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ kind: "milestone", action: "downloaded", count: 2 });
    void asAda;
  });
});

describe("founder aggregates & history", () => {
  it("profileByUsername aggregates public projects only and founderHistory forward-fills", async () => {
    const tx = t();
    const owner = await seedOwner(tx, { location: "Berlin" });
    const a = await seedSaas(tx, owner, { slug: "a", totalUsers: 10_000, activatedUsers: 5_000 });
    const b = await seedSaas(tx, owner, { slug: "b", name: "Beta", totalUsers: 100, newUsers30d: 50, activatedUsers: 90, rank: 7, trendingRank: undefined });
    await seedSaas(tx, owner, { slug: "private", name: "Private", isPublic: false, totalUsers: 999_999 });
    const d = (n: number) => new Date(Date.UTC(2026, 8, n)).toISOString().slice(0, 10);
    await tx.run(async (ctx) => {
      await ctx.db.insert("dailyMetrics", { saasId: a, day: d(1), totalUsers: 9_000, newUsers: 10 });
      await ctx.db.insert("dailyMetrics", { saasId: a, day: d(3), totalUsers: 10_000, newUsers: 1_000 });
      await ctx.db.insert("dailyMetrics", { saasId: b, day: d(2), totalUsers: 80, newUsers: 80 });
      await ctx.db.insert("dailyMetrics", { saasId: b, day: d(3), totalUsers: 100, newUsers: 20 });
    });
    const p = (await tx.query(api.public.profileByUsername, { username: "ADA" }))!;
    expect(p.saas.map((s) => s.slug)).toEqual(["a", "b"]);
    expect(p.location).toBe("Berlin");
    expect(p.xConnected).toBe(false);
    expect(p.aggregates).toMatchObject({ projectCount: 2, totalUsers: 10_100, newUsers30d: 1_892, activationRatePct: 50.4, bestRank: 3, trendingCount: 1, biggestGrowth: { slug: "a" } });
    const h = (await tx.query(api.public.founderHistory, { username: "ada", range: "all" }))!;
    expect(h.projects.map((x) => x.slug)).toEqual(["a", "b"]);
    expect(h.points.map((x) => [x.total, x.delta])).toEqual([[9_000, 10], [9_080, 80], [10_100, 1_020]]);
    expect(h.points[1].byProject).toEqual([9_000, 80]);
  });

  it("hidden profiles are not public and search shows founder totals", async () => {
    const tx = t();
    const hidden = await seedOwner(tx, { username: "ghost", userId: "u2", profilePublic: false });
    await seedSaas(tx, hidden, { slug: "g" });
    const owner = await seedOwner(tx, { displayName: "Grace Hopper", username: "grace", userId: "u3" });
    await seedSaas(tx, owner, { slug: "cobol", totalUsers: 500, newUsers30d: 40 });
    expect(await tx.query(api.public.profileByUsername, { username: "ghost" })).toBeNull();
    expect(await tx.query(api.public.founderHistory, { username: "ghost", range: "30d" })).toBeNull();
    const r = await tx.query(api.public.search, { q: "grace" });
    expect(r.profiles).toHaveLength(1);
    expect(r.profiles[0]).toMatchObject({ username: "grace", projectCount: 1, totalUsers: 500, newUsers30d: 40 });
    expect((await tx.query(api.public.search, { q: "ghost" })).profiles).toHaveLength(0);
  });
});
