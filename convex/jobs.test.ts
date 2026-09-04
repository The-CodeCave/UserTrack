/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_LOCK_TTL_MS, PAGE, lockTtlMs } from "./jobs";
import { deciles } from "./lib/benchmarks";

vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const modules = import.meta.glob("./**/*.*s");
const DAY = 86_400_000;
const t = () => convexTest(schema, modules);

const seedOwner = (tx: ReturnType<typeof t>) => tx.run((ctx) => ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: true }));

// N public verified products with strictly decreasing 30-day new users, so the expected ordering is the seed order.
async function seedProjects(tx: ReturnType<typeof t>, ownerId: Id<"profiles">, count: number) {
  const now = Date.now();
  return tx.run(async (ctx) => {
    const ids: Id<"saas">[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(await ctx.db.insert("saas", {
        ownerId, name: `P${i}`, slug: `p${i}`, description: "d", websiteUrl: "https://p.io", tags: [], category: i % 2 === 0 ? "ai" : "developer-tools",
        isPublic: true, trust: "verified", totalUsers: 10_000 - i, newUsers24h: 20, newUsers7d: 120, newUsers30d: 10_000 - i * 10, newUsersPrev30d: 900,
        growth30dPct: 100 - i * 0.1, growth7dPct: 5, activationRatePct: 20 + (i % 40), trustScore: 80, lastSyncedAt: now, firstSnapshotAt: now - 60 * DAY,
      }));
    }
    return ids;
  });
}

const runsFor = (tx: ReturnType<typeof t>, job: string) => tx.run((ctx) => ctx.db.query("jobRuns").withIndex("by_job_time", (q) => q.eq("job", job)).collect());

// Every driver must finish its table in ceil(N / pageSize) pages, and no page may hold more than the page size.
async function expectRun(tx: ReturnType<typeof t>, job: string, items: number, pageSize: number) {
  const runs = await runsFor(tx, job);
  expect(runs).toHaveLength(1);
  expect(runs[0].items).toBe(items);
  expect(runs[0].pages).toBe(Math.ceil(items / pageSize) || 1);
  expect(runs[0].items).toBeLessThanOrEqual(runs[0].pages * pageSize);
  expect(runs[0].finishedAt).toBeGreaterThanOrEqual(runs[0].startedAt);
  expect(runs[0].errors).toBe(0);
}

describe("paged jobs — identical results", () => {
  it("rerank ranks 120 products across pages exactly like a single-pass sort", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    await seedProjects(tx, owner, 120);
    await tx.action(internal.leaderboard.rerank, {});
    const rows = await tx.run((ctx) => ctx.db.query("saas").collect());
    const reference = [...rows].sort((a, b) => b.newUsers30d - a.newUsers30d || b.growth30dPct - a.growth30dPct || b.totalUsers - a.totalUsers).map((s) => s.slug);
    expect([...rows].sort((a, b) => a.rank! - b.rank!).map((s) => s.slug)).toEqual(reference);
    expect(rows.every((s) => s.trendingScore7d !== undefined)).toBe(true);
    // Trending ranks are dense and follow the score ordering across page boundaries.
    const trending = rows.filter((s) => s.trendingRank !== undefined).sort((a, b) => a.trendingRank! - b.trendingRank!);
    expect(trending[0].trendingScore7d!).toBeGreaterThanOrEqual(trending[trending.length - 1].trendingScore7d!);
    expect(trending.map((s) => s.trendingRank)).toEqual(trending.map((_, i) => i + 1));
    await expectRun(tx, "rerank leaderboard", 120, PAGE.rerank);
  });

  it("benchmarks compute the same deciles from a paged projection as from the whole table", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    await seedProjects(tx, owner, 120);
    await tx.action(internal.daily.benchmarks, {});
    const rows = await tx.run((ctx) => ctx.db.query("saas").collect());
    const expected = deciles(rows.map((s) => s.growth30dPct));
    const agg = await tx.run((ctx) => ctx.db.query("benchmarkAggregates").withIndex("by_group_metric", (q) => q.eq("groupKey", "all").eq("metric", "growth30dPct")).unique());
    expect(agg!.sampleSize).toBe(120);
    expect(agg!.deciles).toEqual(expected);
    const history = await tx.run((ctx) => ctx.db.query("benchmarkHistory").collect());
    expect(history).toHaveLength(120);
    await expectRun(tx, "benchmark standings", 120, PAGE.benchmarks);
  });
});

