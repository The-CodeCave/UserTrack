import { describe, expect, it } from "vitest";
import { INTEGRATION_CATALOG, integrationSetup, normalizeDetected, recommendIntegrations } from "./integrationSetup";

describe("integration catalog", () => {
  it("covers every provider with credentials and never-sent rules", () => {
    expect(INTEGRATION_CATALOG.map((c) => c.provider).sort()).toEqual(["auth0", "clerk", "endpoint", "firebase", "ga4", "manual", "plausible", "postgres", "posthog", "stripe", "supabase"]);
    for (const c of INTEGRATION_CATALOG) {
      expect(c.credentials.length, c.provider).toBeGreaterThan(0);
      expect(c.neverSent).toContain("emails");
      expect(c.neverSent).toContain("passwords");
    }
  });
});

describe("recommendIntegrations", () => {
  it("maps package names to providers", () => {
    expect(normalizeDetected(["@clerk/nextjs", "posthog-js", "stripe"]).map((d) => d.provider)).toEqual(["clerk", "posthog", "stripe"]);
    expect(normalizeDetected(["better-auth", "drizzle-orm", "convex"]).map((d) => d.provider)).toEqual(["endpoint", "endpoint", "endpoint"]);
    expect(normalizeDetected(["left-pad"])).toEqual([]);
    expect(normalizeDetected(["pg", "DATABASE_URL", "@neondatabase/serverless", "prisma:postgresql"]).map((d) => d.provider)).toEqual(["postgres", "postgres", "postgres", "postgres"]);
  });

  it("prefers auth providers over the endpoint, and never recommends manual", () => {
    expect(recommendIntegrations({ detectedProviders: ["@supabase/supabase-js", "posthog-js"] }).recommended.provider).toBe("supabase");
    // Supabase → Clerk → Firebase → Auth0 → Postgres → endpoint: least setup first.
    expect(recommendIntegrations({ detectedProviders: ["@clerk/nextjs", "@supabase/supabase-js"] }).recommended.provider).toBe("supabase");
    expect(recommendIntegrations({ detectedProviders: ["@clerk/nextjs", "pg"] }).recommended.provider).toBe("clerk");
    expect(recommendIntegrations({ detectedProviders: ["better-auth", "@prisma/client"] }).recommended.provider).toBe("endpoint");
    const pg = recommendIntegrations({ detectedProviders: ["better-auth", "pg"] });
    expect(pg.recommended.provider).toBe("postgres");
    expect(pg.optionalExtras.map((e) => `${e.role}:${e.provider}`)).toEqual(["activation:postgres"]);
    expect(recommendIntegrations({}).recommended.provider).toBe("endpoint");
    expect(recommendIntegrations({ detectedProviders: ["manual"] }).recommended.provider).toBe("endpoint");
  });

  it("suggests optional extras from detected analytics/billing", () => {
    const r = recommendIntegrations({ detectedProviders: ["@clerk/nextjs", "posthog-js", "stripe", "next-plausible"] });
    expect(r.optionalExtras.map((e) => `${e.role}:${e.provider}`)).toEqual(["activation:posthog", "traffic:plausible", "revenue:stripe"]);
  });
});

describe("integrationSetup", () => {
  it("returns deterministic steps ending in configure → verify → publish", () => {
    const s = integrationSetup({ provider: "supabase", projectId: "abc" })!;
    expect(s.role).toBe("users");
    expect(s.requirements.map((r) => r.key)).toEqual(["connectionString", "url", "serviceKey", "table", "createdAtColumn"]);
    expect(s.requirements.find((r) => r.key === "connectionString")?.secret).toBe(true);
    expect(s.requirements.find((r) => r.key === "serviceKey")?.secret).toBe(true);
    expect(s.steps.slice(-3).map((x) => x.id)).toEqual(["configure", "verify", "publish"]);
    expect(s.steps.at(-2)?.tool).toBe("usertrack_verify_integration");
    expect(s.nextTool).toBe("usertrack_configure_integration");
    expect(s.verification.args).toEqual({ projectId: "abc", role: "users" });
    expect(s.securityRules.length).toBeGreaterThan(3);
    expect(JSON.stringify(s)).not.toMatch(/eyJ|sk_live_[A-Za-z0-9]{10}/);
  });

  it("adds repo steps and a code template for the endpoint provider", () => {
    const s = integrationSetup({ provider: "endpoint", framework: "nextjs", detectedProviders: ["better-auth", "@prisma/client"], websiteUrl: "https://acme.dev" })!;
    expect(s.steps.slice(0, 3).map((x) => x.action)).toEqual(["modify_repo", "modify_repo", "deploy"]);
    expect(s.codeTemplates[0].path).toBe("app/api/usertrack/route.ts");
    expect(s.codeTemplates[0].code).toContain("prisma.user.count()");
    expect(s.codeTemplates[0].code).toContain("USERTRACK_ENDPOINT_TOKEN");
    expect(integrationSetup({ provider: "endpoint", framework: "express" })!.codeTemplates[0].framework).toBe("express");
  });

  it("postgres setup starts with a read-only role and a SQL template", () => {
    const s = integrationSetup({ provider: "postgres", projectId: "abc" })!;
    expect(s.steps[0].id).toBe("postgres:role");
    expect(s.codeTemplates[0].language).toBe("sql");
    expect(s.codeTemplates[0].code).toContain("GRANT SELECT");
    expect(s.requirements.map((r) => r.key)).toEqual(["connectionString", "tableRef", "createdAtColumn", "deletedAtColumn"]);
    expect(integrationSetup({ provider: "postgres", role: "activation" })!.requirements.map((r) => r.key)).toContain("sql");
  });

  it("rejects unknown providers and role mismatches", () => {
    expect(integrationSetup({ provider: "nope" })).toBeNull();
    expect(integrationSetup({ provider: "clerk", role: "traffic" })).toBeNull();
    expect(integrationSetup({ provider: "posthog" })!.role).toBe("activation");
  });
});
