/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { followTarget } from "./follows";
import { DEFAULT_MCP_SCOPES, displayPrefix, sha256Hex } from "./lib/tokens";

// One fake Better Auth user; each test sets the name / email / verification state it needs before calling ensure.
const user = { _id: "u1", email: "ada@example.com", name: "Ada Lovelace", emailVerified: true };
vi.mock("./auth", () => ({ authComponent: { safeGetAuthUser: async () => user, getAnyUserById: async (_ctx: unknown, id: string) => (id === user._id ? user : null) } }));
vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const GATEWAY = "test-gateway-secret";
process.env.UT_GATEWAY_SECRET = GATEWAY;
const MCP = "ut_mcp_" + "c".repeat(40);
const auth = { hash: sha256Hex(MCP), gateway: GATEWAY };
const modules = import.meta.glob("./**/*.*s");
const t = () => convexTest(schema, modules).withIdentity({ subject: "u1" });
type Tx = ReturnType<typeof t>;

const message = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return (e as ConvexError<{ message?: string }>).data?.message ?? (e as Error).message; }
  throw new Error("expected the call to fail");
};
const profileOf = (tx: Tx, id: Id<"profiles">) => tx.run(async (ctx) => (await ctx.db.get(id))!);

// A placeholder profile plus a public project owned by it: the state an abandoned signup leaves behind.
async function minted(tx: Tx) {
  const profileId = await tx.mutation(api.profiles.ensure, {});
  const saasId = await tx.run(async (ctx) => {
    await ctx.db.insert("developerTokens", { profileId, type: "mcp", name: "agent", prefix: displayPrefix(MCP), hash: sha256Hex(MCP), scopes: [...DEFAULT_MCP_SCOPES], createdAt: Date.now() });
    return ctx.db.insert("saas", { ownerId: profileId, name: "Acme", slug: "acme", description: "d", websiteUrl: "https://acme.io", tags: [], category: "ai", isPublic: true, trust: "verified", totalUsers: 900, newUsers24h: 20, newUsers7d: 120, newUsers30d: 400, growth30dPct: 80, lastSyncedAt: Date.now() });
  });
  return { profileId, saasId, username: (await profileOf(tx, profileId)).username };
}

beforeEach(() => {
  user.name = "Ada Lovelace";
  user.email = "ada@example.com";
  user.emailVerified = true;
});

describe("profiles.ensure", () => {
  it("mints exactly one unconfirmed profile per user and is idempotent", async () => {
    const tx = t();
    const first = await tx.mutation(api.profiles.ensure, {});
    expect(await tx.mutation(api.profiles.ensure, {})).toBe(first);
    const rows = await tx.run((ctx) => ctx.db.query("profiles").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ username: "ada-lovelace", displayName: "Ada Lovelace", handleConfirmed: false, onboardingCompleted: false });
  });

  it("falls back to the email local part and then to a constant when there is no name", async () => {
    const tx = t();
    user.name = "";
    user.email = "grace@example.com";
    expect(await profileOf(tx, await tx.mutation(api.profiles.ensure, {}))).toMatchObject({ username: "grace", displayName: "grace" });

    const tx2 = t();
    user.email = "!!!@example.com";
    expect((await profileOf(tx2, await tx2.mutation(api.profiles.ensure, {}))).username).toBe("founder");
  });

  it("resolves a taken handle numerically", async () => {
    const tx = t();
    await tx.run((ctx) => ctx.db.insert("profiles", { userId: "u_other", username: "ada-lovelace", displayName: "Other Ada", onboardingCompleted: true }));
    expect((await profileOf(tx, await tx.mutation(api.profiles.ensure, {}))).username).toBe("ada-lovelace-2");
  });

  it("never mints a reserved or invalid handle", async () => {
    const tx = t();
    user.name = "App";
    expect((await profileOf(tx, await tx.mutation(api.profiles.ensure, {}))).username).toBe("app-2");

    const tx2 = t();
    user.name = "Al";
    const short = (await profileOf(tx2, await tx2.mutation(api.profiles.ensure, {}))).username;
    expect(short).toBe("al0");
    expect(await tx2.query(api.profiles.usernameAvailable, { username: short })).toEqual({ ok: true });

    const tx3 = t();
    user.name = "Wolfgang Amadeus Mozart Ferdinand Junior";
    const long = (await profileOf(tx3, await tx3.mutation(api.profiles.ensure, {}))).username;
    expect(long).toBe("wolfgang-amadeus-mozart");
    expect(long.length).toBeLessThanOrEqual(30);
  });

  it("carries a pending GitHub / X prefill onto the minted row and consumes it once", async () => {
    const tx = t();
    await tx.run((ctx) => ctx.db.insert("profilePrefills", { userId: "u1", github: "ada", x: "adalovelace", avatarUrl: "https://cdn.example/a.png", xFollowers: 42 }));
    const p = await profileOf(tx, await tx.mutation(api.profiles.ensure, {}));
    expect(p).toMatchObject({ github: "ada", x: "adalovelace", avatarUrl: "https://cdn.example/a.png", xFollowers: 42 });
    expect(p.xFollowersAt).toBeGreaterThan(0);
    expect(await tx.run((ctx) => ctx.db.query("profilePrefills").collect())).toHaveLength(0);
  });

  it("leaves an existing profile — and its confirmed handle — alone", async () => {
    const tx = t();
    const id = await tx.run((ctx) => ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: true }));
    expect(await tx.mutation(api.profiles.ensure, {})).toBe(id);
    expect(await profileOf(tx, id)).toMatchObject({ username: "ada" });
    expect((await profileOf(tx, id)).handleConfirmed).toBeUndefined();
  });
});

