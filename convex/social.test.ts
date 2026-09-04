/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { FOLLOWERS_PAGE_SIZE, X_ME_URL, X_TOKEN_URL } from "./lib/xApi";

const user = { _id: "u1", email: "ada@example.com", name: "Ada", emailVerified: true };
vi.mock("./auth", () => ({ authComponent: { safeGetAuthUser: async () => user, getAnyUserById: async () => user } }));
vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const NOW = Date.UTC(2026, 8, 4, 12);
const modules = import.meta.glob("./**/*.*s");
const t = () => convexTest(schema, modules).withIdentity({ subject: "u1" });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const me = (followers: number | undefined, username = "ada") => ({ data: { id: "42", username, name: "Ada", profile_image_url: "https://pbs.twimg.com/a_normal.jpg", ...(followers === undefined ? {} : { public_metrics: { followers_count: followers } }) } });
// Routes /users/me by bearer token; the token endpoint always mints "fresh".
const xApi = (byToken: Record<string, () => Response>) =>
  vi.fn(async (url: string, init?: RequestInit) => {
    if (url === X_TOKEN_URL) return json(200, { access_token: "fresh", refresh_token: "r2", expires_in: 7200, scope: "users.read" });
    if (url === X_ME_URL) {
      const token = String((init?.headers as Record<string, string>).Authorization).replace("Bearer ", "");
      return (byToken[token] ?? (() => json(401, { title: "Unauthorized" })))();
    }
    throw new Error(`unexpected fetch ${url}`);
  });

const connection = (profileId: Id<"profiles">, accessToken: string, extra: Record<string, unknown> = {}) =>
  ({ profileId, provider: "x" as const, providerUserId: `id-${accessToken}`, handle: accessToken, accessToken, scopes: ["users.read"], connectedAt: NOW - 1000, status: "active" as const, ...extra });

async function founder(tx: ReturnType<typeof t>, username: string, userId = username, extra: Record<string, unknown> = {}) {
  return tx.run((ctx) => ctx.db.insert("profiles", { userId, username, displayName: username, x: username, onboardingCompleted: true, ...extra }));
}
const profileOf = (tx: ReturnType<typeof t>, id: Id<"profiles">) => tx.run(async (ctx) => (await ctx.db.get(id))!);
const connectionsOf = (tx: ReturnType<typeof t>) => tx.run((ctx) => ctx.db.query("socialConnections").collect());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: NOW });
  process.env.X_CLIENT_ID = "cid";
  process.env.X_CLIENT_SECRET = "csecret";
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("completeOAuth — follower count", () => {
  it("stores followers_count from /users/me on the profile, never on the connection", async () => {
    const tx = t();
    const ada = await founder(tx, "ada", "u1");
    const state = "s".repeat(24);
    await tx.run((ctx) => ctx.db.insert("oauthStates", { state, profileId: ada, provider: "x", codeVerifier: "v".repeat(48), createdAt: NOW }));
    const fetch = vi.fn(async (url: string) => (url === X_TOKEN_URL ? json(200, { access_token: "tok", refresh_token: "r1", expires_in: 7200, scope: "users.read tweet.write" }) : json(200, me(12400))));
    vi.stubGlobal("fetch", fetch);
    const r = await tx.action(api.social.completeOAuth, { state, code: "code" });
    expect(r.handle).toBe("ada");
    expect(fetch.mock.calls[1][0]).toContain("public_metrics");
    const p = await profileOf(tx, ada);
    expect(p).toMatchObject({ x: "ada", xUserId: "42", xFollowers: 12400, xFollowersAt: NOW });
    const [c] = await connectionsOf(tx);
    expect(c.status).toBe("active");
    expect("followers" in c).toBe(false);
    const st = await tx.query(api.social.status, {});
    expect(st).toMatchObject({ state: "connected_via_oauth", followers: 12400, followersAt: NOW });
  });

  it("leaves the count untouched when X omits public_metrics", async () => {
    const tx = t();
    const ada = await founder(tx, "ada", "u1", { xFollowers: 7, xFollowersAt: NOW - 5000 });
    const state = "s".repeat(24);
    await tx.run((ctx) => ctx.db.insert("oauthStates", { state, profileId: ada, provider: "x", codeVerifier: "v".repeat(48), createdAt: NOW }));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === X_TOKEN_URL ? json(200, { access_token: "tok" }) : json(200, me(undefined)))));
    await tx.action(api.social.completeOAuth, { state, code: "code" });
    expect(await profileOf(tx, ada)).toMatchObject({ xFollowers: 7, xFollowersAt: NOW - 5000 });
  });

  it("disconnect forgets the count with the tokens", async () => {
    const tx = t();
    const ada = await founder(tx, "ada", "u1", { xUserId: "42", xFollowers: 12400, xFollowersAt: NOW });
    await tx.run((ctx) => ctx.db.insert("socialConnections", connection(ada, "tokA")));
    vi.stubGlobal("fetch", vi.fn(async () => json(200, {})));
    await tx.action(api.social.disconnect, {});
    const p = await profileOf(tx, ada);
    expect(p.xFollowers).toBeUndefined();
    expect(p.xFollowersAt).toBeUndefined();
    expect(p.x).toBe("ada");
  });
});

