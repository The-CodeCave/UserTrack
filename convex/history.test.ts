/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const modules = import.meta.glob("./**/*.*s");
const t = () => convexTest(schema, modules);

// The rerank is a scheduler chain (phase 1 pages → rankPlan → applyRanks pages); tests drive it to completion.
const rerank = async (tx: ReturnType<typeof t>) => {
  await tx.mutation(internal.leaderboard.rerank, {});
  await tx.finishAllScheduledFunctions(() => {});
};
const DAY = 86_400_000;
const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);

const seedOwner = (tx: ReturnType<typeof t>) => tx.run((ctx) => ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: true }));
const seedSaas = (tx: ReturnType<typeof t>, ownerId: Id<"profiles">, patch: Record<string, unknown> = {}) =>
  tx.run((ctx) => ctx.db.insert("saas", { ownerId, name: "Acme", slug: "acme", description: "d", websiteUrl: "https://acme.io", tags: [], category: "developer-tools", isPublic: true, trust: "verified", totalUsers: 900, newUsers24h: 20, newUsers7d: 120, newUsers30d: 400, newUsersPrev24h: 10, newUsersPrev7d: 60, newUsersPrev30d: 300, growth30dPct: 80, growth7dPct: 15, trustScore: 80, lastSyncedAt: Date.now(), firstSnapshotAt: Date.now() - 30 * DAY, ...patch }));

describe("ranking history", () => {
  it("appends one row per board/window/day, materializes 7-day movement from stored positions and emits rank-jump events", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const ids: Id<"saas">[] = [];
    for (let i = 0; i < 12; i++) ids.push(await seedSaas(tx, owner, { slug: `p${i}`, name: `P${i}`, newUsers30d: 1000 - i * 50 }));
    await rerank(tx);
    await rerank(tx);
    const today = dayKey(Date.now());
    const rows = await tx.run((ctx) => ctx.db.query("rankHistory").collect());
    // 12 leaderboard rows + 3 trending windows × 12, one per day each (the second rerank patched, never duplicated).
    expect(rows.filter((r) => r.kind === "leaderboard").length).toBe(12);
    expect(rows.filter((r) => r.kind === "trending").length).toBe(36);
    expect(rows.every((r) => r.day === today)).toBe(true);
    // No stored position a week ago → no movement yet.
    const last = (await tx.run((ctx) => ctx.db.get(ids[11])))!;
    expect(last.rank).toBe(12);
    expect(last.rank7dAgo).toBeUndefined();
    expect(last.rankDelta7d).toBeUndefined();
    // Backdate a stored position: 7 days ago P11 was #30 → today it climbed 18 places into the top 50.
    await tx.run(async (ctx) => {
      await ctx.db.insert("rankHistory", { saasId: ids[11], kind: "leaderboard", window: "30d", day: dayKey(Date.now() - 7 * DAY), rank: 30, at: Date.now() - 7 * DAY });
      await ctx.db.insert("rankHistory", { saasId: ids[0], kind: "leaderboard", window: "30d", day: dayKey(Date.now() - 8 * DAY), rank: 3, at: Date.now() - 8 * DAY });
    });
    await rerank(tx);
    const moved = (await tx.run((ctx) => ctx.db.get(ids[11])))!;
    expect(moved.rank7dAgo).toBe(30);
    expect(moved.rankDelta7d).toBe(18);
    const first = (await tx.run((ctx) => ctx.db.get(ids[0])))!;
    expect(first.rank7dAgo).toBe(3);
    expect(first.rankDelta7d).toBe(2);
    const jumps = await tx.run((ctx) => ctx.db.query("events").collect());
    expect(jumps.filter((e) => e.kind === "rank_jump").map((e) => [e.saasId, e.title])).toEqual([[ids[11], "#30 → #12"]]);
    // A second rerank the same week does not repeat the jump event.
    await rerank(tx);
    expect((await tx.run((ctx) => ctx.db.query("events").collect())).filter((e) => e.kind === "rank_jump").length).toBe(1);
    // Movers board + discovery read the stored movement; the rank history query exposes it with the best rank.
    const movers = await tx.query(api.public.board, { board: "movers" });
    expect(movers.map((s) => s.slug)).toEqual(["p11", "p0"]);
    expect(movers[0].movement).toEqual({ kind: "up", delta: 18 });
    const d = await tx.query(api.public.discover, {});
    expect(d.movers[0].slug).toBe("p11");
    expect(d.movers[0].rank7dAgo).toBe(30);
    const rh = await tx.query(api.public.rankHistory, { slug: "p11" });
    expect(rh?.points.map((p) => p.rank)).toEqual([30, 12]);
    expect(rh?.best).toBe(12);
    expect(rh?.movement7d).toEqual({ kind: "up", delta: 18 });
    const th = await tx.query(api.public.rankHistory, { slug: "p0", kind: "trending" });
    expect(th?.window).toBe("7d");
    expect(th?.points.length).toBe(1);
    expect(th?.points[0].score).toBeGreaterThan(0);
    const feed = await tx.query(api.public.feed, { limit: 10 });
    expect(feed.some((f) => f.kind === "rank_jump" && f.saas.slug === "p11")).toBe(true);
  });
});

