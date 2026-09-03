/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { buildExport, startDeletion } from "./account";

const deletedAuth: string[] = [];
vi.mock("./email/users", () => ({
  findAuthUser: async () => ({ email: "ada@example.com", name: "Ada", emailVerified: true }),
  deleteAuthUser: async (_ctx: unknown, userId: string) => { deletedAuth.push(userId); },
}));

const modules = import.meta.glob("./**/*.*s");
const NOW = Date.UTC(2026, 8, 4, 12);
const user = { _id: "u_ada", email: "ada@example.com", name: "Ada", emailVerified: true, createdAt: NOW - 1000 };

// Two founders (Ada gets deleted, Bob must be untouched) and the demo profile with one demo product.
async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ada = await ctx.db.insert("profiles", { userId: "u_ada", username: "ada", displayName: "Ada", onboardingCompleted: true, x: "ada", profilePublic: true });
    const bob = await ctx.db.insert("profiles", { userId: "u_bob", username: "bob", displayName: "Bob", onboardingCompleted: true, followerCount: 1 });
    const demo = await ctx.db.insert("profiles", { userId: "demo", username: "demo", displayName: "Demo", onboardingCompleted: true });
    const row = (ownerId: Id<"profiles">, slug: string, patch: Record<string, unknown> = {}) => ({ ownerId, name: slug, slug, description: "d", websiteUrl: `https://${slug}.io`, tags: [], isPublic: true, trust: "verified" as const, totalUsers: 100, newUsers24h: 1, newUsers7d: 5, newUsers30d: 20, growth30dPct: 10, ...patch });
    const acme = await ctx.db.insert("saas", row(ada, "acme", { followerCount: 1 }));
    const beta = await ctx.db.insert("saas", row(ada, "beta"));
    const globex = await ctx.db.insert("saas", row(bob, "globex", { followerCount: 1 }));
    const demoSaas = await ctx.db.insert("saas", row(demo, "demo-northwind", { isDemo: true }));
    const perSaas = async (saasId: Id<"saas">, secret: string) => {
      const integration = await ctx.db.insert("integrations", { saasId, provider: "clerk", role: "users", config: { secretKey: secret }, status: "ok", trust: "verified" });
      await ctx.db.insert("integrationEvents", { saasId, integrationId: integration, eventId: `evt_${secret}`, type: "user.created", subject: "s", occurredAt: NOW, receivedAt: NOW });
      await ctx.db.insert("backfills", { saasId, integrationId: integration, provider: "clerk", role: "users", fromDay: "2026-08-01", toDay: "2026-09-01", status: "ok", trigger: "first_sync", startedAt: NOW });
      for (let i = 0; i < 30; i++) await ctx.db.insert("snapshots", { saasId, totalUsers: 100 + i, capturedAt: NOW - i * 3_600_000, source: "clerk", trust: "verified" });
      await ctx.db.insert("stageSnapshots", { saasId, stage: "activated", value: 10, capturedAt: NOW, source: "clerk", trust: "verified" });
      await ctx.db.insert("identityLinks", { saasId, stage: "signed_up", subject: "h1", source: "clerk", firstSeenAt: NOW, at: NOW });
      await ctx.db.insert("cohortMetrics", { saasId, cohort: "2026-08", signedUp: 10, activated: 5, trial: 0, converted: 1, activatedD7: 4, convertedD30: 1, computedAt: NOW });
      await ctx.db.insert("dailyMetrics", { saasId, day: "2026-09-03", totalUsers: 100, newUsers: 3 });
      await ctx.db.insert("syncRuns", { saasId, integrationId: integration, provider: "clerk", role: "users", startedAt: NOW, finishedAt: NOW, durationMs: 1, attempt: 1, status: "ok" });
      const milestone = await ctx.db.insert("milestones", { saasId, key: "users:100", kind: "users", metric: "totalUsers", value: 100, title: "100 users", copy: "c", achievedAt: NOW });
      await ctx.db.insert("events", { saasId, kind: "spike", day: "2026-09-01", at: NOW, title: "t", detail: "d" });
      await ctx.db.insert("embedSites", { saasId, host: "example.com", loads: 3, firstSeenAt: NOW, lastSeenAt: NOW });
      await ctx.db.insert("fraudFlags", { saasId, kind: "sudden_drop", severity: "low", detail: "x", createdAt: NOW });
      await ctx.db.insert("rankHistory", { saasId, kind: "leaderboard", window: "30d", day: "2026-09-03", rank: 4, at: NOW });
      await ctx.db.insert("benchmarkHistory", { saasId, week: "2026-W36", day: "2026-09-01", computedAt: NOW, standings: [] });
      return { integration, milestone };
    };
    const a = await perSaas(acme, "sk_live_ada_secret");
    await perSaas(beta, "sk_live_beta_secret");
    await perSaas(globex, "sk_live_bob_secret");
    await perSaas(demoSaas, "demo");
    await ctx.db.insert("shareEvents", { profileId: ada, saasId: acme, key: "users:100", kind: "users", category: "userMilestones", title: "t", detail: "d", metric: "totalUsers", value: 100, milestoneId: a.milestone, cardKind: "users", score: 1, status: "ready", createdAt: NOW });
    await ctx.db.insert("follows", { followerId: ada, targetType: "saas", targetId: globex });
    await ctx.db.insert("follows", { followerId: ada, targetType: "profile", targetId: bob });
    await ctx.db.insert("follows", { followerId: bob, targetType: "saas", targetId: acme });
    const endpoint = await ctx.db.insert("webhookEndpoints", { profileId: ada, url: "https://hooks.example.com/x", events: ["milestone.reached"], secret: "whsec_ada_secret_value", secretPrefix: "whsec_ada", status: "active", consecutiveFailures: 0, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("webhookDeliveries", { endpointId: endpoint, profileId: ada, saasId: acme, eventId: "evt_1", deliveryId: "dlv_1", type: "milestone.reached", payload: {}, attempt: 1, status: "success", createdAt: NOW });
    const token = await ctx.db.insert("developerTokens", { profileId: ada, type: "mcp", name: "agent", prefix: "ut_mcp_a8f3", hash: "deadbeefhash", scopes: ["profile:read"], createdAt: NOW });
    await ctx.db.insert("apiUsage", { tokenId: token, day: "2026-09-04", category: "tool", count: 3, updatedAt: NOW });
    await ctx.db.insert("auditLogs", { profileId: ada, tokenId: token, action: "create_project", ok: true, at: NOW });
    await ctx.db.insert("socialConnections", { profileId: ada, provider: "x", providerUserId: "12345", handle: "ada", accessToken: "x_access_secret_token", refreshToken: "x_refresh_secret_token", scopes: ["tweet.write"], connectedAt: NOW, status: "active" });
    await ctx.db.insert("socialPosts", { profileId: ada, saasId: acme, account: "founder", provider: "x", text: "hi", status: "posted", createdAt: NOW });
    await ctx.db.insert("oauthStates", { state: "st_1", profileId: ada, provider: "x", codeVerifier: "pkce_verifier_secret", createdAt: NOW });
    await ctx.db.insert("digests", { profileId: ada, weekKey: "2026-W36", payload: {}, createdAt: NOW });
    await ctx.db.insert("monthlyReports", { profileId: ada, userId: "u_ada", period: "2026-08", payload: {}, deliverAt: NOW, createdAt: NOW });
    await ctx.db.insert("emailPreferences", { userId: "u_ada", productNudges: true, growthMilestones: false, rankingMilestones: true, growthAlerts: true, monthlyReport: true, weeklyDigest: false, followedSaasUpdates: false, updatedAt: NOW });
    await ctx.db.insert("emailEvents", { userId: "u_ada", emailType: "welcome", category: "transactional", recipient: "ada@example.com", dedupeKey: "welcome:u_ada", status: "sent", attempts: 1, createdAt: NOW });
    await ctx.db.insert("emailRecipients", { email: "ada@example.com", status: "active", updatedAt: NOW });
    await ctx.db.insert("emailPreferences", { userId: "u_bob", productNudges: true, growthMilestones: true, rankingMilestones: true, growthAlerts: true, monthlyReport: true, weeklyDigest: false, followedSaasUpdates: false, updatedAt: NOW });
    return { ada, bob, demo, acme, beta, globex, demoSaas };
  });
  return { t, ...ids };
}

