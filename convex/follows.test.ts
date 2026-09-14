/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { followTarget, unfollowTarget, watchlistFeed } from "./follows";

vi.mock("./auth", () => ({ authComponent: { safeGetAuthUser: async () => ({ _id: "u_ada", email: "ada@example.com", name: "Ada", emailVerified: true }) } }));
vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const modules = import.meta.glob("./**/*.*s");
const DAY = 86_400_000;

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ada = await ctx.db.insert("profiles", { userId: "u_ada", username: "ada", displayName: "Ada", onboardingCompleted: true });
    const bob = await ctx.db.insert("profiles", { userId: "u_bob", username: "bob", displayName: "Bob", onboardingCompleted: true });
    const row = (ownerId: Id<"profiles">, slug: string, patch: Record<string, unknown> = {}) => ({ ownerId, name: slug, slug, description: "d", websiteUrl: `https://${slug}.io`, tags: [], category: "ai", isPublic: true, trust: "verified" as const, totalUsers: 900, newUsers24h: 20, newUsers7d: 120, newUsers30d: 400, growth30dPct: 80, growth7dPct: 15, trustScore: 80, lastSyncedAt: Date.now(), firstSnapshotAt: Date.now() - 30 * DAY, ...patch });
    const acme = await ctx.db.insert("saas", row(bob, "acme", { rank: 9, rank7dAgo: 24, rankDelta7d: 15 }));
    const priv = await ctx.db.insert("saas", row(bob, "priv", { isPublic: false }));
    const globex = await ctx.db.insert("saas", row(ada, "globex"));
    return { ada, bob, acme, priv, globex };
  });
  return { t, ...ids };
}