describe("an unconfirmed handle is invisible on every public read path", () => {
  it("hides the founder from the profile page, history, search, sitemap, follows and the MCP gateway", async () => {
    const tx = t();
    const { profileId, username } = await minted(tx);
    expect(username).toBe("ada-lovelace");

    expect(await tx.query(api.public.profileByUsername, { username })).toBeNull();
    expect(await tx.query(api.public.founderHistory, { username, range: "30d" })).toBeNull();
    expect((await tx.query(api.public.search, { q: "ada" })).profiles).toHaveLength(0);
    expect((await tx.query(api.public.sitemap, {})).profiles).toHaveLength(0);
    // /u/<handle>, its opengraph-image, /u/<handle>/card and /api/v1/users/<handle>(/history) all read the two queries above.

    expect((await tx.query(api.public.saasBySlug, { slug: "acme" }))!.owner).toBeNull();
    expect((await tx.query(api.public.board, { board: "most-users" }))[0].owner).toBeNull();

    const follow = await tx.run(async (ctx) => {
      const me = await ctx.db.insert("profiles", { userId: "u_fan", username: "fan", displayName: "Fan", onboardingCompleted: true });
      try { return await followTarget(ctx, (await ctx.db.get(me))!, "profile", profileId); } catch (e) { return { error: (e as Error).message }; }
    });
    expect(follow).toEqual({ error: "This profile is private" });
    expect(await message(tx.mutation(api.gateway.followTool, { auth, targetType: "profile", username }))).toContain("No public founder matches");
    expect((await tx.query(api.gateway.founderUrlTool, { auth })).public).toBe(false);
  });

  it("becomes visible everywhere the moment the founder confirms the handle", async () => {
    const tx = t();
    await minted(tx);
    await tx.mutation(api.profiles.upsert, { username: "ada", displayName: "Ada Lovelace" });

    expect(await profileOf(tx, (await tx.query(api.public.profileByUsername, { username: "ada" }))!._id)).toMatchObject({ handleConfirmed: true });
    expect(await tx.query(api.public.founderHistory, { username: "ada", range: "30d" })).not.toBeNull();
    expect((await tx.query(api.public.search, { q: "ada" })).profiles).toHaveLength(1);
    expect((await tx.query(api.public.sitemap, {})).profiles.map((p) => p.username)).toEqual(["ada"]);
    expect((await tx.query(api.public.saasBySlug, { slug: "acme" }))!.owner).toMatchObject({ username: "ada" });
    expect((await tx.query(api.gateway.founderUrlTool, { auth })).public).toBe(true);
    // The old handle is freed the moment it is replaced; it never resolved while it was a placeholder.
    expect(await tx.query(api.public.profileByUsername, { username: "ada-lovelace" })).toBeNull();
  });

  it("stays hidden when the founder confirms the handle but keeps the profile private", async () => {
    const tx = t();
    await minted(tx);
    await tx.mutation(api.profiles.upsert, { username: "ada", displayName: "Ada Lovelace", profilePublic: false });
    expect(await tx.query(api.public.profileByUsername, { username: "ada" })).toBeNull();
    expect((await tx.query(api.public.saasBySlug, { slug: "acme" }))!.owner).toMatchObject({ username: "ada" });
  });
});

describe("the verify-to-publish wall survives the server-minted profile", () => {
  it("lets an unverified account start a project but never gives it a public page", async () => {
    const tx = t();
    user.emailVerified = false;
    const { username } = await minted(tx);

    const saasId = await tx.mutation(api.saas.create, { name: "Beta", description: "d", websiteUrl: "https://beta.io", tags: [] });
    expect(await message(tx.mutation(api.saas.setPublic, { id: saasId, isPublic: true }))).toContain("Verify your email to publish");
    expect(await message(tx.mutation(api.profiles.upsert, { username: "ada", displayName: "Ada Lovelace" }))).toContain("Verify your email to publish");
    expect(await tx.query(api.public.profileByUsername, { username })).toBeNull();
    expect(await tx.query(api.public.profileByUsername, { username: "ada" })).toBeNull();
    expect(await message(tx.mutation(api.profiles.completeOnboarding, {}))).toContain("Verify your email to publish");
  });

  it("refuses to finish onboarding while the handle is still the minted placeholder", async () => {
    const tx = t();
    await tx.mutation(api.profiles.ensure, {});
    expect(await message(tx.mutation(api.profiles.completeOnboarding, {}))).toContain("Confirm your founder handle");
    await tx.mutation(api.profiles.upsert, { username: "ada", displayName: "Ada Lovelace" });
    await tx.mutation(api.profiles.completeOnboarding, {});
    expect(await tx.run((ctx) => ctx.db.query("profiles").first())).toMatchObject({ onboardingCompleted: true, handleConfirmed: true });
  });
});
