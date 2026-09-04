/// <reference types="vite/client" />
// @vitest-environment edge-runtime
// OPS-2: the indexed board read must return exactly what the in-memory sort returned before it existed.
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { BOARDS, growth24h, sortBoard, type Board, type BoardWindow } from "./lib/boardRules";
import { publicStatsOf } from "./leaderboard";

vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const modules = import.meta.glob("./**/*.*s");
const t = () => convexTest(schema, modules);
const DAY = 86_400_000;
const WINDOWS: BoardWindow[] = ["24h", "7d", "30d"];
const CATS = ["developer-tools", "ai", "productivity"];
const STACKS = ["nextjs", "convex"];

// 40 products spanning every board's inclusion rule, with ties on each sort key so the page boundary is exercised.
async function seed(tx: ReturnType<typeof t>, n = 40) {
  const owner = await tx.run((ctx) => ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: true }));
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    const totalUsers = 40 + (i % 7) * 300;
    const newUsers24h = i % 5 === 0 ? 0 : 10 + (i % 4) * 5;
    await tx.run((ctx) =>
      ctx.db.insert("saas", {
        ownerId: owner, name: `S${i}`, slug: `s${i}`, description: "d", websiteUrl: "https://a.io", tags: [], isPublic: true,
        category: CATS[i % CATS.length], techStack: i % 3 === 0 ? [STACKS[i % 2]] : undefined,
        projectType: i % 6 === 0 ? "mobile" : "web",
        trust: i % 9 === 0 ? "unverified" : "verified", trustState: i % 11 === 0 ? "review" : "healthy", trustScore: 55 + (i % 5) * 10,
        totalUsers, newUsers24h, newUsers7d: 12 + (i % 6) * 30, newUsers30d: 50 + (i % 8) * 100,
        growth30dPct: (i % 9) * 10, growth7dPct: (i % 6) * 9, growth24hPct: growth24h({ totalUsers, newUsers24h }),
        trendingScore24h: (i % 4) * 3, trendingScore7d: (i % 5) * 4, trendingScore30d: (i % 3) * 6,
        activatedUsers: i % 4 === 0 ? undefined : 30 + i, activated24h: i % 4 === 0 ? undefined : i, activated7d: i % 4 === 0 ? undefined : 2 * i, activated30d: i % 4 === 0 ? undefined : 3 * i,
        activationRatePct: i % 4 === 0 ? undefined : 5 + (i % 7) * 3,
        rank: i + 1, rankDelta7d: (i % 5) - 1, rank7dAgo: i + 1 + ((i % 5) - 1),
        signupToConvertedPct: i % 2 ? 2 + (i % 6) : undefined, trialToConvertedPct: i % 2 ? 20 + (i % 4) : undefined,
        convertedUsers: i % 2 ? 12 + i : undefined, convertedGrowth30dPct: i % 2 ? (i % 7) * 4 : undefined,
        visibility: { conversionRate: true, trialConversion: true },
        firstSnapshotAt: now - (i % 40) * DAY, lastSyncedAt: now - i * 1000,
      }),
    );
  }
  // Never listed: private rows must not reach any board.
  await tx.run((ctx) => ctx.db.insert("saas", { ownerId: owner, name: "Hidden", slug: "hidden", description: "d", websiteUrl: "https://h.io", tags: [], isPublic: false, trust: "verified", totalUsers: 99999, newUsers24h: 900, newUsers7d: 900, newUsers30d: 9000, growth30dPct: 900, growth7dPct: 900, growth24hPct: 900, trendingScore7d: 900 }));
  return owner;
}

// The rerank is a scheduler chain (phase 1 pages → rankPlan → applyRanks pages); tests drive it to completion.
const rerank = async (tx: ReturnType<typeof t>) => {
  await tx.mutation(internal.leaderboard.rerank, {});
  await tx.finishAllScheduledFunctions(() => {});
};

const allPublic = (tx: ReturnType<typeof t>) => tx.run((ctx) => ctx.db.query("saas").withIndex("by_public_new30d", (q) => q.eq("isPublic", true)).order("desc").collect()) as Promise<Doc<"saas">[]>;

