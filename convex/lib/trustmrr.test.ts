import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrustmrrError, fetchStartup, mapChannel, mapTech, mapTrustmrrStartup, parseTrustmrrRef, prefillPatch } from "./trustmrr";
import { DOCS_SHAPE, SNAKE_BARE, SPARSE } from "./trustmrr.fixtures";
import type { Doc } from "../_generated/dataModel";

// Anything TrustMRR reports about money or traction must never reach a prefill key.
const REVENUE_KEY_RE = /mrr|revenue|profit|price|asking|growth|multiple|customer|subscription|rank|visitor|sale|impression|domainrating|follower/i;
const assertNoRevenue = (v: unknown) => { for (const k of Object.keys(v as object)) expect(k, `key ${k}`).not.toMatch(REVENUE_KEY_RE); };

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(2026, 8, 4, 12) }));
afterEach(() => vi.useRealTimers());

describe("parseTrustmrrRef", () => {
  it("accepts every URL variant and bare slugs", () => {
    for (const s of ["https://trustmrr.com/startup/shipfast", "https://www.trustmrr.com/startups/shipfast/", "trustmrr.com/startup/shipfast?ref=x#top", "shipfast", " ShipFast ", "ship-fast-2/"]) expect(parseTrustmrrRef(s)).toBe(s.includes("ship-fast-2") ? "ship-fast-2" : "shipfast");
  });
  it("rejects junk", () => {
    for (const s of ["", "https://example.com/startup/x", "has space", "a".repeat(81), "../etc", "https://trustmrr.com/"]) expect(parseTrustmrrRef(s)).toBeNull();
  });
});

describe("mapTech / mapChannel", () => {
  it("matches slugs, labels, aliases and js suffixes; drops the unknown", () => {
    expect(["Next.js", "nextjs", "tailwindcss", "Tailwind CSS", "postgres", "vuejs", "node", "shadcn-ui", "react-native", "Google Analytics", ".NET", "socket.io", "Handmade"].map(mapTech))
      .toEqual(["nextjs", "nextjs", "tailwind", "tailwind", "postgresql", "vue", "nodejs", "shadcn", "reactnative", "ga4", "dotnet", "socketio", undefined]);
    expect(["x-twitter", "SEO", "google-ads", "Instagram", "producthunt"].map((c) => mapChannel(c))).toEqual(["x", "seo", "paid-ads", undefined, "product-hunt"]);
    expect(mapChannel("tv", "paid")).toBe("paid-ads");
  });
});

