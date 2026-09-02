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
const DAY = 86_400_000;

const seedOwner = (tx: ReturnType<typeof t>) => tx.run((ctx) => ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: true }));
const seedSaas = (tx: ReturnType<typeof t>, ownerId: Id<"profiles">, patch: Record<string, unknown> = {}) =>
  tx.run((ctx) => ctx.db.insert("saas", { ownerId, name: "Acme", slug: "acme", description: "d", websiteUrl: "https://acme.io", tags: [], category: "developer-tools", isPublic: true, trust: "verified", totalUsers: 900, newUsers24h: 20, newUsers7d: 120, newUsers30d: 400, newUsersPrev24h: 10, newUsersPrev7d: 60, newUsersPrev30d: 300, growth30dPct: 80, growth7dPct: 15, trustScore: 80, lastSyncedAt: Date.now(), firstSnapshotAt: Date.now() - 30 * DAY, ...patch }));

describe("conversion boards", () => {
  it("list only published rates, apply floors, order by rate and never leak private counts", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    await seedSaas(tx, owner, { slug: "pub", name: "Pub", signupToConvertedPct: 8, convertedUsers: 80, convertedGrowth30dPct: 20, trialToConvertedPct: 40, visibility: { conversionRate: true, trialConversion: true } });
    await seedSaas(tx, owner, { slug: "pub2", name: "Pub2", signupToConvertedPct: 12, convertedUsers: 5, convertedGrowth30dPct: 50, trialToConvertedPct: 60, visibility: { conversionRate: true } });
    // Connected Stripe privately: never on a conversion board, whatever the numbers.
    await seedSaas(tx, owner, { slug: "priv", name: "Priv", signupToConvertedPct: 30, convertedUsers: 300, convertedGrowth30dPct: 90, trialToConvertedPct: 90 });
    await seedSaas(tx, owner, { slug: "legacy", name: "Legacy", signupToConvertedPct: 9, convertedUsers: 90, convertedGrowth30dPct: 30, showRevenue: true });
    await seedSaas(tx, owner, { slug: "small", name: "Small", totalUsers: 20, signupToConvertedPct: 50, convertedUsers: 10, visibility: { conversionRate: true } });
    const slugs = async (board: "best-conversion" | "best-trial-conversion" | "converted-growth" | "most-new") => (await tx.query(api.public.board, { board })).map((s) => s.slug);
    expect(await slugs("best-conversion")).toEqual(["pub2", "legacy", "pub"]);
    expect(await slugs("best-trial-conversion")).toEqual(["pub"]);
    expect(await slugs("converted-growth")).toEqual(["legacy", "pub"]);
    expect((await slugs("most-new")).length).toBe(5);
    const pub = (await tx.query(api.public.board, { board: "best-conversion" })).find((r) => r.slug === "pub")!;
    expect(pub.signupToConvertedPct).toBe(8);
    expect(pub.convertedUsers).toBeUndefined();
  });

  it("never publishes a conversion benchmark statement unless the rate is public", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    await seedSaas(tx, owner, { slug: "priv", signupToConvertedPct: 30 });
    await seedSaas(tx, owner, { slug: "pub", signupToConvertedPct: 30, visibility: { conversionRate: true } });
    await tx.run((ctx) => ctx.db.insert("benchmarkAggregates", { groupKey: "all", metric: "signupToConvertedPct", sampleSize: 12, deciles: [1, 2, 3, 4, 5, 6, 7, 8, 9], computedAt: Date.now() }));
    expect(await tx.query(api.public.benchmarkHighlight, { slug: "priv" })).toBeNull();
    expect(await tx.query(api.public.benchmarkHighlight, { slug: "pub" })).toMatchObject({ metric: "signupToConvertedPct", percentile: 95, statement: "Top 5% signup → converted rate in all SaaS on UserTrack" });
  });

  it("daily benchmarks aggregate the conversion metrics and skip undefined values", async () => {
    const tx = t();
    const owner = await seedOwner(tx);
    for (let i = 0; i < 5; i++) await seedSaas(tx, owner, { slug: `s${i}`, signupToConvertedPct: 2 + i });
    await tx.mutation(internal.daily.benchmarks, {});
    const agg = (metric: string) => tx.run((ctx) => ctx.db.query("benchmarkAggregates").withIndex("by_group_metric", (q) => q.eq("groupKey", "all").eq("metric", metric)).unique());
    expect(await agg("signupToConvertedPct")).toMatchObject({ sampleSize: 5, deciles: expect.arrayContaining([4]) });
    expect(await agg("trialToConvertedPct")).toBeNull();
  });
});

describe("seed lifecycle demo", () => {
  it("writes conversion demo data idempotently and clears the new tables", async () => {
    const tx = t();
    await tx.mutation(internal.seed.run, {});
    const bySlug = (slug: string) => tx.run((ctx) => ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique());
    const northwind = (await bySlug("demo-northwind"))!;
    expect(northwind.conversionMode).toBe("active_paid");
    expect(northwind.signupToConvertedPct).toBeCloseTo(6, 0);
    expect(northwind.trialUsers).toBeGreaterThan(0);
    expect(northwind.trialToConvertedPct).toBeGreaterThan(0);
    expect(northwind.convertedGrowth30dPct).toBeGreaterThan(0);
    expect(northwind.visibility).toEqual({ conversionRate: true, trialConversion: true, convertedCount: false });
    expect(northwind.identityQuality).toBe("cohort_verified");
    expect(northwind.mrr).toBeUndefined();
    const shipnote = (await bySlug("demo-shipnote"))!;
    expect(shipnote).toMatchObject({ projectType: "mobile", appStoreUrl: "https://apps.apple.com/app/id123456789" });
    expect(shipnote.convertedUsers).toBeGreaterThan(0);
    expect(shipnote.trialUsers).toBeUndefined();
    expect((await bySlug("demo-pixelpost"))!.convertedUsers).toBeUndefined();
    const daily = await tx.run((ctx) => ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", northwind._id)).collect());
    expect(daily.every((r) => r.convertedUsers !== undefined && r.trialUsers !== undefined)).toBe(true);
    const count = (table: "stageSnapshots" | "cohortMetrics") => tx.run(async (ctx) => (await ctx.db.query(table).collect()).length);
    const snaps = await count("stageSnapshots");
    expect(snaps).toBeGreaterThan(0);
    expect(await count("cohortMetrics")).toBeGreaterThan(0);
    await tx.mutation(internal.seed.refresh, {});
    expect(await count("stageSnapshots")).toBe(snaps);
    expect((await bySlug("demo-northwind"))!.convertedUsers).toBe(northwind.convertedUsers);
    await tx.mutation(internal.seed.clear, {});
    expect(await count("stageSnapshots")).toBe(0);
    expect(await count("cohortMetrics")).toBe(0);
  });
});