const USER_TABLES: TableNames[] = ["profiles", "saas", "integrations", "integrationEvents", "snapshots", "stageSnapshots", "identityLinks", "cohortMetrics", "dailyMetrics", "syncRuns", "milestones", "events", "shareEvents", "socialConnections", "socialPosts", "oauthStates", "embedSites", "follows", "fraudFlags", "rankHistory", "benchmarkHistory", "backfills", "webhookEndpoints", "webhookDeliveries", "digests", "developerTokens", "apiUsage", "auditLogs", "emailPreferences", "emailEvents", "emailRecipients", "monthlyReports"];

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: NOW }); deletedAuth.length = 0; });
afterEach(() => vi.useRealTimers());

describe("account deletion", () => {
  it("unpublishes immediately, then purges every row of the user in paged steps and finally the auth user", async () => {
    const { t, ada, bob, acme, beta, globex, demoSaas } = await seed();
    const profile = (await t.run((ctx) => ctx.db.get(ada)))!;
    await t.run((ctx) => startDeletion(ctx, user, profile));
    // Step one is synchronous: nothing of Ada is public any more and her credentials are dead.
    const afterStart = await t.run(async (ctx) => ({ profile: await ctx.db.get(ada), acme: await ctx.db.get(acme), tokens: await ctx.db.query("developerTokens").collect(), hooks: await ctx.db.query("webhookEndpoints").collect() }));
    expect(afterStart.profile?.profilePublic).toBe(false);
    expect(afterStart.acme?.isPublic).toBe(false);
    expect(afterStart.tokens.every((x) => x.revokedAt !== undefined)).toBe(true);
    expect(afterStart.hooks[0].status).toBe("disabled");
    // The paged purge (budget 400 spread over 2 products × 40+ rows + profile rows) needs several scheduler hops.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const snapshot = await t.run(async (ctx) => {
      const counts: Record<string, number> = {};
      for (const table of USER_TABLES) counts[table] = (await ctx.db.query(table).collect()).length;
      return { counts, bob: await ctx.db.get(bob), globex: await ctx.db.get(globex), demo: await ctx.db.get(demoSaas), all: JSON.stringify(await Promise.all(USER_TABLES.map((tbl) => ctx.db.query(tbl).collect()))) };
    });
    expect(deletedAuth).toEqual(["u_ada"]);
    // Nothing of Ada survives anywhere; every remaining row belongs to Bob or the demo profile.
    expect(snapshot.all).not.toMatch(new RegExp(`ada|acme|beta|whsec_|x_access|pkce|deadbeef|${ada}|${acme}|${beta}`));
    expect(snapshot.counts.profiles).toBe(2);
    expect(snapshot.counts.saas).toBe(2);
    expect(snapshot.counts.integrations).toBe(2);
    expect(snapshot.counts.snapshots).toBe(60);
    expect(snapshot.counts.follows).toBe(0);
    expect(snapshot.counts.emailPreferences).toBe(1);
    // rerank (scheduled by the purge) may create share events for Bob / demo, so shareEvents is covered by the regex above.
    for (const table of ["socialConnections", "socialPosts", "oauthStates", "webhookEndpoints", "webhookDeliveries", "developerTokens", "apiUsage", "auditLogs", "digests", "monthlyReports", "emailEvents", "emailRecipients"]) expect(snapshot.counts[table], table).toBe(0);
    // Demo data untouched, Bob's counters corrected (Ada followed him and Globex).
    expect(snapshot.demo?.isDemo).toBe(true);
    expect(snapshot.bob?.followerCount).toBe(0);
    expect(snapshot.globex?.followerCount).toBe(0);
    expect(snapshot.globex?.isPublic).toBe(true);
  });

  it("works for a user without a profile and skips demo products owned by the demo profile", async () => {
    const { t, demo } = await seed();
    await t.run((ctx) => startDeletion(ctx, { _id: "u_fresh", email: "fresh@example.com" }, null));
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(deletedAuth).toEqual(["u_fresh"]);
    expect((await t.run((ctx) => ctx.db.query("profiles").collect())).length).toBe(3);
    await t.mutation(internal.account.purgeStep, { userId: "demo", email: "demo@example.com", profileId: demo });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.query("saas").filter((q) => q.eq(q.field("isDemo"), true)).collect())).length).toBe(1);
  });
});

