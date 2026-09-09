/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const authState = vi.hoisted(() => ({ emailVerified: true }));
vi.mock("./auth", () => ({ authComponent: { getAnyUserById: async (_ctx: unknown, id: string) => ({ _id: id, emailVerified: authState.emailVerified }), safeGetAuthUser: async () => null } }));
vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const modules = import.meta.glob("./**/*.*s");
const t = () => convexTest(schema, modules);

const seed = async (tx: ReturnType<typeof t>, patch: Record<string, unknown> = {}) => {
  const ownerId = await tx.run((ctx) => ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: true }));
  const saasId = await tx.run((ctx) => ctx.db.insert("saas", { ownerId, name: "Acme", slug: "acme", description: "d", websiteUrl: "https://acme.io", tags: [], isPublic: false, trust: "pending", totalUsers: 0, newUsers24h: 0, newUsers7d: 0, newUsers30d: 0, growth30dPct: 0, ...patch }));
  const integrationId = await tx.run((ctx) => ctx.db.insert("integrations", { saasId, provider: "native", role: "users", config: {}, status: "ok", trust: "verified" }));
  return { saasId, integrationId };
};

const sync = (tx: ReturnType<typeof t>, integrationId: Id<"integrations">, totalUsers: number) =>
  tx.mutation(internal.sync.recordSuccess, { integrationId, startedAt: Date.now(), attempt: 1, role: "users", metrics: { totalUsers }, trust: "verified" });

describe("publish on first sync", () => {
  it("takes the page live once the first users sync lands", async () => {
    authState.emailVerified = true;
    const tx = t();
    const { saasId, integrationId } = await seed(tx);
    await sync(tx, integrationId, 48);
    expect((await tx.run((ctx) => ctx.db.get(saasId)))!.isPublic).toBe(true);
    expect((await tx.run((ctx) => ctx.db.query("events").collect())).some((e) => e.kind === "launched")).toBe(true);
  });

  it("never re-publishes a project the founder switched back to draft", async () => {
    authState.emailVerified = true;
    const tx = t();
    const { saasId, integrationId } = await seed(tx);
    await sync(tx, integrationId, 48);
    await tx.run((ctx) => ctx.db.patch(saasId, { isPublic: false }));
    await sync(tx, integrationId, 60);
    expect((await tx.run((ctx) => ctx.db.get(saasId)))!.isPublic).toBe(false);
  });

  it("leaves the project a draft while the founder's email is unverified", async () => {
    authState.emailVerified = false;
    const tx = t();
    const { saasId, integrationId } = await seed(tx);
    await sync(tx, integrationId, 48);
    expect((await tx.run((ctx) => ctx.db.get(saasId)))!.isPublic).toBe(false);
  });

  it("leaves demo products alone", async () => {
    authState.emailVerified = true;
    const tx = t();
    const { saasId, integrationId } = await seed(tx, { isDemo: true });
    await sync(tx, integrationId, 48);
    expect((await tx.run((ctx) => ctx.db.get(saasId)))!.isPublic).toBe(false);
  });
});