describe("paged jobs — 250 projects", () => {
  it("drives the whole daily pipeline to completion in bounded pages", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T04:00:00Z"));
    try {
      const tx = t();
      const owner = await seedOwner(tx);
      await seedProjects(tx, owner, 250);
      await tx.mutation(internal.daily.run, {});
      await tx.finishAllScheduledFunctions(vi.runAllTimers);
      await expectRun(tx, "daily sweep", 250, PAGE.daily);
      await expectRun(tx, "trust review", 250, PAGE.trust);
      await expectRun(tx, "benchmark share sweep", 250, PAGE.share);
      await expectRun(tx, "benchmark standings", 250, PAGE.benchmarks);
      // The 1st of the month also freezes last month's boards; both actions record a single run.
      expect(await runsFor(tx, "benchmarks")).toHaveLength(1);
      expect((await runsFor(tx, "ranking snapshots"))[0].items).toBeGreaterThan(0);
      expect(await tx.run((ctx) => ctx.db.query("rankingSnapshots").collect())).not.toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stages the sync fan-out and the cohort rebuild without reading either table at once", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const ids = await seedProjects(tx, owner, 250);
    await tx.run(async (ctx) => {
      for (const saasId of ids) await ctx.db.insert("integrations", { saasId, provider: "manual", role: "users", config: {}, status: "ok", trust: "unverified" });
      for (const saasId of ids.slice(0, 30)) await ctx.db.insert("identityLinks", { saasId, subject: `s-${saasId}`, stage: "signed_up", source: "manual", firstSeenAt: Date.now(), at: Date.now() });
    });
    await tx.action(internal.sync.runAll, {});
    expect((await runsFor(tx, "sync all integrations"))[0]).toMatchObject({ items: 250, errors: 0 });
    await tx.action(internal.cohorts.rebuildAll, {});
    expect((await runsFor(tx, "cohort rebuild"))[0]).toMatchObject({ items: 30, errors: 0 });
  });
});

describe("jobRuns bookkeeping", () => {
  it("never un-finishes a run that a later page reports as not done", async () => {
    const tx = t();
    const runId = (await tx.mutation(internal.jobs.begin, { job: "manual" }))!;
    await tx.mutation(internal.jobs.record, { runId, items: 1, done: true });
    const finishedAt = await tx.run(async (ctx) => (await ctx.db.get(runId))!.finishedAt);
    expect(finishedAt).toBeDefined();
    await tx.mutation(internal.jobs.record, { runId, items: 2 });
    const run = await tx.run(async (ctx) => (await ctx.db.get(runId))!);
    expect(run.finishedAt).toBe(finishedAt);
    expect(run).toMatchObject({ pages: 2, items: 3 });
  });
});

describe("paged jobs — failure isolation", () => {
  it("counts a failing project on the run and still processes the rest of the page", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    await seedProjects(tx, owner, 20);
    await tx.run(async (ctx) => {
      // Two aggregates for the same cohort+metric make `.unique()` throw for every "ai" product.
      const row = { groupKey: "cat:ai", metric: "growth30dPct", sampleSize: 12, deciles: [1, 2, 3, 4, 5, 6, 7, 8, 9], computedAt: Date.now() };
      await ctx.db.insert("benchmarkAggregates", row);
      await ctx.db.insert("benchmarkAggregates", row);
      await ctx.db.insert("benchmarkAggregates", { ...row, groupKey: "all" });
    });
    await tx.mutation(internal.share.benchmarkSweep, {});
    const run = (await runsFor(tx, "benchmark share sweep"))[0];
    expect(run).toMatchObject({ items: 20, pages: 1, errors: 10 });
    expect(run.lastError).toContain("unique");
    expect(run.finishedAt).toBeDefined();
    // The ten healthy products still got their card.
    const events = await tx.run((ctx) => ctx.db.query("shareEvents").collect());
    expect(events).toHaveLength(10);
  });
});

