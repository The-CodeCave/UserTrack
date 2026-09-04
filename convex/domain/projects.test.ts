import { describe, expect, it } from "vitest";
import { DomainError, normalizeCofounders, normalizeProjectInput, normalizeTechStack } from "./projects";
import { PROFILE_LIMITS } from "../../src/lib/profile-options";
import { TECH_STACK, TECH_STACK_MAX } from "../../src/lib/tech-stack";

const base = { name: "Acme", description: "Widgets", websiteUrl: "acme.dev", tags: [] };
const fail = (input: Parameters<typeof normalizeProjectInput>[0]) => { try { normalizeProjectInput(input); } catch (e) { return e as DomainError; } throw new Error("expected a DomainError"); };

describe("normalizeProjectInput — profile", () => {
  it("enforces the raised name / description limits", () => {
    expect(fail({ ...base, name: "x".repeat(PROFILE_LIMITS.name + 1) }).message).toMatch(/at most 100/);
    expect(normalizeProjectInput({ ...base, name: "x".repeat(100) }).name).toHaveLength(100);
    expect(normalizeProjectInput({ ...base, description: "d".repeat(700) }).description).toHaveLength(PROFILE_LIMITS.description);
  });

  it("slices every text field to its limit and drops blanks", () => {
    const out = normalizeProjectInput({ ...base, valueProposition: "v".repeat(400), problemSolved: "p".repeat(400), audience: "a".repeat(300), pricingSummary: "s".repeat(400), additionalInfo: "i".repeat(600), country: "  " });
    expect(out.valueProposition).toHaveLength(300);
    expect(out.problemSolved).toHaveLength(300);
    expect(out.audience).toHaveLength(200);
    expect(out.pricingSummary).toHaveLength(300);
    expect(out.additionalInfo).toHaveLength(500);
    expect(out.country).toBeUndefined();
    expect(normalizeProjectInput({ ...base, valueProposition: "   " }).valueProposition).toBeUndefined();
  });

  it("keeps only curated market / channel slugs, dedupes and caps the lists", () => {
    const out = normalizeProjectInput({ ...base, markets: ["AI", "ai", "bogus", "fintech", "health", "hr", "sales", "design"], marketingChannels: ["seo", "SEO", "tiktok", "made-up"] });
    expect(out.markets).toEqual(["ai", "fintech", "health", "hr", "sales"]);
    expect(out.marketingChannels).toEqual(["seo", "tiktok"]);
    expect(normalizeProjectInput({ ...base, markets: ["bogus"] }).markets).toBeUndefined();
  });

  it("validates country codes and passes funding / team size through", () => {
    expect(normalizeProjectInput({ ...base, country: "de", funding: "bootstrapped", teamSize: "2-5" })).toMatchObject({ country: "DE", funding: "bootstrapped", teamSize: "2-5" });
    expect(fail({ ...base, country: "XX" }).message).toMatch(/Unknown country/);
  });

  it("stores the flags only when set and never invents revenue fields", () => {
    const out = normalizeProjectInput({ ...base, anonymous: false, hideFromSearch: true }) as Record<string, unknown>;
    expect(out.anonymous).toBeUndefined();
    expect(out.hideFromSearch).toBe(true);
    for (const k of ["mrr", "revenue", "arr", "profit", "profitMargin"]) expect(k in out, k).toBe(false);
  });
});

describe("normalizeTechStack", () => {
  it("passes curated slugs, keeps unknown entries as lowercase free text and drops garbage", () => {
    expect(normalizeTechStack(["Next.js", "nextjs", "NEXTJS", "My Custom Thing", "x", "<script>", "postgresql"])).toEqual(["nextjs", "my-custom-thing", "script", "postgresql"]);
    expect(normalizeTechStack([" ", "!"])).toBeUndefined();
  });
  it("caps at the maximum and the catalog is large enough with unique slugs", () => {
    expect(normalizeTechStack(TECH_STACK.map((t) => t.slug))).toHaveLength(TECH_STACK_MAX);
    expect(TECH_STACK.length).toBeGreaterThanOrEqual(80);
    expect(new Set(TECH_STACK.map((t) => t.slug)).size).toBe(TECH_STACK.length);
  });
});

describe("normalizeCofounders", () => {
  it("normalises X handles and GitHub URLs, drops empty rows and caps at five", () => {
    const out = normalizeCofounders([
      { name: "  Ada ", x: "@Ada_L", github: "https://github.com/ada-l/" },
      { name: "", x: "https://x.com/grace", github: "@grace" },
      { name: "", x: "", github: "" },
      { name: "N".repeat(80) },
      { x: "e" }, { x: "f" }, { x: "g" },
    ]);
    expect(out).toEqual([
      { name: "Ada", x: "Ada_L", github: "ada-l" },
      { name: undefined, x: "grace", github: "grace" },
      { name: "N".repeat(PROFILE_LIMITS.cofounderName), x: undefined, github: undefined },
      { name: undefined, x: "e", github: undefined },
      { name: undefined, x: "f", github: undefined },
    ]);
    expect(normalizeCofounders([])).toBeUndefined();
  });
  it("rejects invalid handles", () => {
    expect(() => normalizeCofounders([{ x: "not a handle!" }])).toThrow(/X handle/);
    expect(() => normalizeCofounders([{ github: "-bad-" }])).toThrow(/GitHub handle/);
  });
});