describe("account export", () => {
  it("contains profile, projects, integrations, milestones, follows, endpoints, masked tokens and prefs — never a secret", async () => {
    const { t, ada } = await seed();
    const doc = await t.run(async (ctx) => buildExport(ctx, user, (await ctx.db.get(ada))!));
    const wire = JSON.stringify(doc);
    for (const s of ["sk_live_ada_secret", "sk_live_beta_secret", "whsec_ada_secret", "x_access", "x_refresh", "pkce", "deadbeef", "accessToken", "refreshToken", "secretKey", "\"config\"", "\"hash\""]) expect(wire, s).not.toContain(s);
    expect(doc.format).toBe("usertrack-account-export/1");
    expect(doc.account).toMatchObject({ id: "u_ada", email: "ada@example.com", emailVerified: true });
    expect(doc.profile?.username).toBe("ada");
    expect(doc.projects.map((p) => p.slug).sort()).toEqual(["acme", "beta"]);
    expect(doc.projects[0].integrations[0]).toMatchObject({ provider: "clerk", role: "users" });
    expect(doc.projects[0].milestones[0].key).toBe("users:100");
    expect(doc.follows.map((f) => [f.type, f.target]).sort()).toEqual([["profile", "bob"], ["saas", "globex"]]);
    expect(doc.webhookEndpoints[0]).toMatchObject({ url: "https://hooks.example.com/x", secretMasked: expect.stringContaining("whsec_ada") });
    expect(doc.developerTokens[0]).toMatchObject({ name: "agent", token: expect.stringMatching(/^ut_mcp_a8f3/) });
    expect(doc.emailPreferences.growthMilestones).toBe(false);
    expect(doc.socialConnections).toEqual([expect.objectContaining({ provider: "x", handle: "ada", status: "active" })]);
  });

  it("works before the profile exists", async () => {
    const { t } = await seed();
    const doc = await t.run((ctx) => buildExport(ctx, { _id: "u_new", email: "new@example.com" }, null));
    expect(doc.profile).toBeNull();
    expect(doc.projects).toEqual([]);
    expect(doc.emailPreferences.productNudges).toBe(true);
  });
});
