/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_MCP_SCOPES, displayPrefix, sha256Hex } from "./lib/tokens";

// One fake Better Auth user whose verification state each test flips; the dashboard reads it via safeGetAuthUser, the gateway via getAnyUserById.
const user = { _id: "u1", email: "ada@example.com", name: "Ada", emailVerified: false };
vi.mock("./auth", () => ({ authComponent: { safeGetAuthUser: async () => user, getAnyUserById: async (_ctx: unknown, id: string) => (id === user._id ? user : null) } }));
vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const GATEWAY = "test-gateway-secret";
process.env.UT_GATEWAY_SECRET = GATEWAY;
const MCP = "ut_mcp_" + "a".repeat(40);
const auth = { hash: sha256Hex(MCP), gateway: GATEWAY };
const modules = import.meta.glob("./**/*.*s");
const t = () => convexTest(schema, modules).withIdentity({ subject: "u1" });

async function seed(tx: ReturnType<typeof t>) {
  return tx.run(async (ctx) => {
    const profileId = await ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: false });
    await ctx.db.insert("developerTokens", { profileId, type: "mcp", name: "agent", prefix: displayPrefix(MCP), hash: sha256Hex(MCP), scopes: [...DEFAULT_MCP_SCOPES], createdAt: Date.now() });
    const saasId = await ctx.db.insert("saas", { ownerId: profileId, name: "Acme", slug: "acme", description: "d", websiteUrl: "https://acme.io", tags: [], isPublic: false, trust: "pending", totalUsers: 10, newUsers24h: 1, newUsers7d: 2, newUsers30d: 3, growth30dPct: 0 });
    return { profileId, saasId };
  });
}

const message = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return (e as ConvexError<{ message?: string }>).data?.message ?? (e as Error).message; }
  throw new Error("expected the call to fail");
};
const isPublic = (tx: ReturnType<typeof t>, id: Id<"saas">) => tx.run(async (ctx) => (await ctx.db.get(id))!.isPublic);

beforeEach(() => { user.emailVerified = false; });

describe("publishing requires a verified email", () => {
  it("saas.setPublic refuses unverified owners and allows verified ones", async () => {
    const tx = t();
    const { saasId } = await seed(tx);
    expect(await message(tx.mutation(api.saas.setPublic, { id: saasId, isPublic: true }))).toContain("Verify your email to publish");
    expect(await isPublic(tx, saasId)).toBe(false);
    user.emailVerified = true;
    await tx.mutation(api.saas.setPublic, { id: saasId, isPublic: true });
    expect(await isPublic(tx, saasId)).toBe(true);
  });

  it("unpublishing never needs verification", async () => {
    const tx = t();
    const { saasId } = await seed(tx);
    await tx.run((ctx) => ctx.db.patch(saasId, { isPublic: true }));
    await tx.mutation(api.saas.setPublic, { id: saasId, isPublic: false });
    expect(await isPublic(tx, saasId)).toBe(false);
  });

  it("gateway.updateProjectTool gates isPublic: true but not other edits", async () => {
    const tx = t();
    const { saasId } = await seed(tx);
    const r = await message(tx.mutation(api.gateway.updateProjectTool, { auth, projectId: saasId, isPublic: true }));
    expect(r).toContain("Verify your email to publish");
    await tx.mutation(api.gateway.updateProjectTool, { auth, projectId: saasId, description: "Acme does things" });
    expect(await isPublic(tx, saasId)).toBe(false);
    user.emailVerified = true;
    const ok = await tx.mutation(api.gateway.updateProjectTool, { auth, projectId: saasId, isPublic: true });
    expect(ok.project.isPublic).toBe(true);
  });

  it("profiles.upsert refuses a public founder profile until verified, private is fine; completeOnboarding is gated too", async () => {
    const tx = t();
    await seed(tx);
    const base = { username: "ada", displayName: "Ada Lovelace" };
    expect(await message(tx.mutation(api.profiles.upsert, base))).toContain("Verify your email to publish");
    await tx.mutation(api.profiles.upsert, { ...base, profilePublic: false });
    expect(await message(tx.mutation(api.profiles.completeOnboarding, {}))).toContain("Verify your email to publish");
    user.emailVerified = true;
    await tx.mutation(api.profiles.upsert, base);
    await tx.mutation(api.profiles.completeOnboarding, {});
    const p = await tx.run((ctx) => ctx.db.query("profiles").withIndex("by_username", (q) => q.eq("username", "ada")).unique());
    expect(p).toMatchObject({ displayName: "Ada Lovelace", onboardingCompleted: true });
  });
});
