/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

vi.mock("./auth", () => ({ authComponent: { safeGetAuthUser: async () => null } }));

const modules = import.meta.glob("./**/*.*s");

const HTML = `<!doctype html><html><head>
  <title>Acme &mdash; Analytics for indie SaaS</title>
  <meta name="description" content="See which SaaS products are actually growing.">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <script src="https://js.stripe.com/v3/"></script>
  <script src="https://eu.i.posthog.com/static/array.js"></script>
</head><body>We also love Paddle, Firebase and Clerk.</body></html>`;

const page = () => vi.stubGlobal("fetch", vi.fn(async () => new Response(HTML, { status: 200, headers: { "content-type": "text/html" } })));

async function seedClaimed(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("profiles", { userId: "u_ada", username: "ada", displayName: "Ada", onboardingCompleted: true });
    await ctx.db.insert("saas", {
      ownerId, name: "Acme", slug: "acme", description: "Analytics.", websiteUrl: "https://www.acme.com", tags: [], isPublic: true,
      trust: "verified", totalUsers: 10, newUsers24h: 0, newUsers7d: 0, newUsers30d: 0, growth30dPct: 0,
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("previewSite", () => {
  it("refuses without a matching gateway secret, before any network call", async () => {
    const t = convexTest(schema, modules);
    page();
    vi.stubEnv("UT_GATEWAY_SECRET", "s3cret");
    await expect(t.action(api.enrich.previewSite, { url: "https://acme.com" })).rejects.toThrow();
    await expect(t.action(api.enrich.previewSite, { gateway: "wrong", url: "https://acme.com" })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed when the deployment has no gateway secret at all", async () => {
    const t = convexTest(schema, modules);
    page();
    await expect(t.action(api.enrich.previewSite, { gateway: "", url: "https://acme.com" })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("applies the SSRF guard pre-auth: loopback, RFC1918, link-local and metadata are never fetched", async () => {
    const t = convexTest(schema, modules);
    page();
    vi.stubEnv("UT_GATEWAY_SECRET", "s3cret");
    for (const url of ["localhost", "http://127.0.0.1/", "http://10.0.0.5", "http://192.168.1.1", "http://172.16.0.9", "http://169.254.169.254/latest/meta-data/", "http://metadata.google.internal", "http://box.local", "file:///etc/passwd", "javascript:alert(1)"]) {
      await expect(t.action(api.enrich.previewSite, { gateway: "s3cret", url }), url).rejects.toThrow(/public website address/);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the reading and the detected stack without writing anything", async () => {
    const t = convexTest(schema, modules);
    page();
    vi.stubEnv("UT_GATEWAY_SECRET", "s3cret");
    const res = await t.action(api.enrich.previewSite, { gateway: "s3cret", url: "acme.com" });
    expect(res).toMatchObject({ url: "https://acme.com", name: "Acme", description: "See which SaaS products are actually growing.", claimed: null });
    expect(res.logoUrl).toBe("https://acme.com/apple-touch-icon.png");
    // Prose naming Paddle, Firebase and Clerk proves nothing; only the two loaded scripts count.
    expect(res.hints).toMatchObject({ analytics: "posthog", monetization: "stripe" });
    expect(res.hints.identity).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.query("saas").collect())).toHaveLength(0);
  });

  it("reports a domain that is already a public page, ignoring www", async () => {
    const t = convexTest(schema, modules);
    page();
    vi.stubEnv("UT_GATEWAY_SECRET", "s3cret");
    await seedClaimed(t);
    const res = await t.action(api.enrich.previewSite, { gateway: "s3cret", url: "https://acme.com" });
    expect(res.claimed).toEqual({ slug: "acme", name: "Acme" });
  });

  it("does not report a private project as claimed", async () => {
    const t = convexTest(schema, modules);
    page();
    vi.stubEnv("UT_GATEWAY_SECRET", "s3cret");
    await seedClaimed(t);
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("saas").collect())[0];
      await ctx.db.patch(row._id, { isPublic: false });
    });
    expect((await t.action(api.enrich.previewSite, { gateway: "s3cret", url: "https://acme.com" })).claimed).toBeNull();
  });
});