describe("jobRuns running lock", () => {
  it("holds the lock while a run is open and releases it on completion", async () => {
    const tx = t();
    const first = await tx.mutation(internal.jobs.begin, { job: "manual" });
    expect(first).not.toBeNull();
    expect(await tx.mutation(internal.jobs.begin, { job: "manual" })).toBeNull();
    expect(await runsFor(tx, "manual")).toHaveLength(1);
    await tx.mutation(internal.jobs.record, { runId: first!, items: 1, done: true });
    expect(await tx.mutation(internal.jobs.begin, { job: "manual" })).not.toBeNull();
    expect(await runsFor(tx, "manual")).toHaveLength(2);
  });

  it("abandons a run whose lock expired and starts a new one", async () => {
    const tx = t();
    const stale = (await tx.mutation(internal.jobs.begin, { job: "manual" }))!;
    await tx.run((ctx) => ctx.db.patch(stale, { startedAt: Date.now() - DEFAULT_LOCK_TTL_MS - 1 }));
    expect(await tx.mutation(internal.jobs.begin, { job: "manual" })).not.toBeNull();
    const abandoned = await tx.run((ctx) => ctx.db.get(stale));
    expect(abandoned).toMatchObject({ lastError: "abandoned (lock expired)" });
    expect(abandoned!.finishedAt).toBeDefined();
  });

  it("gives every driver a TTL, shortest for rerank and longest for the mailers", () => {
    expect(lockTtlMs("rerank leaderboard")).toBe(30 * 60_000);
    expect(lockTtlMs("sync all integrations")).toBe(3 * 3_600_000);
    expect(lockTtlMs("weekly digest")).toBe(12 * 3_600_000);
    expect(lockTtlMs("monthly growth report")).toBe(12 * 3_600_000);
    expect(lockTtlMs("daily sweep")).toBe(DEFAULT_LOCK_TTL_MS);
    expect(lockTtlMs("follower refresh")).toBe(6 * 3_600_000);
  });

  it("skips a cron trigger while the previous mutation chain is still paging", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    await seedProjects(tx, owner, 25);
    await tx.mutation(internal.daily.run, {});
    await tx.mutation(internal.daily.run, {});
    const runs = await runsFor(tx, "daily sweep");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ pages: 1, items: PAGE.daily });
    expect(runs[0].finishedAt).toBeUndefined();
  });

  it("skips a rerank while the previous one is open, so no rank is applied twice", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    await seedProjects(tx, owner, 5);
    await tx.mutation(internal.jobs.begin, { job: "rerank leaderboard" });
    await tx.action(internal.leaderboard.rerank, {});
    const runs = await runsFor(tx, "rerank leaderboard");
    expect(runs).toHaveLength(1);
    expect(runs[0].pages).toBe(0);
    expect(await tx.run((ctx) => ctx.db.query("saas").collect())).toSatisfy((rows: { rank?: number }[]) => rows.every((s) => s.rank === undefined));
  });

  it("closes the run of a page that throws instead of holding the lock until the TTL", async () => {
    const tx = t();
    const runId = (await tx.mutation(internal.jobs.begin, { job: "daily sweep" }))!;
    await tx.mutation(internal.daily.run, { cursor: "not-a-cursor", runId });
    const runs = await runsFor(tx, "daily sweep");
    expect(runs).toHaveLength(1);
    expect(runs[0].errors).toBe(1);
    expect(runs[0].finishedAt).toBeDefined();
    expect(runs[0].lastError).toContain("page:");
    expect(await tx.mutation(internal.jobs.begin, { job: "daily sweep" })).not.toBeNull();
  });
});
