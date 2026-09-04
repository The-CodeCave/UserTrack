/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_MCP_SCOPES, displayPrefix, sha256Hex } from "./lib/tokens";

const user = { _id: "u1", email: "ada@example.com", name: "Ada", emailVerified: true };
vi.mock("./auth", () => ({ authComponent: { safeGetAuthUser: async () => user, getAnyUserById: async () => user } }));
vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const GATEWAY = "test-gateway-secret";
process.env.UT_GATEWAY_SECRET = GATEWAY;
const MCP = "ut_mcp_" + "b".repeat(40);
const modules = import.meta.glob("./**/*.*s");
const t = () => convexTest(schema, modules).withIdentity({ subject: "u1" });

const profile = { markets: ["ai", "developer-tools"], techStack: ["nextjs", "convex", "Handmade Thing"], marketingChannels: ["seo", "x"], cofounders: [{ name: "Grace", x: "@grace", github: "https://github.com/grace" }], country: "de", funding: "bootstrapped" as const, teamSize: "2-5" as const, valueProposition: "Growth data for SaaS", problemSolved: "Nobody trusts screenshots", audience: "Indie founders", pricingSummary: "Free, Pro per seat", additionalInfo: "Open API" };

async function seed(tx: ReturnType<typeof t>, extra: Record<string, unknown> = {}) {
  return tx.run(async (ctx) => {
    const profileId = await ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", x: "ada", onboardingCompleted: true });
    await ctx.db.insert("developerTokens", { profileId, type: "mcp", name: "agent", prefix: displayPrefix(MCP), hash: sha256Hex(MCP), scopes: [...DEFAULT_MCP_SCOPES], createdAt: Date.now() });
    const saasId = await ctx.db.insert("saas", { ownerId: profileId, name: "Acme", slug: "acme", description: "d", websiteUrl: "https://acme.io", logoUrl: "https://acme.io/logo.png", appStoreUrl: "https://apps.apple.com/app/id1", tags: [], category: "developer-tools", isPublic: true, trust: "verified", totalUsers: 900, newUsers24h: 20, newUsers7d: 120, newUsers30d: 400, growth30dPct: 80, lastSyncedAt: Date.now(), ...extra });
    return { profileId, saasId };
  });
}
const get = (tx: ReturnType<typeof t>, id: Id<"saas">) => tx.run(async (ctx) => (await ctx.db.get(id))!);
// saas.update takes the whole editable shape (the form always submits it); tests only vary the profile part.
const BASE = { name: "Acme", description: "d", websiteUrl: "https://acme.io", logoUrl: "https://acme.io/logo.png", tags: [] };

describe("saas.update — product profile", () => {
  it("stores the normalised profile and reports it to the owner", async () => {
    const tx = t();
    const { saasId } = await seed(tx);
    await tx.mutation(api.saas.update, { id: saasId, ...BASE, ...profile });
    const s = await get(tx, saasId);
    expect(s).toMatchObject({ markets: ["ai", "developer-tools"], techStack: ["nextjs", "convex", "handmade-thing"], marketingChannels: ["seo", "x"], cofounders: [{ name: "Grace", x: "grace", github: "grace" }], country: "DE", funding: "bootstrapped", teamSize: "2-5", pricingSummary: "Free, Pro per seat" });
    expect(s.anonymous).toBeUndefined();
    const mine = await tx.query(api.saas.getMine, { id: saasId });
    expect(mine.techStack).toEqual(["nextjs", "convex", "handmade-thing"]);
  });

  it("rejects unknown countries and invalid cofounder handles", async () => {
    const tx = t();
    const { saasId } = await seed(tx);
    await expect(tx.mutation(api.saas.update, { id: saasId, ...BASE, country: "ZZ" })).rejects.toThrow(/Unknown country/);
    await expect(tx.mutation(api.saas.update, { id: saasId, ...BASE, cofounders: [{ x: "bad handle" }] })).rejects.toThrow(/X handle/);
  });

  it("MCP update_project accepts the same fields", async () => {
    const tx = t();
    await seed(tx);
    const r = await tx.mutation(api.gateway.updateProjectTool, { auth: { hash: sha256Hex(MCP), gateway: GATEWAY }, slug: "acme", techStack: ["react", "nope!!"], anonymous: true, foundedAt: Date.UTC(2024, 2, 1) });
    expect(r.updated.sort()).toEqual(["anonymous", "foundedAt", "techStack"]);
    expect(r.project).toMatchObject({ techStack: ["react", "nope"], anonymous: true, foundedAt: "2024-03-01T00:00:00.000Z" });
  });
});