describe("follows", () => {
  it("is idempotent, keeps counters right, blocks self / private targets and unfollows cleanly", async () => {
    const { t, ada, bob, acme, priv } = await seed();
    // Errors are caught inside the transaction (a throw out of t.run would keep convex-test's lock).
    const follow = (type: "saas" | "profile", target: string) => t.run(async (ctx) => { try { return await followTarget(ctx, (await ctx.db.get(ada))!, type, target); } catch (e) { return { error: (e as Error).message }; } });
    const unfollow = (type: "saas" | "profile", target: string) => t.run(async (ctx) => unfollowTarget(ctx, (await ctx.db.get(ada))!, type, target));
    expect(await follow("saas", acme)).toEqual({ following: true, created: true });
    expect(await follow("saas", acme)).toEqual({ following: true, created: false });
    expect(await follow("profile", bob)).toEqual({ following: true, created: true });
    expect((await t.run((ctx) => ctx.db.get(acme)))!.followerCount).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(bob)))!.followerCount).toBe(1);
    expect((await t.run((ctx) => ctx.db.query("follows").collect())).length).toBe(2);
    expect(await follow("profile", ada)).toEqual({ error: "You cannot follow yourself" });
    expect(await follow("saas", priv)).toEqual({ error: "This project is private" });
    expect(await follow("saas", "nope")).toEqual({ error: "Not found" });
    expect(await unfollow("saas", acme)).toEqual({ following: false, removed: true });
    expect(await unfollow("saas", acme)).toEqual({ following: false, removed: false });
    expect((await t.run((ctx) => ctx.db.get(acme)))!.followerCount).toBe(0);
  });

  it("builds a personalized feed from stored events of followed products and founders, never from private projects", async () => {
    const { t, ada, bob, acme, priv } = await seed();
    await t.run(async (ctx) => followTarget(ctx, (await ctx.db.get(ada))!, "profile", bob));
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("milestones", { saasId: acme, key: "users:1000", kind: "users", metric: "totalUsers", value: 1000, title: "1,000 users", copy: "Acme crossed 1,000 users.", achievedAt: now - 1000 });
      await ctx.db.insert("milestones", { saasId: priv, key: "users:1000", kind: "users", metric: "totalUsers", value: 1000, title: "1,000 users", copy: "Priv crossed.", achievedAt: now - 500 });
      await ctx.db.insert("events", { saasId: acme, kind: "spike", day: "2026-09-01", at: now - 2000, title: "3× a normal day", detail: "Gained 60 users." });
      await ctx.db.insert("events", { saasId: acme, kind: "launched", day: "2026-08-20", at: now - 3000, title: "New on UserTrack", detail: "Acme published." });
      await ctx.db.insert("events", { saasId: acme, kind: "reconnect", day: "2026-09-01", at: now - 100, title: "Source reconnected", detail: "x" });
      await ctx.db.insert("events", { saasId: acme, kind: "spike", day: "2026-06-01", at: now - 100 * DAY, title: "old", detail: "old" });
    });
    const f = await t.run((ctx) => watchlistFeed(ctx, ada, 30, 50));
    expect(f.founders.map((p) => p.username)).toEqual(["bob"]);
    expect(f.saas.map((s) => [s.slug, s.via, s.followed])).toEqual([["acme", "founder", false]]);
    expect(f.saas[0].rankMovement7d).toEqual({ kind: "up", delta: 15 });
    expect(f.feed.map((i) => i.kind)).toEqual(["rank_change", "milestone", "spike", "new_project"]);
    expect(f.feed.find((i) => i.kind === "new_project")?.title).toBe("New from Bob");
    expect(f.feed.every((i) => i.saas.slug === "acme")).toBe(true);
    // Unseen state: everything is new until /app/following is opened; the count covers the whole window, not the slice.
    expect(f.seenAt).toBe(0);
    expect(f.unseenCount).toBe(4);
    expect(await t.run((ctx) => watchlistFeed(ctx, ada, 30, 2))).toMatchObject({ unseenCount: 4, feed: [expect.anything(), expect.anything()] });
    await t.mutation(api.follows.markFeedSeen, {});
    const seen = await t.run((ctx) => watchlistFeed(ctx, ada, 30, 50));
    expect(seen.seenAt).toBeGreaterThan(0);
    expect(seen.unseenCount).toBe(0);
    expect(seen.feed.length).toBe(4);
    // Direct follow of the same product de-duplicates and flips `via`.
    await t.run(async (ctx) => followTarget(ctx, (await ctx.db.get(ada))!, "saas", acme));
    const g = await t.run((ctx) => watchlistFeed(ctx, ada, 30, 50));
    expect(g.saas.map((s) => [s.slug, s.via, s.followed])).toEqual([["acme", "direct", true]]);
    expect(g.feed.length).toBe(4);
    // An anonymous project of a followed founder never appears, so following cannot unmask its owner.
    await t.run(async (ctx) => { await ctx.db.insert("saas", { ...(await ctx.db.get(acme))!, _id: undefined, _creationTime: undefined, slug: "stealth", name: "stealth", rank: undefined, anonymous: true } as never); });
    expect((await t.run((ctx) => watchlistFeed(ctx, ada, 30, 50))).saas.map((s) => s.slug)).toEqual(["acme"]);
    // Making Acme private removes it from the watchlist without deleting the follow.
    await t.run((ctx) => ctx.db.patch(acme, { isPublic: false }));
    expect((await t.run((ctx) => watchlistFeed(ctx, ada, 30, 50))).saas).toEqual([]);
  });

  it("gates follower emails by the per-kind sub-preferences", async () => {
    const { t, ada, acme } = await seed();
    await t.run(async (ctx) => followTarget(ctx, (await ctx.db.get(ada))!, "saas", acme));
    await t.run((ctx) => ctx.db.insert("emailPreferences", { userId: "u_ada", productNudges: true, growthMilestones: true, rankingMilestones: true, growthAlerts: true, monthlyReport: true, weeklyDigest: false, followedSaasUpdates: true, followedSpikes: false, updatedAt: Date.now() }));
    await t.mutation(internal.email.growth.notifyFollowers, { saasId: acme, key: "spike:1", kind: "spike", headline: "Acme is growing 3× faster", detail: "d" });
    await t.mutation(internal.email.growth.notifyFollowers, { saasId: acme, key: "users:1000", kind: "milestone", headline: "Acme crossed 1,000 users", detail: "d" });
    const mails = await t.run((ctx) => ctx.db.query("emailEvents").collect());
    expect(mails.map((m) => m.dedupeKey)).toEqual([`followed-update:${acme}:users:1000:u_ada`]);
  });
});
