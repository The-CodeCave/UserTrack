// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type { ConvexError } from "convex/values";
import schema from "./schema";
import betterAuthSchema from "../node_modules/@convex-dev/better-auth/dist/component/schema.js";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_MCP_SCOPES, displayPrefix, PLANS, sha256Hex } from "./lib/tokens";
import { dayKey } from "./lib/time";

// Better Auth users are faked: verified (publishing is gated on it), without an email so `account` reports none.
vi.mock("./auth", () => ({ authComponent: { getAnyUserById: async (_ctx: unknown, id: string) => ({ _id: id, emailVerified: true }), safeGetAuthUser: async () => null } }));

const modules = import.meta.glob("./**/*.ts");
// Better Auth is a Convex component; `gateway.account` reads the auth user through it. The schema is not in the
// package's `exports` map, so it is imported by relative path.
const betterAuthModules = import.meta.glob("../node_modules/@convex-dev/better-auth/dist/component/**/*.js");

const GATEWAY = "test-gateway-secret";
process.env.UT_GATEWAY_SECRET = GATEWAY;
const SECRET = "ut_mcp_" + "a".repeat(40);
const API_SECRET = "ut_api_" + "b".repeat(40);
const BOB_SECRET = "ut_mcp_" + "c".repeat(40);
const auth = { hash: sha256Hex(SECRET), gateway: GATEWAY };
const apiAuth = { hash: sha256Hex(API_SECRET), gateway: GATEWAY };
const bobAuth = { hash: sha256Hex(BOB_SECRET), gateway: GATEWAY };

type Failure = { code: string; message: string; retryAfterSec?: number; requiredScope?: string };
async function failure(p: Promise<unknown>): Promise<Failure> {
  try {
    await p;
  } catch (e) {
    const data = (e as ConvexError<Failure>).data;
    if (data?.code) return data;
    throw e;
  }
  throw new Error("expected the call to fail");
}

const project = (ownerId: Id<"profiles">, name: string, slug: string, websiteUrl: string) => ({
  ownerId, name, slug, description: `${name} does things`, websiteUrl, tags: [], isPublic: false, trust: "pending" as const,
  totalUsers: 10, newUsers24h: 1, newUsers7d: 2, newUsers30d: 3, growth30dPct: 0,
});

// Two founders, one MCP token (all scopes) for the first, a project each.
async function seed(opts: { scopes?: string[]; revokedAt?: number; expiresAt?: number } = {}) {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const jane = await ctx.db.insert("profiles", { userId: "user_jane", username: "jane", displayName: "Jane", onboardingCompleted: true });
    const bob = await ctx.db.insert("profiles", { userId: "user_bob", username: "bob", displayName: "Bob", onboardingCompleted: true });
    const tokenId = await ctx.db.insert("developerTokens", { profileId: jane, type: "mcp", name: "agent", prefix: displayPrefix(SECRET), hash: sha256Hex(SECRET), scopes: opts.scopes ?? [...DEFAULT_MCP_SCOPES], createdAt: now, revokedAt: opts.revokedAt, expiresAt: opts.expiresAt });
    const apiTokenId = await ctx.db.insert("developerTokens", { profileId: jane, type: "api", name: "key", prefix: displayPrefix(API_SECRET), hash: sha256Hex(API_SECRET), scopes: ["metrics:read"], createdAt: now });
    await ctx.db.insert("developerTokens", { profileId: bob, type: "mcp", name: "bob-agent", prefix: displayPrefix(BOB_SECRET), hash: sha256Hex(BOB_SECRET), scopes: [...DEFAULT_MCP_SCOPES], createdAt: now });
    const acme = await ctx.db.insert("saas", project(jane, "Acme", "acme", "https://acme.dev"));
    const other = await ctx.db.insert("saas", project(bob, "Other", "other-app", "https://other.app"));
    return { jane, bob, tokenId, apiTokenId, acme, other };
  });
  return { t, ...ids };
}

afterEach(() => vi.useRealTimers());