describe("anonymous mode on public surfaces", () => {
  it("saasBySlug / boards drop the owner, logo, website, stores and cofounders but keep name, metrics and stack", async () => {
    const tx = t();
    const { saasId } = await seed(tx, { anonymous: true, cofounders: [{ name: "Grace" }], techStack: ["nextjs"] });
    const s = (await tx.query(api.public.saasBySlug, { slug: "acme" }))!;
    expect(s.owner).toBeNull();
    for (const k of ["logoUrl", "websiteUrl", "appStoreUrl", "playStoreUrl", "cofounders", "ownerId", "logoStorageId"]) expect((s as Record<string, unknown>)[k], k).toBeUndefined();
    expect(s).toMatchObject({ name: "Acme", totalUsers: 900, anonymous: true, techStack: ["nextjs"] });
    const row = (await tx.query(api.public.board, { board: "most-new" }))[0];
    expect(row.owner).toBeNull();
    expect(row.logoUrl).toBeUndefined();
    expect((await tx.query(api.public.suggest, { q: "" }))[0].logoUrl).toBeUndefined();
    await tx.mutation(api.saas.update, { id: saasId, ...BASE, anonymous: false });
    expect((await tx.query(api.public.saasBySlug, { slug: "acme" }))!.owner?.username).toBe("ada");
  });

  it("anonymous projects never appear on the founder page", async () => {
    const tx = t();
    await seed(tx, { anonymous: true });
    const p = (await tx.query(api.public.profileByUsername, { username: "ada" }))!;
    expect(p.saas).toEqual([]);
    expect(p.aggregates.projectCount ?? 0).toBe(0);
  });
});

describe("hideFromSearch + stacks", () => {
  it("sitemap skips hidden products and lists only stacks with visible products", async () => {
    const tx = t();
    const { profileId } = await seed(tx, { hideFromSearch: true, techStack: ["nextjs"] });
    await tx.run((ctx) => ctx.db.insert("saas", { ownerId: profileId, name: "Beta", slug: "beta", description: "d", websiteUrl: "https://beta.io", tags: [], isPublic: true, trust: "verified", totalUsers: 10, newUsers24h: 0, newUsers7d: 0, newUsers30d: 0, growth30dPct: 0, techStack: ["convex", "custom-thing"] }));
    const m = await tx.query(api.public.sitemap, {});
    expect(m.saas.map((s) => s.slug)).toEqual(["beta"]);
    expect(m.stacks).toEqual(["convex"]);
  });

  it("board / discover / boardMeta filter by stack in memory; hidden products still list", async () => {
    const tx = t();
    await seed(tx, { hideFromSearch: true, techStack: ["nextjs"] });
    expect((await tx.query(api.public.board, { board: "most-new", stack: "nextjs" })).map((s) => s.slug)).toEqual(["acme"]);
    expect(await tx.query(api.public.board, { board: "most-new", stack: "rails" })).toEqual([]);
    expect((await tx.query(api.public.boardMeta, { stack: "nextjs" })).count).toBe(1);
    const d = await tx.query(api.public.discover, { stack: "nextjs" });
    expect(Object.values(d).flat().some((x) => typeof x === "object" && x !== null && (x as { slug?: string }).slug === "acme")).toBe(true);
    expect(Object.values(await tx.query(api.public.discover, { stack: "rails" })).flat().some((x) => typeof x === "object" && x !== null && "slug" in (x as object))).toBe(false);
  });
});

describe("logo upload", () => {
  // convex-test records size + sha256 only; a real upload-URL POST also stores the Content-Type header, which we patch in here.
  const upload = (tx: ReturnType<typeof t>, type: string, bytes: number) => tx.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob([new Uint8Array(bytes)], { type }));
    await (ctx.db as unknown as { patch: (id: Id<"_storage">, v: { contentType: string }) => Promise<void> }).patch(id, { contentType: type });
    return id;
  });

  it("accepts a small PNG, serves it as logoUrl and swaps the stored file on the next upload", async () => {
    const tx = t();
    const { saasId } = await seed(tx);
    const first = await upload(tx, "image/png", 1000);
    await tx.mutation(api.saas.update, { id: saasId, ...BASE, logoStorageId: first });
    let s = await get(tx, saasId);
    expect(s.logoStorageId).toBe(first);
    expect(s.logoUrl).toMatch(/^https?:\/\//);
    const second = await upload(tx, "image/webp", 1000);
    await tx.mutation(api.saas.update, { id: saasId, ...BASE, logoStorageId: second });
    s = await get(tx, saasId);
    expect(s.logoStorageId).toBe(second);
    expect(await tx.run((ctx) => ctx.db.system.get(first))).toBeNull();
    // Pasting a URL drops the uploaded file.
    await tx.mutation(api.saas.update, { id: saasId, ...BASE, logoUrl: "https://acme.io/new.png" });
    s = await get(tx, saasId);
    expect(s.logoStorageId).toBeUndefined();
    expect(s.logoUrl).toBe("https://acme.io/new.png");
    expect(await tx.run((ctx) => ctx.db.system.get(second))).toBeNull();
  });

  it("refuses SVG and files over 1 MB and leaves the project untouched", async () => {
    const tx = t();
    const { saasId } = await seed(tx);
    const svg = await upload(tx, "image/svg+xml", 100);
    await expect(tx.mutation(api.saas.update, { id: saasId, ...BASE, logoStorageId: svg })).rejects.toThrow(/PNG, JPG or WebP/);
    const big = await upload(tx, "image/png", 1_048_577);
    await expect(tx.mutation(api.saas.update, { id: saasId, ...BASE, logoStorageId: big })).rejects.toThrow(/1 MB/);
    expect((await get(tx, saasId)).logoUrl).toBe("https://acme.io/logo.png");
  });
});