describe("growth history", () => {
  it("downsamples long ranges, keeps daily rows for 30d and reports gaps instead of interpolating", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const id = await seedSaas(tx, owner, { firstSnapshotAt: Date.now() - 400 * DAY });
    await tx.run(async (ctx) => {
      for (let d = 400; d >= 0; d--) {
        // 10-day outage 50..40 days ago: no rows at all.
        if (d <= 50 && d > 40) continue;
        await ctx.db.insert("dailyMetrics", { saasId: id, day: dayKey(Date.now() - d * DAY), totalUsers: 1000 + (400 - d) * 3, newUsers: 3 });
      }
    });
    const m = (await tx.query(api.public.history, { slug: "acme", range: "30d" }))!;
    expect(m.resolution).toBe("day");
    expect(m.points.length).toBe(31);
    expect(m.gaps).toEqual([]);
    const q = (await tx.query(api.public.history, { slug: "acme", range: "90d" }))!;
    expect(q.gaps.length).toBe(1);
    expect(q.gaps[0].days).toBe(11);
    expect(q.points.length).toBe(91 - 10);
    const y = (await tx.query(api.public.history, { slug: "acme", range: "1y" }))!;
    expect(y.resolution).toBe("week");
    expect(y.points.length).toBeLessThan(60);
    expect(y.points.reduce((a, p) => a + p.delta, 0)).toBe(m.points.length === 31 ? y.points.reduce((a, p) => a + p.delta, 0) : 0);
    const all = (await tx.query(api.public.history, { slug: "acme", range: "all" }))!;
    expect(all.resolution).toBe("week");
    expect(all.points[all.points.length - 1].total).toBe(1000 + 400 * 3);
    expect(await tx.query(api.public.series, { slug: "acme", range: "1y" })).toEqual(y.points);
  });
});

describe("backfill provenance", () => {
  it("never duplicates a backfilled day and records a backfills row", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const id = await seedSaas(tx, owner, { totalUsers: 100 });
    const integrationId = await tx.run((ctx) => ctx.db.insert("integrations", { saasId: id, provider: "clerk", role: "users", config: {}, status: "ok", trust: "verified" }));
    await tx.run((ctx) => ctx.db.insert("snapshots", { saasId: id, totalUsers: 100, capturedAt: Date.now(), source: "clerk", trust: "verified" }));
    const points = [3, 2, 1].map((d) => ({ day: dayKey(Date.now() - d * DAY), value: 100 - d * 10 }));
    const backfillId = await tx.mutation(internal.sync.startBackfill, { integrationId, role: "users", days: 3, trigger: "manual" });
    await tx.mutation(internal.sync.recordHistory, { integrationId, role: "users", history: { metric: "totalUsers", points }, backfillId });
    await tx.mutation(internal.sync.recordHistory, { integrationId, role: "users", history: { metric: "totalUsers", points } });
    const snaps = await tx.run((ctx) => ctx.db.query("snapshots").collect());
    expect(snaps.filter((s) => s.backfilled).length).toBe(3);
    expect(snaps.filter((s) => s.backfilled).every((s) => s.trust === "verified" && s.source === "clerk")).toBe(true);
    const daily = await tx.run((ctx) => ctx.db.query("dailyMetrics").collect());
    expect(daily.length).toBe(3);
    const runs = await tx.run((ctx) => ctx.db.query("backfills").collect());
    expect(runs.length).toBe(1);
    expect(runs[0]).toMatchObject({ status: "ok", pointsWritten: 3, trigger: "manual", provider: "clerk", role: "users" });
    expect(runs[0].finishedAt).toBeDefined();
  });
});

