/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { normalizeHost } from "./embeds";

vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const GATEWAY = "test-gateway-secret";
process.env.UT_GATEWAY_SECRET = GATEWAY;
const modules = import.meta.glob("./**/*.*s");
const t = () => convexTest(schema, modules);

const seed = async (tx: ReturnType<typeof t>, patch: Record<string, unknown> = {}) => {
  const ownerId = await tx.run((ctx) => ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: true }));
  return tx.run((ctx) => ctx.db.insert("saas", { ownerId, name: "Acme", slug: "acme", description: "d", websiteUrl: "https://acme.io", tags: [], isPublic: true, trust: "verified", totalUsers: 900, newUsers24h: 20, newUsers7d: 120, newUsers30d: 400, growth30dPct: 80, growth7dPct: 15, lastSyncedAt: 5, ...patch }));
};

describe("normalizeHost", () => {
  it("lowercases, strips www/port and rejects junk", () => {
    expect(normalizeHost("WWW.Acme.io:443")).toBe("acme.io");
    expect(normalizeHost("https://www.acme.io/pricing")).toBe("acme.io");
    expect(normalizeHost("localhost")).toBeNull();
    expect(normalizeHost("<script>")).toBeNull();
    expect(normalizeHost("")).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
  });
});

describe("embeds.record", () => {
  it("refuses calls without the gateway secret", async () => {
    const tx = t();
    await seed(tx);
    expect(await tx.mutation(api.embeds.record, { slug: "acme", host: "acme.io" })).toEqual({ ok: false });
    expect(await tx.mutation(api.embeds.record, { gateway: "wrong", slug: "acme", host: "acme.io" })).toEqual({ ok: false });
    expect(await tx.run((ctx) => ctx.db.query("embedSites").collect())).toHaveLength(0);
  });

  it("creates one row per host, counts loads and materializes the distinct-host count once", async () => {
    const tx = t();
    const id = await seed(tx);
    expect(await tx.mutation(api.embeds.record, { gateway: GATEWAY, slug: "acme", host: "www.acme.io" })).toEqual({ ok: true, host: "acme.io" });
    expect(await tx.mutation(api.embeds.record, { gateway: GATEWAY, slug: "acme", host: "acme.io" })).toEqual({ ok: true, host: "acme.io" });
    expect(await tx.mutation(api.embeds.record, { gateway: GATEWAY, slug: "acme", host: "blog.acme.io" })).toEqual({ ok: true, host: "blog.acme.io" });
    const rows = await tx.run((ctx) => ctx.db.query("embedSites").collect());
    expect(rows.map((r) => [r.host, r.loads]).sort()).toEqual([["acme.io", 2], ["blog.acme.io", 1]]);
    expect((await tx.run((ctx) => ctx.db.get(id as Id<"saas">)))?.embedSiteCount).toBe(2);
  });
  it("counts badge loads apart on the same per-host row", async () => {
    const tx = t();
    const id = await seed(tx);
    expect(await tx.mutation(api.embeds.record, { gateway: GATEWAY, slug: "acme", host: "acme.io", kind: "badge" })).toEqual({ ok: true, host: "acme.io" });
    await tx.mutation(api.embeds.record, { gateway: GATEWAY, slug: "acme", host: "acme.io", kind: "badge" });
    await tx.mutation(api.embeds.record, { gateway: GATEWAY, slug: "acme", host: "acme.io", kind: "widget" });
    const rows = await tx.run((ctx) => ctx.db.query("embedSites").collect());
    expect(rows.map((r) => [r.host, r.loads, r.badgeLoads])).toEqual([["acme.io", 1, 2]]);
    expect((await tx.run((ctx) => ctx.db.get(id as Id<"saas">)))?.embedSiteCount).toBe(1);
  });
  it("ignores drafts, unknown slugs and invalid hosts", async () => {
    const tx = t();
    await seed(tx, { isPublic: false });
    expect(await tx.mutation(api.embeds.record, { gateway: GATEWAY, slug: "acme", host: "acme.io" })).toEqual({ ok: false });
    expect(await tx.mutation(api.embeds.record, { gateway: GATEWAY, slug: "nope", host: "acme.io" })).toEqual({ ok: false });
    expect(await tx.mutation(api.embeds.record, { gateway: GATEWAY, slug: "acme", host: "not a host" })).toEqual({ ok: false });
    expect(await tx.run((ctx) => ctx.db.query("embedSites").collect())).toEqual([]);
  });
});

describe("public.widget", () => {
  it("returns public numbers only and honours visibility", async () => {
    const tx = t();
    await seed(tx, { visibility: { growth: false } });
    const w = await tx.query(api.public.widget, { slug: "acme" });
    expect(w).toMatchObject({ slug: "acme", name: "Acme", totalUsers: 900, trust: "verified", lastSyncedAt: 5, spark: [] });
    expect(w?.newUsers30d).toBeUndefined();
    expect(w?.growth30dPct).toBeUndefined();
    expect(w && "ownerId" in w).toBe(false);
  });
  it("is null for drafts", async () => {
    const tx = t();
    await seed(tx, { isPublic: false });
    expect(await tx.query(api.public.widget, { slug: "acme" })).toBeNull();
  });
});