describe("gateway.authorize", () => {
  it("accepts a valid token and reports the daily limit", async () => {
    const { t, tokenId, jane } = await seed();
    const r = await t.mutation(api.gateway.authorize, { auth, type: "mcp", scope: "projects:read", category: "usertrack_get_projects" });
    expect(r.tokenId).toBe(tokenId);
    expect(r.profileId).toBe(jane);
    expect(r.username).toBe("jane");
    expect(r.plan).toBe("free");
    expect(r.limit).toMatchObject({ perDay: PLANS.free.mcp.perDay, usedToday: 1, remaining: PLANS.free.mcp.perDay - 1 });
    expect(r.limit.resetAt).toBeGreaterThan(Date.now());
  });

  it("rejects an unknown hash", async () => {
    const { t } = await seed();
    expect((await failure(t.mutation(api.gateway.authorize, { auth: { hash: sha256Hex("ut_mcp_nope"), gateway: GATEWAY }, type: "mcp", category: "x" }))).code).toBe("unauthorized");
  });

  it("rejects a wrong or missing gateway secret, and fails closed when the env var is unset", async () => {
    const { t } = await seed();
    expect((await failure(t.mutation(api.gateway.authorize, { auth: { hash: auth.hash, gateway: "nope" }, type: "mcp", category: "x" }))).message).toBe("Gateway secret mismatch");
    expect((await failure(t.mutation(api.gateway.authorize, { auth: { hash: auth.hash }, type: "mcp", category: "x" }))).code).toBe("unauthorized");
    delete process.env.UT_GATEWAY_SECRET;
    try {
      expect((await failure(t.mutation(api.gateway.authorize, { auth, type: "mcp", category: "x" }))).message).toBe("Gateway secret not configured");
    } finally {
      process.env.UT_GATEWAY_SECRET = GATEWAY;
    }
  });

  it("rejects revoked and expired tokens with distinct codes", async () => {
    const revoked = await seed({ revokedAt: Date.now() - 1000 });
    expect((await failure(revoked.t.mutation(api.gateway.authorize, { auth, type: "mcp", category: "x" }))).code).toBe("revoked");
    const expired = await seed({ expiresAt: Date.now() - 1000 });
    expect((await failure(expired.t.mutation(api.gateway.authorize, { auth, type: "mcp", category: "x" }))).code).toBe("expired");
  });

  it("rejects a missing scope with forbidden + requiredScope", async () => {
    const { t } = await seed({ scopes: ["metrics:read"] });
    const f = await failure(t.mutation(api.gateway.authorize, { auth, type: "mcp", scope: "projects:write", category: "usertrack_create_project" }));
    expect(f.code).toBe("forbidden");
    expect(f.requiredScope).toBe("projects:write");
  });

  it("does not accept an API key as an MCP token (or vice versa)", async () => {
    const { t } = await seed();
    expect((await failure(t.mutation(api.gateway.authorize, { auth: { hash: sha256Hex(API_SECRET), gateway: GATEWAY }, type: "mcp", category: "x" }))).code).toBe("unauthorized");
    expect((await failure(t.mutation(api.gateway.authorize, { auth, type: "api", category: "saas" }))).code).toBe("unauthorized");
    // The API key does work for its own type.
    expect((await t.mutation(api.gateway.authorize, { auth: { hash: sha256Hex(API_SECRET), gateway: GATEWAY }, type: "api", category: "saas" })).limit.perDay).toBe(PLANS.free.api.perDay);
  });

  it("enforces the daily quota", async () => {
    const { t, tokenId } = await seed();
    await t.run(async (ctx) => ctx.db.insert("apiUsage", { tokenId, day: dayKey(Date.now()), category: "usertrack_get_projects", count: PLANS.free.mcp.perDay, updatedAt: Date.now() }));
    const f = await failure(t.mutation(api.gateway.authorize, { auth, type: "mcp", category: "usertrack_get_projects" }));
    expect(f.code).toBe("rate_limited");
    expect(f.retryAfterSec).toBeGreaterThan(0);
    expect(f.retryAfterSec).toBeLessThanOrEqual(86_400);
  });

  it("increments one usage bucket per category and touches lastUsedAt", async () => {
    const { t, tokenId } = await seed();
    await t.mutation(api.gateway.authorize, { auth, type: "mcp", category: "a" });
    await t.mutation(api.gateway.authorize, { auth, type: "mcp", category: "a" });
    const r = await t.mutation(api.gateway.authorize, { auth, type: "mcp", category: "b" });
    expect(r.limit.usedToday).toBe(3);
    const rows = await t.run(async (ctx) => ctx.db.query("apiUsage").withIndex("by_token_day", (q) => q.eq("tokenId", tokenId).eq("day", dayKey(Date.now()))).collect());
    expect(rows.map((x) => [x.category, x.count]).sort()).toEqual([["a", 2], ["b", 1]]);
    const token = await t.run(async (ctx) => ctx.db.get(tokenId));
    expect(token?.lastUsedAt).toBeDefined();
  });
});