describe("benchmark history + monthly rankings", () => {
  it("writes weekly standings per product with cohort v2 keys, a top-decile feed event, and freezes monthly rankings once", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    for (let i = 0; i < 12; i++) await seedSaas(tx, owner, { slug: `p${i}`, name: `P${i}`, category: "ai", projectType: "mobile", growth30dPct: 10 + i * 10, activationRatePct: 20 + i * 5, totalUsers: 2000 + i });
    await rerank(tx);
    await tx.action(internal.daily.benchmarks, {});
    const aggs = await tx.run((ctx) => ctx.db.query("benchmarkAggregates").collect());
    const keys = new Set(aggs.map((a) => a.groupKey));
    expect(keys).toEqual(new Set(["cat:ai", "cat:ai|size:1k-10k", "size:1k-10k", "platform:mobile", "tracked:lt3m", "all"]));
    expect(aggs.find((a) => a.groupKey === "cat:ai" && a.metric === "activationRatePct")?.sampleSize).toBe(12);
    const hist = await tx.run((ctx) => ctx.db.query("benchmarkHistory").collect());
    expect(hist.length).toBe(12);
    const top = hist.find((h) => h.standings.some((s) => s.groupKey === "cat:ai" && s.metric === "growth30dPct" && s.percentile === 95))!;
    expect(top).toBeDefined();
    await tx.action(internal.daily.benchmarks, {});
    expect((await tx.run((ctx) => ctx.db.query("benchmarkHistory").collect())).length).toBe(12);
    const events = await tx.run((ctx) => ctx.db.query("events").collect());
    const bench = events.filter((e) => e.kind === "benchmark");
    expect(bench.length).toBeGreaterThan(0);
    expect(bench.every((e) => /^\d{4}-\d{2}$/.test(e.day))).toBe(true);
    expect(bench.find((e) => e.saasId === top.saasId)?.title).toMatch(/^Top (5|10)% /);
    const cards = await tx.run(async (ctx) => (await import("./domain/benchmarks")).benchmarkCards(ctx, (await ctx.db.get(top.saasId))!));
    expect(cards.some((c) => c.group === "cat:ai|size:1k-10k")).toBe(true);
    expect(cards.every((c) => c.cohortDefinition.length > 10)).toBe(true);
    const highlight = await tx.query(api.public.benchmarkHighlight, { slug: "p11" });
    expect(highlight?.statement).toMatch(/^Top 5% /);
    expect(highlight?.cohort).toBe("AI SaaS");
    await tx.run(async (ctx) => ctx.db.patch((await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", "p11")).unique())!._id, { visibility: { benchmarks: false } }));
    expect(await tx.query(api.public.benchmarkHighlight, { slug: "p11" })).toBeNull();
    const bh = await tx.query(api.public.benchmarkHistory, { slug: "p10" });
    expect(bh?.weeks.length).toBe(1);
    expect(bh?.weeks[0].standings.every((s) => s.percentile >= 75 && !("value" in s))).toBe(true);
    // Monthly ranking snapshot: written once, force rewrites, categories below the floor are skipped.
    const r1 = await tx.action(internal.daily.snapshotRankings, { period: "2026-08" });
    expect(r1.written).toBe(6);
    const r2 = await tx.action(internal.daily.snapshotRankings, { period: "2026-08" });
    expect(r2.written).toBe(0);
    const snap = await tx.query(api.public.rankingSnapshot, { period: "2026-08", board: "fastest", category: "ai" });
    expect(snap?.rows[0]).toMatchObject({ slug: "p11", rank: 1, value: 120 });
    expect(await tx.query(api.public.rankingSnapshot, { period: "2026-08", board: "fastest", category: "fintech" })).toBeNull();
    expect((await tx.query(api.public.rankingPeriods, {})).length).toBe(6);
  });
});