describe("mapTrustmrrStartup", () => {
  it("maps the documented shape and reports what it could not place", () => {
    const { prefill, unmapped, slug } = mapTrustmrrStartup(DOCS_SHAPE);
    expect(slug).toBe("shipfast");
    expect(prefill).toEqual({
      name: "ShipFast",
      description: DOCS_SHAPE.data.description,
      websiteUrl: "https://shipfa.st",
      logoUrl: "https://cdn.trustmrr.com/icons/shipfast.png",
      category: "developer-tools",
      markets: ["developer-tools"],
      techStack: ["nextjs", "mongodb", "tailwind", "stripe"],
      marketingChannels: ["seo", "x"],
      cofounders: [{ name: "Marc Lou", x: "marc_louvion" }],
      country: "TH",
      funding: "bootstrapped",
      teamSize: "2-5",
      foundedAt: Date.UTC(2023, 8, 1),
      valueProposition: DOCS_SHAPE.data.startupInsights.valueProposition,
      problemSolved: DOCS_SHAPE.data.startupInsights.problemSolved,
      audience: DOCS_SHAPE.data.startupInsights.targetPersona,
      pricingSummary: "One-time purchase with tiered licenses",
    });
    expect(unmapped).toEqual(["stack: some-obscure-lib", "channel: billboards"]);
    assertNoRevenue(prefill);
  });

  it("tolerates snake_case, bare objects, comma strings and loose values", () => {
    const { prefill, unmapped } = mapTrustmrrStartup(SNAKE_BARE);
    expect(prefill).toMatchObject({
      name: "Pocket Budget", websiteUrl: "https://pocketbudget.app", logoUrl: "https://cdn.trustmrr.com/icons/pocket-budget.png", country: "DE",
      category: "fintech", markets: ["fintech", "health"], techStack: ["reactnative", "expo", "supabase", "postgresql", "nodejs", "vue"],
      marketingChannels: ["app-store", "reddit", "paid-ads"], cofounders: [{ x: "ada" }, { name: "Grace Hopper", x: "grace_h" }, { name: "No Handle" }],
      teamSize: "11-50", funding: "vc", foundedAt: Date.UTC(2021, 2, 1), audience: "B2B and B2C", pricingSummary: "Free tier + family plan subscription", projectType: "mobile",
    });
    expect(unmapped).toEqual(["stack: Unknownium", "channel: Instagram"]);
    assertNoRevenue(prefill);
  });

  it("survives junk and yields only what is valid", () => {
    const { prefill, unmapped } = mapTrustmrrStartup(SPARSE);
    expect(prefill).toEqual({ name: "Tiny" });
    expect(unmapped).toEqual([]);
    expect(mapTrustmrrStartup(null).prefill).toEqual({});
    expect(mapTrustmrrStartup("nope").prefill).toEqual({});
  });

  it("never emits a revenue-ish key even when the source spells them in every case", () => {
    const { prefill } = mapTrustmrrStartup({ data: { ...DOCS_SHAPE.data, mrr: 1, MRR: 2, monthly_revenue: 3, profit_margin: 4, asking_price: 5, growth_mrr_30d: 6, revenuePerVisitor: 7 } });
    assertNoRevenue(prefill);
    expect(JSON.stringify(prefill)).not.toMatch(/180000|4250000|98000000|50000000/);
  });

  it("caps lists and text at the profile limits", () => {
    const { prefill } = mapTrustmrrStartup({ name: "x".repeat(200), categories: ["ai", "fintech", "marketing", "analytics", "ecommerce", "education", "sales"], cofounders: Array.from({ length: 8 }, (_, i) => ({ xHandle: `f${i}` })) });
    expect(prefill.name).toHaveLength(100);
    expect(prefill.markets).toHaveLength(5);
    expect(prefill.cofounders).toHaveLength(5);
  });
});

describe("prefillPatch", () => {
  const saas = { name: "Acme", description: "", websiteUrl: "https://acme.io", techStack: [], markets: ["ai"], country: undefined } as unknown as Doc<"saas">;
  const prefill = { name: "ShipFast", description: "d", techStack: ["nextjs"], markets: ["fintech"], country: "TH" };
  it("fills only the empty fields by default and everything with overwrite", () => {
    expect(prefillPatch(saas, prefill, false)).toEqual({ description: "d", techStack: ["nextjs"], country: "TH" });
    expect(prefillPatch(saas, prefill, true)).toEqual(prefill);
  });
});

describe("fetchStartup", () => {
  const KEY = "tmrr_secret_key";
  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));

  it("sends the key only in the header and returns prefill + source", async () => {
    const fetch = reply(200, DOCS_SHAPE);
    const r = await fetchStartup("shipfast", KEY, fetch as unknown as typeof globalThis.fetch);
    expect(fetch).toHaveBeenCalledWith("https://trustmrr.com/api/v1/startups/shipfast", expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${KEY}` }) }));
    expect(r.source).toEqual({ slug: "shipfast", url: "https://trustmrr.com/startup/shipfast" });
    expect(r.prefill.name).toBe("ShipFast");
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it("maps 404 / 429 / 401 / 500 / timeout to typed errors without the key", async () => {
    const cases: [ReturnType<typeof reply> | (() => Promise<never>), string][] = [
      [reply(404, { error: "Startup not found" }), "not_found"],
      [reply(429, { error: "slow down" }, { "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 30) }), "rate_limited"],
      [reply(401, { error: "bad key" }), "not_configured"],
      [reply(500, { error: "boom" }), "upstream"],
      [async () => { throw new DOMException("timeout", "TimeoutError"); }, "upstream"],
    ];
    for (const [fetch, code] of cases) {
      const err = await fetchStartup("shipfast", KEY, fetch as unknown as typeof globalThis.fetch).catch((e) => e as TrustmrrError);
      expect(err).toBeInstanceOf(TrustmrrError);
      expect((err as TrustmrrError).code).toBe(code);
      expect((err as TrustmrrError).message).not.toContain(KEY);
      if (code === "rate_limited") expect((err as TrustmrrError).retryAfterSec).toBe(30);
    }
  });
});