describe("gateway.account", () => {
  it("summarises the profile, token and owned projects", async () => {
    const { t, jane, acme } = await seed();
    const r = await t.query(api.gateway.account, { auth });
    expect(r.profile).toMatchObject({ id: jane, username: "jane", displayName: "Jane", onboardingCompleted: true });
    expect(r.profile.url).toMatch(/\/u\/jane$/);
    // The faked auth user carries no email, so it is simply absent.
    expect(r.profile.email).toBeUndefined();
    expect(r.token).toMatchObject({ name: "agent", prefix: displayPrefix(SECRET), scopes: DEFAULT_MCP_SCOPES });
    expect(r.projectCount).toBe(1);
    expect(r.projects).toEqual([expect.objectContaining({ id: acme, slug: "acme", isPublic: false, verification: "pending", totalUsers: 10 })]);
    expect((await failure(seed({ scopes: ["projects:read"] }).then(({ t }) => t.query(api.gateway.account, { auth })))).code).toBe("forbidden");
  });
});

describe("gateway projects", () => {
  it("lists only the owner's projects", async () => {
    const { t, acme } = await seed();
    const list = await t.query(api.gateway.projects, { auth });
    expect(list.map((p) => p.slug)).toEqual(["acme"]);
    expect(list[0]).toMatchObject({ id: acme, isPublic: false, verification: { level: "pending" }, metrics: { totalUsers: 10 } });
    expect(list[0].urls.page).toMatch(/\/s\/acme$/);
  });

  it("resolves own projects by id or slug and hides other owners' projects", async () => {
    const { t, acme } = await seed();
    const byId = await t.query(api.gateway.project, { auth, projectId: acme });
    expect(byId.slug).toBe("acme");
    expect(byId.setup).toMatchObject({ hasUsersSource: false, usersSourceStatus: "missing", nextStep: "configure_integration", published: false });
    expect(byId.integrations).toEqual([]);
    const bySlug = await t.query(api.gateway.project, { auth, slug: "acme" });
    expect(bySlug.id).toBe(acme);
    expect((await failure(t.query(api.gateway.project, { auth, slug: "other-app" }))).code).toBe("not_found");
    expect((await failure(t.query(api.gateway.project, { auth, slug: "missing" }))).code).toBe("not_found");
  });

  it("requires a token scope for reads too", async () => {
    const { t } = await seed({ scopes: ["metrics:read"] });
    expect((await failure(t.query(api.gateway.projects, { auth }))).code).toBe("forbidden");
  });
});