describe("refreshFollowers — daily sweep", () => {
  it("refreshes active connections, renews expired tokens, flags 401 as needs-reconnect and skips the rest", async () => {
    const tx = t();
    const [a, b, c, d] = await Promise.all(["a", "b", "c", "d"].map((u) => founder(tx, u)));
    await tx.run(async (ctx) => {
      await ctx.db.insert("socialConnections", connection(a, "tokA"));
      await ctx.db.insert("socialConnections", connection(b, "tokB"));
      await ctx.db.insert("socialConnections", connection(c, "tokC", { status: "error" }));
      await ctx.db.insert("socialConnections", connection(d, "tokD", { refreshToken: "r1", expiresAt: NOW - 1 }));
    });
    const fetch = xApi({ tokA: () => json(200, me(10, "a")), tokB: () => json(401, { title: "Unauthorized" }), fresh: () => json(200, me(555, "d")) });
    vi.stubGlobal("fetch", fetch);
    const r = await tx.action(internal.social.refreshFollowers, {});
    expect(r).toEqual({ refreshed: 2, failed: 1 });
    expect((await profileOf(tx, a)).xFollowers).toBe(10);
    expect((await profileOf(tx, b)).xFollowers).toBeUndefined();
    expect((await profileOf(tx, c)).xFollowers).toBeUndefined();
    expect(await profileOf(tx, d)).toMatchObject({ xFollowers: 555, xFollowersAt: NOW });
    const rows = await connectionsOf(tx);
    const byHandle = Object.fromEntries(rows.map((x) => [x.handle, x]));
    expect(byHandle.tokB.status).toBe("error");
    expect(byHandle.tokB.lastError).toMatch(/401/);
    expect(byHandle.tokA.status).toBe("active");
    expect(byHandle.tokD).toMatchObject({ accessToken: "fresh", refreshToken: "r2", expiresAt: NOW + 7200_000 });
    // tokC was never called: only a token exchange and three /users/me reads.
    expect(fetch.mock.calls.filter(([u]) => u === X_ME_URL)).toHaveLength(3);
    expect(fetch.mock.calls.filter(([u]) => u === X_TOKEN_URL)).toHaveLength(1);
  });

  it("walks the connections in pages of 50 through the scheduler", async () => {
    const tx = t();
    const ids: Id<"profiles">[] = [];
    for (let i = 0; i < FOLLOWERS_PAGE_SIZE + 1; i++) ids.push(await founder(tx, `f${i}`));
    await tx.run(async (ctx) => { for (const [i, id] of ids.entries()) await ctx.db.insert("socialConnections", connection(id, `tok${i}`)); });
    const fetch = vi.fn(async () => json(200, me(3)));
    vi.stubGlobal("fetch", fetch);
    const first = await tx.action(internal.social.refreshFollowers, {});
    expect(first.refreshed).toBe(FOLLOWERS_PAGE_SIZE);
    await tx.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetch).toHaveBeenCalledTimes(FOLLOWERS_PAGE_SIZE + 1);
    const profiles = await tx.run((ctx) => ctx.db.query("profiles").collect());
    expect(profiles.every((p) => p.xFollowers === 3)).toBe(true);
  });

  it("stops the run on 429 without touching the connection status and does nothing when X OAuth is off", async () => {
    const tx = t();
    const [a, b] = await Promise.all(["a", "b"].map((u) => founder(tx, u)));
    await tx.run(async (ctx) => { await ctx.db.insert("socialConnections", connection(a, "tokA")); await ctx.db.insert("socialConnections", connection(b, "tokB")); });
    const fetch = xApi({ tokA: () => json(429, { title: "Too Many Requests" }), tokB: () => json(200, me(1)) });
    vi.stubGlobal("fetch", fetch);
    expect(await tx.action(internal.social.refreshFollowers, {})).toEqual({ refreshed: 0, failed: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await connectionsOf(tx))[0]).toMatchObject({ status: "active", lastError: expect.stringContaining("429") });
    delete process.env.X_CLIENT_ID;
    expect(await tx.action(internal.social.refreshFollowers, {})).toEqual({ refreshed: 0, failed: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("refreshNow — settings button", () => {
  it("reads once per minute per founder and needs an active connection", async () => {
    const tx = t();
    const ada = await founder(tx, "ada", "u1", { xFollowers: 5, xFollowersAt: NOW - 30_000 });
    await expect(tx.action(api.social.refreshNow, {})).rejects.toThrow(/Connect your X account/);
    await tx.run((ctx) => ctx.db.insert("socialConnections", connection(ada, "tokA")));
    vi.stubGlobal("fetch", xApi({ tokA: () => json(200, me(6)) }));
    await expect(tx.action(api.social.refreshNow, {})).rejects.toThrow(/less than a minute/);
    vi.setSystemTime(NOW + 61_000);
    expect(await tx.action(api.social.refreshNow, {})).toEqual({ followers: 6 });
    expect(await profileOf(tx, ada)).toMatchObject({ xFollowers: 6, xFollowersAt: NOW + 61_000 });
  });
});

describe("public exposure", () => {
  const saas = (ownerId: Id<"profiles">, slug: string, extra: Record<string, unknown> = {}) =>
    ({ ownerId, name: slug, slug, description: "d", websiteUrl: `https://${slug}.io`, tags: [], isPublic: true, trust: "verified" as const, totalUsers: 500, newUsers24h: 5, newUsers7d: 50, newUsers30d: 200, growth30dPct: 60, lastSyncedAt: NOW, ...extra });

  it("shows the count on the profile and on owner chips, strips it for anonymous projects and hidden profiles", async () => {
    const tx = t();
    const ada = await founder(tx, "ada", "u1", { xUserId: "42", xFollowers: 12400, xFollowersAt: NOW });
    const bob = await founder(tx, "bob", "u2", { xFollowers: 9, profilePublic: false });
    await tx.run(async (ctx) => {
      await ctx.db.insert("saas", saas(ada, "acme"));
      await ctx.db.insert("saas", saas(ada, "ghost", { anonymous: true }));
      await ctx.db.insert("saas", saas(bob, "bobs"));
    });
    const p = await tx.query(api.public.profileByUsername, { username: "ada" });
    expect(p).toMatchObject({ xConnected: true, xFollowers: 12400, xFollowersAt: NOW });
    expect(await tx.query(api.public.profileByUsername, { username: "bob" })).toBeNull();
    const rows = await tx.query(api.public.leaderboard, { verifiedOnly: true });
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
    expect(bySlug.acme.owner).toMatchObject({ username: "ada", xFollowers: 12400 });
    expect(bySlug.ghost.owner).toBeNull();
    expect(JSON.stringify(bySlug.ghost)).not.toContain("12400");
  });
});

describe("X sign-in import", () => {
  it("replaces the stored count on every provider read but never overwrites a typed handle", async () => {
    const tx = t();
    const ada = await founder(tx, "ada", "u1", { x: "typed", xFollowers: 1 });
    await tx.mutation(internal.authProfile.applyProviderProfile, { userId: "u1", x: "fromx", avatarUrl: "https://pbs.twimg.com/a.jpg", xFollowers: 250 });
    expect(await profileOf(tx, ada)).toMatchObject({ x: "typed", avatarUrl: "https://pbs.twimg.com/a.jpg", xFollowers: 250, xFollowersAt: NOW });
  });

  it("keeps the count in the prefill until the profile exists", async () => {
    const tx = t();
    await tx.mutation(internal.authProfile.applyProviderProfile, { userId: "u1", x: "ada", xFollowers: 77 });
    expect(await tx.run((ctx) => ctx.db.query("profilePrefills").collect())).toMatchObject([{ userId: "u1", x: "ada", xFollowers: 77 }]);
    const id = await tx.mutation(api.profiles.upsert, { username: "ada", displayName: "Ada" });
    expect(await profileOf(tx, id)).toMatchObject({ x: "ada", xFollowers: 77, xFollowersAt: NOW });
  });
});
