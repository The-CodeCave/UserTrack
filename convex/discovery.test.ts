/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { markLaunched } from "./domain/events";

vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const modules = import.meta.glob("./**/*.*s");
const t = () => convexTest(schema, modules);
const DAY = 86_400_000;

const seedOwner = (tx: ReturnType<typeof t>) => tx.run((ctx) => ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: true }));
const seedSaas = (tx: ReturnType<typeof t>, ownerId: Id<"profiles">, patch: Record<string, unknown> = {}) =>
  tx.run((ctx) => ctx.db.insert("saas", { ownerId, name: "Acme", slug: "acme", description: "d", websiteUrl: "https://acme.io", tags: [], category: "developer-tools", isPublic: true, trust: "verified", totalUsers: 900, newUsers24h: 20, newUsers7d: 120, newUsers30d: 400, newUsersPrev24h: 10, newUsersPrev7d: 60, newUsersPrev30d: 300, growth30dPct: 80, growth7dPct: 15, trustScore: 80, lastSyncedAt: Date.now(), firstSnapshotAt: Date.now() - 30 * DAY, ...patch }));

describe("discovery feed", () => {
  it("merges stored milestones and events, dedupes by stable identity, filters by category and hides demo/unverified products", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const acme = await seedSaas(tx, owner);
    const demo = await seedSaas(tx, owner, { slug: "demo", name: "Demo", isDemo: true });
    const manual = await seedSaas(tx, owner, { slug: "manual", name: "Manual", trust: "unverified", category: "ai" });
    const now = Date.now();
    await tx.run(async (ctx) => {
      await ctx.db.insert("milestones", { saasId: acme, key: "users:1000", kind: "users", metric: "totalUsers", value: 1000, title: "1,000 users", copy: "Acme crossed 1,000 users.", achievedAt: now - 1000 });
      await ctx.db.insert("milestones", { saasId: demo, key: "users:1000", kind: "users", metric: "totalUsers", value: 1000, title: "1,000 users", copy: "Demo crossed.", achievedAt: now - 500 });
      await ctx.db.insert("milestones", { saasId: manual, key: "users:100", kind: "users", metric: "totalUsers", value: 100, title: "100 users", copy: "Manual crossed.", achievedAt: now - 400 });
      await ctx.db.insert("events", { saasId: acme, kind: "spike", day: "2026-09-01", at: now - 2000, title: "3× a normal day", detail: "Gained 60 users." });
      await ctx.db.insert("events", { saasId: acme, kind: "reconnect", day: "2026-09-01", at: now - 100, title: "Source reconnected", detail: "x" });
    });
    const feed = await tx.query(api.public.feed, { limit: 10 });
    expect(feed.map((f) => f.id)).toEqual([`milestone:${acme}:users:1000`, `spike:${acme}:2026-09-01`]);
    expect(feed[0].saas.slug).toBe("acme");
    expect(feed[1].share).toMatch(/^share\/spike-/);
    expect(await tx.query(api.public.feed, { limit: 10, category: "ai" })).toEqual([]);
    expect((await tx.query(api.public.feed, { limit: 10, category: "developer-tools" })).length).toBe(2);
  });

  it("writes launched / verified events exactly once", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const id = await seedSaas(tx, owner, { isPublic: false });
    await tx.run(async (ctx) => { const s = (await ctx.db.get(id))!; await markLaunched(ctx, s); await markLaunched(ctx, s); await markLaunched(ctx, (await ctx.db.get(id))!); });
    const events = await tx.run((ctx) => ctx.db.query("events").collect());
    expect(events.filter((e) => e.kind === "launched").length).toBe(1);
    expect((await tx.run((ctx) => ctx.db.get(id)))!.launchedAt).toBeDefined();
    const demo = await seedSaas(tx, owner, { slug: "demo", isDemo: true });
    await tx.run(async (ctx) => markLaunched(ctx, (await ctx.db.get(demo))!));
    expect((await tx.run((ctx) => ctx.db.query("events").collect())).length).toBe(1);
  });

  it("ranks trending per window deterministically and never ranks demo or under-review products", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    const a = await seedSaas(tx, owner, { slug: "a", name: "A" });
    const b = await seedSaas(tx, owner, { slug: "b", name: "B", newUsers7d: 30, newUsersPrev7d: 40, newUsers24h: 40, newUsersPrev24h: 5 });
    const demo = await seedSaas(tx, owner, { slug: "demo", isDemo: true });
    const review = await seedSaas(tx, owner, { slug: "rev", trustState: "review" });
    await tx.mutation(internal.leaderboard.rerank, {});
    await tx.mutation(internal.leaderboard.rerank, {});
    const get = (id: Id<"saas">) => tx.run((ctx) => ctx.db.get(id));
    const [ra, rb, rd, rr] = await Promise.all([get(a), get(b), get(demo), get(review)]);
    expect(ra!.trendingRank).toBe(1);
    expect(rb!.trendingRank).toBe(2);
    expect(rb!.trendingRank24h).toBe(1);
    expect(ra!.trendingRank24h).toBe(2);
    expect(ra!.prevTrendingRank).toBe(1);
    expect(rd!.trendingRank).toBeUndefined();
    expect(rr!.trendingRank).toBeUndefined();
    expect(rr!.trendingScore7d).toBe(0);
    const explain = await tx.query(api.public.trendingExplain, { slug: "a", window: "24h" });
    expect(explain?.rank).toBe(2);
    expect(explain?.factors.signal).toBe(true);
  });

  it("returns discovery sections with hidden gems explained and no benchmark statement without cohorts", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    await seedSaas(tx, owner, { slug: "gem", name: "Gem", totalUsers: 400 });
    await seedSaas(tx, owner, { slug: "big", name: "Big", totalUsers: 50_000 });
    await tx.mutation(internal.leaderboard.rerank, {});
    const d = await tx.query(api.public.discover, {});
    expect(d.hiddenGems.map((s) => s.slug)).toEqual(["gem"]);
    expect(d.hiddenGemRules.maxUsers).toBe(1000);
    expect(d.categories).toEqual([expect.objectContaining({ slug: "developer-tools", count: 2 })]);
    expect(d.trending.length).toBe(2);
    expect(await tx.query(api.public.benchmarkHighlight, { slug: "gem" })).toBeNull();
    const cmp = await tx.query(api.public.compare, { slugs: ["gem", "big", "gem"], days: 7 });
    expect(cmp.map((c) => c.slug)).toEqual(["gem", "big"]);
  });
});
