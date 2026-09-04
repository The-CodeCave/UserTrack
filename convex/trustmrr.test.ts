/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "./schema";
import rateLimiterSchema from "../node_modules/@convex-dev/rate-limiter/dist/component/schema.js";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_MCP_SCOPES, displayPrefix, sha256Hex } from "./lib/tokens";
import { publicSaas } from "./public";
import { DOCS_SHAPE } from "./lib/trustmrr.fixtures";

const user = { _id: "u1", email: "ada@example.com", name: "Ada", emailVerified: true };
vi.mock("./auth", () => ({ authComponent: { safeGetAuthUser: async () => user, getAnyUserById: async () => user } }));
vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const GATEWAY = "test-gateway-secret";
process.env.UT_GATEWAY_SECRET = GATEWAY;
const KEY = "tmrr_test_key_never_logged";
const MCP = "ut_mcp_" + "c".repeat(40);
const auth = { hash: sha256Hex(MCP), gateway: GATEWAY };
const modules = import.meta.glob("./**/*.*s");
const rateLimiterModules = import.meta.glob("../node_modules/@convex-dev/rate-limiter/dist/component/**/*.js");

function setup() {
  const t = convexTest(schema, modules);
  t.registerComponent("rateLimiter", rateLimiterSchema, rateLimiterModules);
  return t.withIdentity({ subject: "u1" });
}
async function seed(t: ReturnType<typeof setup>, saas: Record<string, unknown> = {}) {
  return t.run(async (ctx) => {
    const profileId = await ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: true });
    await ctx.db.insert("developerTokens", { profileId, type: "mcp", name: "agent", prefix: displayPrefix(MCP), hash: sha256Hex(MCP), scopes: [...DEFAULT_MCP_SCOPES], createdAt: Date.now() });
    const saasId = await ctx.db.insert("saas", { ownerId: profileId, name: "Acme", slug: "acme", description: "", websiteUrl: "https://acme.io", tags: [], isPublic: true, trust: "unverified", totalUsers: 10, newUsers24h: 0, newUsers7d: 0, newUsers30d: 0, growth30dPct: 0, markets: ["ai"], ...saas });
    return { profileId, saasId };
  });
}
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const failure = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e instanceof ConvexError ? (e.data as { code: string; message: string }) : { code: "plain", message: (e as Error).message }; } return null; };

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(2026, 8, 4, 12) }); process.env.TRUSTMRR_API_KEY = KEY; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete process.env.TRUSTMRR_API_KEY; });