describe("gateway.createProjectTool", () => {
  it("creates once and returns the existing project for the same domain", async () => {
    const { t, jane, tokenId } = await seed();
    const first = await t.mutation(api.gateway.createProjectTool, { auth, name: "Beta", websiteUrl: "https://www.Example.com/", detectedStack: ["@clerk/nextjs"] });
    expect(first.created).toBe(true);
    expect(first.project.slug).toBe("beta");
    expect(first.project.websiteUrl).toBe("https://www.Example.com/");
    expect(first.recommendation.recommended.provider).toBe("clerk");
    expect(first.warnings).toHaveLength(1);
    const second = await t.mutation(api.gateway.createProjectTool, { auth, name: "Beta again", websiteUrl: "example.com" });
    expect(second.created).toBe(false);
    expect(second.duplicateOf).toBe("beta");
    expect(second.project.id).toBe(first.project.id);
    const mine = await t.run(async (ctx) => ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", jane)).collect());
    expect(mine.filter((s) => s.slug === "beta")).toHaveLength(1);
    const logs = await t.run(async (ctx) => ctx.db.query("auditLogs").withIndex("by_token_time", (q) => q.eq("tokenId", tokenId)).collect());
    expect(logs.filter((l) => l.action === "create_project" && l.ok)).toHaveLength(2);
    expect(logs.find((l) => l.detail?.startsWith("duplicate"))?.saasId).toBe(first.project.id);
  });

  it("rejects an invalid website URL without creating anything", async () => {
    const { t, jane } = await seed();
    expect((await failure(t.mutation(api.gateway.createProjectTool, { auth, name: "Bad", websiteUrl: "localhost" }))).code).toBe("bad_request");
    expect((await failure(t.mutation(api.gateway.createProjectTool, { auth, name: "Bad", websiteUrl: "not a url" }))).code).toBe("bad_request");
    const mine = await t.run(async (ctx) => ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", jane)).collect());
    expect(mine.map((s) => s.slug)).toEqual(["acme"]);
  });

  it("limits creates per hour but still returns duplicates", async () => {
    const { t, jane, tokenId } = await seed();
    const perHour = PLANS.free.mcp.createProjectPerHour;
    await t.run(async (ctx) => {
      for (let i = 0; i < perHour; i++) await ctx.db.insert("auditLogs", { profileId: jane, tokenId, action: "create_project", ok: true, at: Date.now() - i * 1000 });
    });
    const f = await failure(t.mutation(api.gateway.createProjectTool, { auth, name: "Gamma", websiteUrl: "https://gamma.io" }));
    expect(f.code).toBe("rate_limited");
    expect(f.retryAfterSec).toBe(3600);
    expect((await t.mutation(api.gateway.createProjectTool, { auth, name: "Acme", websiteUrl: "https://acme.dev" })).created).toBe(false);
  });

  it("requires projects:write", async () => {
    const { t } = await seed({ scopes: ["projects:read"] });
    expect((await failure(t.mutation(api.gateway.createProjectTool, { auth, name: "X", websiteUrl: "https://x.io" }))).code).toBe("forbidden");
  });
});

describe("gateway.updateProjectTool", () => {
  it("rejects an empty patch", async () => {
    const { t, acme } = await seed();
    expect((await failure(t.mutation(api.gateway.updateProjectTool, { auth, projectId: acme }))).code).toBe("bad_request");
  });

  it("updates description and publishes", async () => {
    vi.useFakeTimers();
    const { t, acme } = await seed();
    const r = await t.mutation(api.gateway.updateProjectTool, { auth, projectId: acme, description: "New copy", isPublic: true });
    expect(r.updated.sort()).toEqual(["description", "isPublic"]);
    expect(r.project.isPublic).toBe(true);
    expect(r.project.description).toBe("New copy");
    expect(r.project.setup.published).toBe(true);
    const row = await t.run(async (ctx) => ctx.db.get(acme));
    expect(row).toMatchObject({ isPublic: true, description: "New copy" });
  });

  it("cannot touch another owner's project", async () => {
    const { t, other } = await seed();
    expect((await failure(t.mutation(api.gateway.updateProjectTool, { auth, projectId: other, description: "hijack" }))).code).toBe("not_found");
    expect((await failure(t.mutation(api.gateway.updateProjectTool, { auth, slug: "other-app", isPublic: true }))).code).toBe("not_found");
    expect((await t.run(async (ctx) => ctx.db.get(other)))?.description).toBe("Other does things");
  });
});

describe("gateway integrations", () => {
  it("recommends a provider from the detected stack", async () => {
    const { t } = await seed();
    const r = await t.query(api.gateway.supportedIntegrations, { auth, detectedProviders: ["@clerk/nextjs", "posthog-js"], framework: "nextjs" });
    expect(r.providers.map((p) => p.provider)).toContain("manual");
    expect(r.providers.every((p) => p.credentialKeys.length > 0)).toBe(true);
    expect(r.recommendation.recommended.provider).toBe("clerk");
    expect(r.recommendation.optionalExtras).toContainEqual(expect.objectContaining({ role: "activation", provider: "posthog" }));
  });

  it("returns executable setup instructions for the endpoint provider", async () => {
    const { t, acme } = await seed();
    const r = await t.query(api.gateway.setupInstructions, { auth, projectId: acme, provider: "endpoint", framework: "nextjs" });
    expect(r.project).toEqual({ id: acme, slug: "acme", websiteUrl: "https://acme.dev" });
    expect(r.codeTemplates.length).toBeGreaterThan(0);
    expect(r.codeTemplates[0].framework).toBe("nextjs");
    expect(r.verification.args.projectId).toBe(acme);
    expect(r.steps.map((s) => s.id)).toContain("endpoint:route");
    expect((await failure(t.query(api.gateway.setupInstructions, { auth, provider: "unknown" }))).code).toBe("bad_request");
  });

  it("configures a manual source without exposing config internals", async () => {
    vi.useFakeTimers();
    const { t, acme } = await seed();
    const r = await t.mutation(api.gateway.configureIntegration, { auth, projectId: acme, provider: "manual", config: { totalUsers: 123 } });
    expect(r.integration).toMatchObject({ provider: "manual", role: "users", status: "running", trust: "unverified", publicConfig: { reported: "123" } });
    expect(r.integration).not.toHaveProperty("config");
    expect(r.nextTool).toBe("usertrack_verify_integration");
    const full = await t.query(api.gateway.project, { auth, projectId: acme });
    expect(full.setup).toMatchObject({ hasUsersSource: true, usersSourceStatus: "running", nextStep: "wait_for_first_sync" });
  });

  it("rejects a provider/role mismatch and missing scope", async () => {
    const { t, acme } = await seed();
    const f = await failure(t.mutation(api.gateway.configureIntegration, { auth, projectId: acme, provider: "clerk", role: "traffic", config: { secretKey: "sk_test_x" } }));
    expect(f.code).toBe("bad_request");
    expect(f.message).toMatch(/cannot provide traffic/);
    const readOnly = await seed({ scopes: ["integrations:read"] });
    expect((await failure(readOnly.t.mutation(api.gateway.configureIntegration, { auth, projectId: readOnly.acme, provider: "manual", config: { totalUsers: 1 } }))).code).toBe("forbidden");
  });

  it("syncs on demand with a per-source cooldown", async () => {
    vi.useFakeTimers();
    const { t, acme } = await seed();
    expect((await failure(t.mutation(api.gateway.syncProject, { auth, projectId: acme }))).code).toBe("bad_request");
    const integrationId = await t.run(async (ctx) => ctx.db.insert("integrations", { saasId: acme, provider: "manual", role: "users", config: { totalUsers: 5 }, status: "ok", trust: "unverified" }));
    const r = await t.mutation(api.gateway.syncProject, { auth, projectId: acme });
    expect(r.started).toBe(1);
    await t.run(async (ctx) => ctx.db.patch(integrationId, { lastSyncAt: Date.now() }));
    const f = await failure(t.mutation(api.gateway.syncProject, { auth, slug: "acme" }));
    expect(f.code).toBe("rate_limited");
    expect(f.retryAfterSec).toBeGreaterThan(0);
    expect(f.retryAfterSec).toBeLessThanOrEqual(60);
  });
});

describe("gateway metrics", () => {
  it("summarises metrics for a timeframe", async () => {
    const { t, acme } = await seed();
    const r = await t.query(api.gateway.metrics, { auth, projectId: acme, timeframe: "7d" });
    expect(r.project).toMatchObject({ id: acme, slug: "acme" });
    expect(r.totalUsers).toBe(10);
    expect(r.window.timeframe).toBe("7d");
    expect(Object.keys(r.windows).sort()).toEqual(["24h", "30d", "7d"]);
    expect(r.windows["30d"].newUsers).toBe(3);
    expect(r.recentMilestones).toEqual([]);
  });

  it("returns a history series", async () => {
    const { t, acme } = await seed();
    await t.run(async (ctx) => ctx.db.insert("dailyMetrics", { saasId: acme, day: dayKey(Date.now()), totalUsers: 10, newUsers: 1 }));
    const r = await t.query(api.gateway.history, { auth, slug: "acme", range: "30d" });
    expect(r.range).toBe("30d");
    expect(Array.isArray(r.points)).toBe(true);
    expect(r.points).toHaveLength(1);
    expect(r.points[0]).toMatchObject({ totalUsers: 10, newUsers: 1 });
    expect(typeof r.points[0].t).toBe("string");
  });

  it("explains why an unpublished project is not ranked", async () => {
    const { t, acme } = await seed();
    const r = await t.query(api.gateway.rank, { auth, projectId: acme });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("Project is not published");
    expect(r.boards.leaderboard).toMatch(/\/leaderboard$/);
  });

  it("lists milestones with share links", async () => {
    const { t, acme } = await seed();
    expect((await t.query(api.gateway.milestones, { auth, projectId: acme })).milestones).toEqual([]);
    await t.run(async (ctx) => ctx.db.insert("milestones", { saasId: acme, key: "users:10", kind: "users", metric: "totalUsers", value: 10, title: "10 users", copy: "Acme reached 10 users", achievedAt: Date.now() }));
    const r = await t.query(api.gateway.milestones, { auth, projectId: acme });
    expect(r.milestones).toHaveLength(1);
    expect(r.milestones[0]).toMatchObject({ kind: "users", value: 10, title: "10 users" });
    expect(r.milestones[0].sharePage).toMatch(/\/s\/acme\/share\/milestone-/);
  });

  it("returns share URLs and warns while unpublished", async () => {
    const { t, acme } = await seed();
    const r = await t.query(api.gateway.shareUrls, { auth, projectId: acme });
    expect(r.page).toMatch(/\/s\/acme$/);
    expect(r.profile).toMatch(/\/u\/jane$/);
    expect(r.badge).toMatch(/\/api\/badge\/acme\.svg$/);
    expect(r.shareImages.users).toMatch(/\/s\/acme\/share\/users\/card$/);
    expect(r.note).toMatch(/not published/);
    expect(r.headline.totalUsers).toBe(10);
  });

  it("blocks metric reads for other owners' projects", async () => {
    const { t, other } = await seed();
    for (const p of [t.query(api.gateway.metrics, { auth, projectId: other }), t.query(api.gateway.history, { auth, projectId: other }), t.query(api.gateway.rank, { auth, projectId: other }), t.query(api.gateway.milestones, { auth, projectId: other }), t.query(api.gateway.shareUrls, { auth, projectId: other })]) {
      expect((await failure(p)).code).toBe("not_found");
    }
  });
});

// ---- v0.9 -------------------------------------------------------------------------------------------------------------

describe("gateway v0.9 scopes", () => {
  it("rejects watchlist, follow and webhook tools without the new scopes", async () => {
    const { t, acme } = await seed({ scopes: ["metrics:read", "projects:read"] });
    expect((await failure(t.query(api.gateway.watchlist, { auth }))).requiredScope).toBe("follows:read");
    expect((await failure(t.mutation(api.gateway.followTool, { auth, targetType: "saas", slug: "other-app" }))).requiredScope).toBe("follows:write");
    expect((await failure(t.query(api.gateway.webhooksList, { auth }))).requiredScope).toBe("webhooks:read");
    expect((await failure(t.mutation(api.gateway.createWebhookTool, { auth, url: "https://example.com/hook", events: ["milestone.reached"] }))).requiredScope).toBe("webhooks:write");
    expect((await failure(t.query(api.gateway.webhookDeliveriesTool, { auth, endpointId: "x" }))).code).toBe("forbidden");
    // metrics:read still covers the new read tools.
    expect((await t.query(api.gateway.rankHistoryTool, { auth, projectId: acme })).kind).toBe("leaderboard");
    expect((await t.query(api.gateway.discover, { auth })).sections).toBeDefined();
  });

  it("only API keys can read /following and only MCP tokens can read the watchlist", async () => {
    const { t } = await seed();
    expect((await failure(t.query(api.gateway.following, { auth }))).code).toBe("unauthorized");
    expect((await failure(t.query(api.gateway.watchlist, { auth: apiAuth }))).code).toBe("unauthorized");
    const r = await t.query(api.gateway.following, { auth: apiAuth });
    expect(r).toMatchObject({ saas: [], founders: [], feed: [] });
  });
});

describe("gateway follows", () => {
  it("follows a public project idempotently, unfollows, and refuses private targets", async () => {
    const { t, other, tokenId } = await seed();
    expect((await failure(t.mutation(api.gateway.followTool, { auth, targetType: "saas", slug: "other-app" }))).code).toBe("not_found");
    await t.run(async (ctx) => ctx.db.patch(other, { isPublic: true }));
    const first = await t.mutation(api.gateway.followTool, { auth, targetType: "saas", slug: "other-app" });
    expect(first).toMatchObject({ following: true, created: true, target: { type: "saas", id: other, slug: "other-app" } });
    const second = await t.mutation(api.gateway.followTool, { auth, targetType: "saas", targetId: other });
    expect(second).toMatchObject({ following: true, created: false });
    expect((await t.run(async (ctx) => ctx.db.get(other)))?.followerCount).toBe(1);
    const list = await t.query(api.gateway.watchlist, { auth });
    expect(list.saas.map((s) => s.slug)).toEqual(["other-app"]);
    expect(list.saas[0]).toMatchObject({ via: "direct", followed: true });
    const rest = await t.query(api.gateway.following, { auth: apiAuth });
    expect(rest.saas[0]).toMatchObject({ slug: "other-app", via: "direct", followed: true, owner: { username: "bob" } });
    expect(rest.saas[0]).not.toHaveProperty("ownerId");
    const un = await t.mutation(api.gateway.unfollowTool, { auth, targetType: "saas", slug: "other-app" });
    expect(un).toMatchObject({ following: false, removed: true });
    expect((await t.mutation(api.gateway.unfollowTool, { auth, targetType: "saas", slug: "other-app" })).removed).toBe(false);
    const logs = await t.run(async (ctx) => ctx.db.query("auditLogs").withIndex("by_token_time", (q) => q.eq("tokenId", tokenId)).collect());
    expect(logs.map((l) => l.action)).toEqual(["follow", "follow", "unfollow", "unfollow"]);
  });

  it("follows founders by username and never yourself", async () => {
    const { t, bob } = await seed();
    const r = await t.mutation(api.gateway.followTool, { auth, targetType: "profile", username: "@Bob" });
    expect(r.target).toMatchObject({ type: "profile", id: bob, username: "bob" });
    expect((await t.query(api.gateway.watchlist, { auth })).founders.map((f) => f.username)).toEqual(["bob"]);
    expect((await failure(t.mutation(api.gateway.followTool, { auth, targetType: "profile", username: "jane" }))).code).toBe("bad_request");
    expect((await failure(t.mutation(api.gateway.followTool, { auth, targetType: "profile", username: "nobody" }))).code).toBe("not_found");
  });
});

describe("gateway rank + benchmark history", () => {
  it("returns stored positions for a private owned project and hides other owners", async () => {
    const { t, acme, other } = await seed();
    const today = dayKey(Date.now());
    await t.run(async (ctx) => {
      await ctx.db.patch(acme, { rank: 4, bestRank: 3, rank7dAgo: 9, rankDelta7d: 5 });
      await ctx.db.insert("rankHistory", { saasId: acme, kind: "leaderboard", window: "30d", day: dayKey(Date.now() - 2 * 86_400_000), rank: 7, at: Date.now() - 2 * 86_400_000 });
      await ctx.db.insert("rankHistory", { saasId: acme, kind: "leaderboard", window: "30d", day: today, rank: 4, at: Date.now() });
      await ctx.db.insert("rankHistory", { saasId: acme, kind: "trending", window: "7d", day: today, rank: 2, score: 120, at: Date.now() });
    });
    const r = await t.query(api.gateway.rankHistoryTool, { auth, slug: "acme" });
    expect(r.project).toMatchObject({ id: acme, isPublic: false });
    expect(r).toMatchObject({ kind: "leaderboard", window: "30d", current: 4, best: 3, rank7dAgo: 9, movement7d: { kind: "up", delta: 5 } });
    expect(r.points.map((p) => p.rank)).toEqual([7, 4]);
    expect(r.publicUrl).toBeUndefined();
    const tr = await t.query(api.gateway.rankHistoryTool, { auth, projectId: acme, kind: "trending" });
    expect(tr.window).toBe("7d");
    expect(tr.points).toEqual([{ day: today, rank: 2, score: 120 }]);
    expect((await failure(t.query(api.gateway.rankHistoryTool, { auth, projectId: other }))).code).toBe("not_found");
  });

  it("returns the private benchmark history view", async () => {
    const { t, acme } = await seed();
    const r = await t.query(api.gateway.benchmarkHistoryTool, { auth, projectId: acme, weeks: 8 });
    expect(r).toMatchObject({ weeks: 8, history: [], changes: [] });
    expect(r.note).toMatch(/No weekly standings/);
  });
});

describe("gateway datasets + discover", () => {
  it("serves public datasets and frozen rankings", async () => {
    const { t, other } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.patch(other, { isPublic: true, trust: "verified", newUsers30d: 40, lastSyncedAt: Date.now() });
      await ctx.db.insert("rankingSnapshots", { period: "2026-08", board: "most-new", rows: [{ slug: "other-app", name: "Other", rank: 1, value: 40, totalUsers: 10, newUsers30d: 40, growth30dPct: 0, trust: "verified" }], sampleSize: 1, computedAt: Date.now() });
    });
    const d = await t.query(api.gateway.dataset, { auth, dataset: "category", category: "ai" });
    expect(d).toMatchObject({ dataset: "category", board: "most-new", window: "30d", rows: [] });
    const all = await t.query(api.gateway.dataset, { auth, dataset: "fastest-growing", limit: 5 });
    expect(all.rows).toEqual([expect.objectContaining({ position: 1, slug: "other-app", verified: true, url: expect.stringMatching(/\/s\/other-app$/) })]);
    expect(all.rows![0]).not.toHaveProperty("ownerId");
    expect((await t.query(api.gateway.dataset, { auth, dataset: "movers" })).rows).toEqual([]); // movers need stored rank history
    expect(all.urls!.csv).toMatch(/\/api\/v1\/datasets\/fastest-growing\?window=30d&format=csv$/);
    expect((await failure(t.query(api.gateway.dataset, { auth, dataset: "category" }))).code).toBe("bad_request");
    const periods = await t.query(api.gateway.dataset, { auth, dataset: "rankings" });
    expect("periods" in periods && periods.periods).toEqual([expect.objectContaining({ period: "2026-08", board: "most-new", category: null })]);
    const snap = await t.query(api.gateway.dataset, { auth, dataset: "rankings", period: "2026-08" });
    expect(snap.rows![0]).toMatchObject({ slug: "other-app", rank: 1 });
    expect((await failure(t.query(api.gateway.dataset, { auth, dataset: "rankings", period: "2026-07" }))).code).toBe("not_found");
  });

  it("returns discovery sections with public rows only", async () => {
    const { t, other } = await seed();
    await t.run(async (ctx) => ctx.db.patch(other, { isPublic: true, trust: "verified", trendingScore7d: 42, trendingRank: 1 }));
    const d = await t.query(api.gateway.discover, { auth });
    expect(Object.keys(d.sections).sort()).toEqual(["fastestGrowing", "hiddenGems", "mobile", "movers", "newAndRising", "trending"]);
    expect(d.sections.trending[0]).toMatchObject({ slug: "other-app", trendingRank: 1 });
    expect(d.sections.trending[0]).not.toHaveProperty("ownerId");
    expect(d.hiddenGemRules.maxUsers).toBe(1000);
    expect((await failure(t.query(api.gateway.discover, { auth, category: "nope" }))).code).toBe("bad_request");
  });
});