describe("bounded board reads", () => {
  it("match the in-memory sort for every board, window and limit", async () => {
    const tx = t();
    await seed(tx);
    const rows = await allPublic(tx);
    for (const board of BOARDS) {
      for (const window of WINDOWS) {
        for (const limit of [5, 100]) {
          for (const verifiedOnly of [true, false]) {
            const expected = sortBoard(rows, { board, window, verifiedOnly, limit }).map((s) => s.slug);
            const got = (await tx.query(api.public.board, { board, window, verifiedOnly, limit })).map((s) => s.slug);
            expect(got, `${board}/${window}/${limit}/${verifiedOnly}`).toEqual(expected);
          }
        }
      }
    }
  });

  it("match the in-memory sort with category, platform, size and stack filters", async () => {
    const tx = t();
    await seed(tx);
    const rows = await allPublic(tx);
    const cases: { board: Board; window: BoardWindow; category?: string; platform?: "mobile"; size?: "100-1k"; stack?: string }[] = [
      { board: "most-new", window: "30d", category: "ai" },
      { board: "trending", window: "7d", category: "developer-tools" },
      { board: "fastest", window: "24h", platform: "mobile" },
      { board: "most-users", window: "30d", size: "100-1k" },
      { board: "most-new", window: "7d", stack: "nextjs" },
      { board: "hidden-gems", window: "7d", category: "productivity" },
    ];
    for (const c of cases) {
      const f = { ...c, verifiedOnly: true, limit: 100 };
      const expected = sortBoard(rows.filter((s) => !c.stack || s.techStack?.includes(c.stack)), f).map((s) => s.slug);
      const got = (await tx.query(api.public.board, { ...c, verifiedOnly: true, limit: 100 })).map((s) => s.slug);
      expect(got, JSON.stringify(c)).toEqual(expected);
    }
  });

  it("never lists a private product and keeps the legacy leaderboard identical", async () => {
    const tx = t();
    await seed(tx);
    const rows = await allPublic(tx);
    const board = await tx.query(api.public.board, { board: "most-users", limit: 100, verifiedOnly: false });
    expect(board.some((s) => s.slug === "hidden")).toBe(false);
    expect((await tx.query(api.public.leaderboard, { verifiedOnly: true, limit: 20 })).map((s) => s.slug)).toEqual(
      sortBoard(rows, { board: "most-new", window: "30d", verifiedOnly: true, limit: 20 }).map((s) => s.slug),
    );
  });
});

describe("landing query", () => {
  it("excludes demo rows, sorts top by totalUsers desc and matches the new-rising board for newAndHot", async () => {
    const tx = t();
    const owner = await seed(tx);
    await tx.run((ctx) =>
      ctx.db.insert("saas", { ownerId: owner, name: "Demo", slug: "demo", description: "d", websiteUrl: "https://d.io", tags: [], isPublic: true, isDemo: true, trust: "verified", totalUsers: 999999, newUsers24h: 0, newUsers7d: 999, newUsers30d: 0, growth30dPct: 0, firstSnapshotAt: Date.now() }),
    );
    const rows = (await allPublic(tx)).filter((s) => !s.isDemo);
    const landing = await tx.query(api.public.landing, {});
    expect(landing.top.some((s) => s.slug === "demo")).toBe(false);
    expect(landing.top.map((s) => s.slug)).toEqual([...rows].sort((a, b) => b.totalUsers - a.totalUsers).slice(0, 100).map((s) => s.slug));
    expect(landing.newAndHot.map((s) => s.slug)).toEqual(sortBoard(rows, { board: "new-rising", window: "7d", verifiedOnly: true, limit: 10 }).map((s) => s.slug));
    expect(landing.newAndHot.some((s) => s.slug === "demo")).toBe(false);
    expect(landing.stats).toEqual(await tx.query(api.public.stats, {}));
    // The Top 100 renders dense (no sparkline, no founder), the carousel cards render both.
    expect(landing.top.every((s) => s.spark.length === 0)).toBe(true);
    expect(landing.newAndHot.every((s) => s.owner?.username === "ada")).toBe(true);
  });

  // FIX-3: the payload used to be `publicSet` (take(5000)) + an unbounded dailyMetrics collect per row.
  it("stays under 600 read documents on a 1,000-product directory", async () => {
    const tx = convexTest({ schema, modules, transactionLimits: { documentsRead: 600 } });
    const owner = await tx.run((ctx) => ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: true }));
    const now = Date.now();
    for (let chunk = 0; chunk < 10; chunk++) {
      await tx.run(async (ctx) => {
        for (let j = 0; j < 100; j++) {
          const i = chunk * 100 + j;
          // The 12 youngest products are the only ones the carousel can list, and they carry 40 days of history each.
          const rising = i < 12;
          const saasId = await ctx.db.insert("saas", {
            ownerId: owner, name: `S${i}`, slug: `s${i}`, description: "d", websiteUrl: "https://a.io", tags: [], category: "ai", isPublic: true, trust: "verified", trustScore: 80,
            totalUsers: 100_000 - i, newUsers24h: 1, newUsers7d: rising ? 900 - i : 5, newUsers30d: 100 - (i % 90), growth30dPct: i % 30, growth7dPct: 4,
            firstSnapshotAt: rising ? now - DAY : now - 200 * DAY, lastSyncedAt: now,
          });
          if (rising) for (let d = 0; d < 40; d++) await ctx.db.insert("dailyMetrics", { saasId, day: new Date(now - d * DAY).toISOString().slice(0, 10), totalUsers: 10 + d, newUsers: 1 });
        }
      });
    }
    // The counters come from the singleton every rerank writes; without it `stats` falls back to the capped live scan.
    await tx.run((ctx) => ctx.db.insert("publicStats", { key: "public", saasCount: 1000, verifiedCount: 1000, trackedUsers: 1, newUsers30d: 1, categories: [], stacks: [], computedAt: now }));
    const landing = await tx.query(api.public.landing, {});
    expect(landing.top).toHaveLength(100);
    expect(landing.top[0].slug).toBe("s0");
    expect(landing.newAndHot).toHaveLength(10);
    // ~110 board rows + 10 owners + 10 × 30 sparkline days + the counters row.
    expect(landing.newAndHot.every((s) => s.spark.length === 30)).toBe(true);
  });
});