describe("trustmrr.importStartup", () => {
  it("reports not_configured without the operator key and never calls out", async () => {
    delete process.env.TRUSTMRR_API_KEY;
    const fetch = reply(200, DOCS_SHAPE); vi.stubGlobal("fetch", fetch);
    const t = setup(); await seed(t);
    expect(await t.query(api.trustmrr.status, {})).toEqual({ configured: false });
    expect(await failure(t.action(api.trustmrr.importStartup, { urlOrSlug: "shipfast" }))).toMatchObject({ code: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("hides whether the operator key is configured from callers without a founder profile", async () => {
    const t = setup();
    expect(await t.query(api.trustmrr.status, {})).toEqual({ configured: false });
    await seed(t);
    expect(await t.query(api.trustmrr.status, {})).toEqual({ configured: true });
  });

  it("rejects bad references before spending a slot", async () => {
    const t = setup(); await seed(t);
    expect(await failure(t.action(api.trustmrr.importStartup, { urlOrSlug: "https://example.com/x" }))).toMatchObject({ code: "bad_request" });
  });

  it("returns the prefill + source and keeps the key out of the result", async () => {
    const fetch = reply(200, DOCS_SHAPE); vi.stubGlobal("fetch", fetch);
    const t = setup(); await seed(t);
    const r = await t.action(api.trustmrr.importStartup, { urlOrSlug: "https://trustmrr.com/startup/shipfast/" });
    expect(r.source).toEqual({ slug: "shipfast", url: "https://trustmrr.com/startup/shipfast" });
    expect(r.prefill).toMatchObject({ name: "ShipFast", techStack: ["nextjs", "mongodb", "tailwind", "stripe"], funding: "bootstrapped" });
    expect(r.unmapped).toHaveLength(2);
    expect(JSON.stringify(r)).not.toContain(KEY);
    expect(Object.keys(r.prefill).join()).not.toMatch(/mrr|revenue|price|profit/i);
    expect(await t.run((ctx) => ctx.db.query("saas").collect())).toHaveLength(1);
  });

  it("maps 404 and 429 from TrustMRR", async () => {
    const t = setup(); await seed(t);
    vi.stubGlobal("fetch", reply(404, { error: "Startup not found" }));
    expect(await failure(t.action(api.trustmrr.importStartup, { urlOrSlug: "ghost" }))).toMatchObject({ code: "not_found" });
    vi.stubGlobal("fetch", reply(429, { error: "slow down" }));
    expect(await failure(t.action(api.trustmrr.importStartup, { urlOrSlug: "ghost" }))).toMatchObject({ code: "rate_limited", message: "TrustMRR rate limit, try again in a minute" });
  });

  it("allows 5 imports per founder per 10 minutes", async () => {
    vi.stubGlobal("fetch", reply(200, DOCS_SHAPE));
    const t = setup(); await seed(t);
    for (let i = 0; i < 5; i++) await t.action(api.trustmrr.importStartup, { urlOrSlug: "shipfast" });
    const denied = await failure(t.action(api.trustmrr.importStartup, { urlOrSlug: "shipfast" }));
    expect(denied).toMatchObject({ code: "rate_limited" });
    expect(denied?.message).toMatch(/^Import limit reached/);
    vi.setSystemTime(Date.now() + 10 * 60_000 + 1);
    await expect(t.action(api.trustmrr.importStartup, { urlOrSlug: "shipfast" })).resolves.toBeTruthy();
  });
});

describe("gateway.importFromTrustmrr (MCP)", () => {
  it("returns the prefill only without a project ref, and refuses apply without one", async () => {
    vi.stubGlobal("fetch", reply(200, DOCS_SHAPE));
    const t = setup(); await seed(t);
    const r = await t.action(api.gateway.importFromTrustmrr, { auth, urlOrSlug: "shipfast" });
    expect(r.applied).toBeNull();
    expect(r.prefill.name).toBe("ShipFast");
    expect(await failure(t.action(api.gateway.importFromTrustmrr, { auth, urlOrSlug: "shipfast", apply: true }))).toMatchObject({ code: "bad_request" });
  });

  it("applies to the empty fields only, links the slug and audits; overwrite replaces", async () => {
    vi.stubGlobal("fetch", reply(200, DOCS_SHAPE));
    const t = setup(); const { saasId } = await seed(t);
    const r = await t.action(api.gateway.importFromTrustmrr, { auth, slug: "acme", urlOrSlug: "shipfast", apply: true });
    expect(r.applied?.applied).not.toContain("name");
    expect(r.applied?.applied).toEqual(expect.arrayContaining(["description", "techStack", "cofounders", "trustmrrSlug"]));
    let s = (await t.run((ctx) => ctx.db.get(saasId as Id<"saas">)))!;
    expect(s).toMatchObject({ name: "Acme", markets: ["ai"], description: DOCS_SHAPE.data.description, techStack: ["nextjs", "mongodb", "tailwind", "stripe"], trustmrrSlug: "shipfast", country: "TH" });
    expect(s.mrr).toBeUndefined();
    const again = await t.action(api.gateway.importFromTrustmrr, { auth, slug: "acme", urlOrSlug: "shipfast", apply: true, overwrite: true });
    expect(again.applied?.applied).toContain("name");
    s = (await t.run((ctx) => ctx.db.get(saasId as Id<"saas">)))!;
    expect(s).toMatchObject({ name: "ShipFast", markets: ["developer-tools"] });
    const logs = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(logs.map((l) => l.action)).toEqual(["import_from_trustmrr", "import_from_trustmrr"]);
  });

  it("surfaces not_configured as a gateway failure", async () => {
    delete process.env.TRUSTMRR_API_KEY;
    const t = setup(); await seed(t);
    expect(await failure(t.action(api.gateway.importFromTrustmrr, { auth, urlOrSlug: "shipfast" }))).toMatchObject({ code: "not_configured" });
  });
});

describe("trustmrrSlug on the public row", () => {
  it("is exposed normally and stripped in anonymous mode", async () => {
    const t = setup();
    const { saasId } = await seed(t, { trustmrrSlug: "acme" });
    const s = (await t.run((ctx) => ctx.db.get(saasId as Id<"saas">)))!;
    expect(publicSaas(s).trustmrrSlug).toBe("acme");
    expect(publicSaas({ ...s, anonymous: true }).trustmrrSlug).toBeUndefined();
  });

  it("is validated and clearable through saas.update", async () => {
    const t = setup(); const { saasId } = await seed(t, { trustmrrSlug: "acme" });
    const base = { id: saasId as Id<"saas">, name: "Acme", description: "d", websiteUrl: "https://acme.io", tags: [] };
    await expect(t.mutation(api.saas.update, { ...base, trustmrrSlug: "Not A Slug" })).rejects.toThrow(/TrustMRR slug/);
    await t.mutation(api.saas.update, { ...base, trustmrrSlug: "" });
    expect((await t.run((ctx) => ctx.db.get(saasId as Id<"saas">)))!.trustmrrSlug).toBeUndefined();
  });
});