describe("gateway webhooks", () => {
  it("creates, lists, updates, tests and rotates endpoints with ownership isolation", async () => {
    const { t, acme, tokenId } = await seed();
    const created = await t.mutation(api.gateway.createWebhookTool, { auth, url: "https://hooks.example.com/usertrack", events: ["milestone.reached", "rank.changed", "bogus.event"], description: "Slack bridge", slug: "acme" });
    expect(created.secret).toMatch(/^whsec_/);
    expect(created.endpoint).toMatchObject({ url: "https://hooks.example.com/usertrack", events: ["milestone.reached", "rank.changed"], saasId: acme, status: "active" });
    expect(created.endpoint).not.toHaveProperty("secret");
    expect(created.endpoint.secretMasked).toMatch(/^whsec_/);
    const id = created.endpoint.id;
    const list = await t.query(api.gateway.webhooksList, { auth });
    expect(list.endpoints.map((e) => e.id)).toEqual([id]);
    expect(list.events.map((e) => e.type)).toContain("growth.spike");
    expect(list.projects.map((p) => p.slug)).toEqual(["acme"]);
    // Bob sees nothing and cannot touch Jane's endpoint.
    expect((await t.query(api.gateway.webhooksList, { auth: bobAuth })).endpoints).toEqual([]);
    expect((await failure(t.query(api.gateway.webhookDeliveriesTool, { auth: bobAuth, endpointId: id }))).code).toBe("not_found");
    expect((await failure(t.mutation(api.gateway.updateWebhookTool, { auth: bobAuth, endpointId: id, status: "disabled" }))).code).toBe("not_found");
    expect((await failure(t.mutation(api.gateway.testWebhookTool, { auth: bobAuth, endpointId: id }))).code).toBe("not_found");
    expect((await failure(t.mutation(api.gateway.deleteWebhookTool, { auth: bobAuth, endpointId: id }))).code).toBe("not_found");
    expect((await failure(t.query(api.gateway.webhookDeliveriesTool, { auth, endpointId: "not-an-id" }))).code).toBe("not_found");
    // Jane tests, sees the queued delivery, updates and rotates.
    const test = await t.mutation(api.gateway.testWebhookTool, { auth, endpointId: id });
    expect(test.deliveryId).toBeDefined();
    const deliveries = await t.query(api.gateway.webhookDeliveriesTool, { auth, endpointId: id });
    expect(deliveries.deliveries).toEqual([expect.objectContaining({ type: "webhook.test", status: "pending", attempt: 0 })]);
    expect((await t.query(api.gateway.webhookDeliveriesTool, { auth, endpointId: id, failedOnly: true })).deliveries).toEqual([]);
    const updated = await t.mutation(api.gateway.updateWebhookTool, { auth, endpointId: id, events: ["growth.spike"], projectId: null, status: "disabled" });
    expect(updated.updated.sort()).toEqual(["events", "project", "status"]);
    expect(updated.endpoint).toMatchObject({ events: ["growth.spike"], status: "disabled", disabledReason: "Disabled by you." });
    expect(updated.endpoint.saasId).toBeUndefined();
    expect((await failure(t.mutation(api.gateway.updateWebhookTool, { auth, endpointId: id }))).code).toBe("bad_request");
    expect((await failure(t.mutation(api.gateway.updateWebhookTool, { auth, endpointId: id, url: "http://insecure.example.com" }))).code).toBe("bad_request");
    const rotated = await t.mutation(api.gateway.rotateWebhookSecretTool, { auth, endpointId: id });
    expect(rotated.secret).toMatch(/^whsec_/);
    expect(rotated.secret).not.toBe(created.secret);
    expect((await t.mutation(api.gateway.deleteWebhookTool, { auth, endpointId: id })).deleted).toBe(true);
    expect((await t.query(api.gateway.webhooksList, { auth })).endpoints).toEqual([]);
    const logs = await t.run(async (ctx) => ctx.db.query("auditLogs").withIndex("by_token_time", (q) => q.eq("tokenId", tokenId)).collect());
    expect(logs.map((l) => l.action)).toEqual(["create_webhook", "test_webhook", "update_webhook", "rotate_webhook_secret", "delete_webhook"]);
    expect(JSON.stringify(logs)).not.toContain(created.secret);
  });

  it("rejects blocked URLs and empty event lists without creating anything", async () => {
    const { t, jane } = await seed();
    expect((await failure(t.mutation(api.gateway.createWebhookTool, { auth, url: "https://localhost/hook", events: ["milestone.reached"] }))).code).toBe("bad_request");
    expect((await failure(t.mutation(api.gateway.createWebhookTool, { auth, url: "https://hooks.example.com/x", events: ["nope"] }))).code).toBe("bad_request");
    expect((await failure(t.mutation(api.gateway.createWebhookTool, { auth, url: "https://hooks.example.com/x", events: ["milestone.reached"], slug: "other-app" }))).code).toBe("not_found");
    expect(await t.run(async (ctx) => ctx.db.query("webhookEndpoints").withIndex("by_profile", (q) => q.eq("profileId", jane)).collect())).toEqual([]);
  });
});