describe("materialized directory counters", () => {
  it("sum the same numbers the live scan produced", async () => {
    const tx = t();
    await seed(tx, 12);
    const rows = await allPublic(tx);
    const live = await tx.query(api.public.stats, {});
    await rerank(tx);
    const stored = await tx.query(api.public.stats, {});
    expect(stored.saasCount).toBe(live.saasCount);
    expect(stored.trackedUsers).toBe(live.trackedUsers);
    expect(stored.newUsers30d).toBe(live.newUsers30d);
    expect(stored.categories).toEqual(live.categories);
    expect(stored.saasCount).toBe(rows.length);
    const meta = await tx.query(api.public.boardMeta, { category: "ai" });
    expect(meta.count).toBe(rows.filter((s) => s.category === "ai" && s.trust === "verified" && s.trustState !== "review").length);
    expect(meta.updatedAt).toBe(rows.filter((s) => s.category === "ai").reduce((a, s) => Math.max(a, s.lastSyncedAt ?? 0), 0));
  });

  it("materializes growth24hPct on every rerank so the 24h board can be read from its index", async () => {
    const tx = t();
    await seed(tx, 6);
    await tx.run(async (ctx) => {
      for (const s of await ctx.db.query("saas").collect()) await ctx.db.patch(s._id, { growth24hPct: undefined });
    });
    await rerank(tx);
    const rows = await allPublic(tx);
    expect(rows.every((s) => s.growth24hPct === growth24h(s))).toBe(true);
  });

  it("counts categories and stacks without double counting a repeated stack entry", () => {
    const stats = publicStatsOf([
      { pub: { verified: true, totalUsers: 10, newUsers30d: 5, category: "ai", stacks: ["nextjs", "nextjs"], lastSyncedAt: 20 } },
      { pub: { verified: false, totalUsers: 4, newUsers30d: -3, category: "ai", stacks: ["convex"], lastSyncedAt: 40 } },
      {},
    ]);
    expect(stats).toMatchObject({ saasCount: 2, verifiedCount: 1, trackedUsers: 14, newUsers30d: 5, updatedAt: 40 });
    expect(stats.categories).toEqual([{ slug: "ai", count: 2, verifiedCount: 1, updatedAt: 40 }]);
    expect(stats.stacks).toEqual([
      { slug: "nextjs", count: 1, verifiedCount: 1, updatedAt: 20 },
      { slug: "convex", count: 1, verifiedCount: 0, updatedAt: 40 },
    ]);
  });
});

describe("sitemap", () => {
  it("caps the URL list, keeps hideFromSearch out and reports that more exist", async () => {
    const tx = t();
    const owner = await seed(tx, 4);
    await tx.run((ctx) => ctx.db.insert("saas", { ownerId: owner, name: "Quiet", slug: "quiet", description: "d", websiteUrl: "https://q.io", tags: [], isPublic: true, trust: "verified", hideFromSearch: true, techStack: ["nextjs"], totalUsers: 5, newUsers24h: 0, newUsers7d: 0, newUsers30d: 0, growth30dPct: 0 }));
    const map = await tx.query(api.public.sitemap, {});
    expect(map.saas.some((s) => s.slug === "quiet")).toBe(false);
    expect(map.saas).toHaveLength(4);
    expect(map.hasMore).toBe(false);
    expect(map.profiles.map((p) => p.username)).toEqual(["ada"]);
  });
});
