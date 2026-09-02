import { describe, expect, it } from "vitest";
import { INTEGRATION_CATALOG, conversionSetup, detectAuthMethods, identityMappingGuidance, integrationSetup, normalizeDetected, rankActivationEvents, recommendIntegrations } from "./integrationSetup";

describe("integration catalog", () => {
  it("covers every provider with credentials and never-sent rules", () => {
    expect(INTEGRATION_CATALOG.map((c) => c.provider).sort()).toEqual(["auth0", "better_auth", "chargebee", "clerk", "endpoint", "firebase", "ga4", "lemonsqueezy", "manual", "paddle", "plausible", "postgres", "posthog", "revenuecat", "stripe", "supabase"]);
    for (const c of INTEGRATION_CATALOG) {
      expect(c.credentials.length, c.provider).toBeGreaterThan(0);
      expect(c.neverSent).toContain("emails");
      expect(c.neverSent).toContain("passwords");
    }
  });

  it("payment providers are conversion-only, read-only and never see amounts", () => {
    for (const k of ["stripe", "revenuecat", "paddle", "lemonsqueezy", "chargebee"]) {
      const c = INTEGRATION_CATALOG.find((x) => x.provider === k)!;
      expect(c.roles, k).toEqual(["conversion"]);
      expect(c.neverSent, k).toEqual(expect.arrayContaining(["amounts", "prices", "invoices"]));
      expect(c.credentials.some((x) => x.key === "mode"), k).toBe(true);
      expect(c.credentials.filter((x) => x.secret).length, k).toBeGreaterThan(0);
    }
    expect(INTEGRATION_CATALOG.find((x) => x.provider === "endpoint")!.reads).toMatch(/convertedUsers/);
  });
});

describe("recommendIntegrations", () => {
  it("maps package names to providers", () => {
    expect(normalizeDetected(["@clerk/nextjs", "posthog-js", "stripe"]).map((d) => d.provider)).toEqual(["clerk", "posthog", "stripe"]);
    expect(normalizeDetected(["better-auth", "drizzle-orm", "convex"]).map((d) => d.provider)).toEqual(["better_auth", "endpoint", "endpoint"]);
    expect(normalizeDetected(["@better-auth/core", "BETTER_AUTH_SECRET", "@convex-dev/better-auth"]).map((d) => d.provider)).toEqual(["better_auth", "better_auth", "better_auth"]);
    expect(normalizeDetected(["left-pad"])).toEqual([]);
    expect(normalizeDetected(["pg", "DATABASE_URL", "@neondatabase/serverless", "prisma:postgresql"]).map((d) => d.provider)).toEqual(["postgres", "postgres", "postgres", "postgres"]);
  });

  it("maps mobile SDKs and payment providers, and never treats sign-in methods as providers", () => {
    expect(normalizeDetected(["@react-native-firebase/auth", "firebase_auth", "FirebaseAuth", "firebase/auth"]).map((d) => d.provider)).toEqual(["firebase", "firebase", "firebase", "firebase"]);
    expect(normalizeDetected(["react-native-purchases", "purchases_flutter", "RevenueCat", "Purchases"]).map((d) => d.provider)).toEqual(["revenuecat", "revenuecat", "revenuecat", "revenuecat"]);
    expect(normalizeDetected(["posthog-react-native", "posthog-ios", "posthog-android", "posthog-flutter"]).map((d) => d.provider)).toEqual(["posthog", "posthog", "posthog", "posthog"]);
    expect(normalizeDetected(["@paddle/paddle-js", "@paddle/paddle-node-sdk", "@lemonsqueezy/lemonsqueezy.js", "@chargebee/chargebee-js"]).map((d) => d.provider)).toEqual(["paddle", "paddle", "lemonsqueezy", "chargebee"]);
    expect(normalizeDetected(["amplitude", "@amplitude/analytics-browser", "mixpanel"]).map((d) => d.provider)).toEqual(["endpoint", "endpoint", "endpoint"]);
    expect(normalizeDetected(["StoreKit", "AuthenticationServices", "sign-in-with-apple", "@invertase/react-native-apple-authentication", "expo-apple-authentication", "@react-native-google-signin/google-signin"])).toEqual([]);
    expect(detectAuthMethods(["expo-apple-authentication", "@react-native-google-signin/google-signin", "email_password"])).toEqual(["apple", "google", "email"]);
  });

  it("prefers auth providers over the endpoint, and never recommends manual", () => {
    expect(recommendIntegrations({ detectedProviders: ["@supabase/supabase-js", "posthog-js"] }).recommended.provider).toBe("supabase");
    // Supabase → Clerk → Firebase → Auth0 → Postgres → endpoint: least setup first.
    expect(recommendIntegrations({ detectedProviders: ["@clerk/nextjs", "@supabase/supabase-js"] }).recommended.provider).toBe("supabase");
    expect(recommendIntegrations({ detectedProviders: ["@clerk/nextjs", "pg"] }).recommended.provider).toBe("clerk");
    expect(recommendIntegrations({ detectedProviders: ["better-auth", "@prisma/client"] }).recommended.provider).toBe("better_auth");
    expect(recommendIntegrations({ detectedProviders: ["next-auth", "@prisma/client"] }).recommended.provider).toBe("endpoint");
    const ba = recommendIntegrations({ detectedProviders: ["better-auth", "pg"] });
    expect(ba.recommended.provider).toBe("better_auth");
    expect(ba.reasoning.join(" ")).toMatch(/@usertrack\/better-auth/);
    const pg = recommendIntegrations({ detectedProviders: ["lucia", "pg"] });
    expect(pg.recommended.provider).toBe("postgres");
    expect(pg.optionalExtras.map((e) => `${e.role}:${e.provider}`)).toEqual(["activation:postgres"]);
    expect(recommendIntegrations({}).recommended.provider).toBe("endpoint");
    expect(recommendIntegrations({ detectedProviders: ["manual"] }).recommended.provider).toBe("endpoint");
  });

  it("suggests optional extras from detected analytics/billing", () => {
    const r = recommendIntegrations({ detectedProviders: ["@clerk/nextjs", "posthog-js", "stripe", "next-plausible"] });
    expect(r.optionalExtras.map((e) => `${e.role}:${e.provider}`)).toEqual(["activation:posthog", "traffic:plausible", "conversion:stripe"]);
    expect(r.composition).toMatchObject({ users: { provider: "clerk" }, activation: { provider: "posthog" }, traffic: { provider: "plausible" }, conversion: { provider: "stripe" } });
    expect(r.lifecycle).toEqual(["reached", "signed_up", "activated", "trial", "converted"]);
    expect(r.projectType).toBe("web");
    expect(r.authMethods).toEqual([]);
  });

  it("composes the mobile stack: Firebase → PostHog → RevenueCat, Sign in with Apple never a users source", () => {
    const r = recommendIntegrations({ projectType: "mobile", detectedAuth: ["@react-native-firebase/auth", "expo-apple-authentication"], detectedAnalytics: ["posthog-react-native"], detectedPayments: ["react-native-purchases"] });
    expect(r.recommended.provider).toBe("firebase");
    expect(r.composition).toMatchObject({ users: { provider: "firebase" }, activation: { provider: "posthog" }, conversion: { provider: "revenuecat" } });
    expect(r.composition.traffic).toBeUndefined();
    expect(r.lifecycle).toEqual(["signed_up", "activated", "trial", "converted"]);
    expect(r.authMethods).toEqual(["apple"]);
    expect(r.projectType).toBe("mobile");
    expect(r.composition.conversion?.reason).toMatch(/never counted as registered users/);
  });

  it("recommends a backend endpoint when only Apple/Google sign-in is detected", () => {
    const r = recommendIntegrations({ detectedAuth: ["sign-in-with-apple", "google-signin"], detectedPayments: ["StoreKit"] });
    expect(r.recommended.provider).toBe("endpoint");
    expect(r.authMethods).toEqual(["apple", "google"]);
    expect(r.projectType).toBe("mobile");
    expect(r.reasoning.join(" ")).toMatch(/authentication methods, not a user store/);
    expect(r.reasoning.join(" ")).toMatch(/StoreKit/);
    expect(r.composition.conversion).toBeUndefined();
    expect(r.lifecycle).toEqual(["signed_up"]);
  });
});

describe("conversionSetup", () => {
  it("picks the conversion provider from detected payments in priority order", () => {
    expect(conversionSetup({ detectedProviders: ["stripe", "react-native-purchases"] })!.provider).toBe("revenuecat");
    expect(conversionSetup({ detectedProviders: ["@paddle/paddle-js", "chargebee"] })!.provider).toBe("paddle");
    expect(conversionSetup({})!.provider).toBe("endpoint");
    expect(conversionSetup({ projectType: "mobile" })!.provider).toBe("revenuecat");
    expect(conversionSetup({ provider: "posthog" })).toBeNull();
    expect(conversionSetup({ provider: "nope" })).toBeNull();
  });

  it("describes Stripe as read-only conversion state with identity via metadata.userId", () => {
    const s = conversionSetup({ provider: "stripe", projectId: "abc" })!;
    expect(s.recommendedDefinition.mode).toBe("active_paid");
    expect(s.alternatives.map((a) => a.mode)).toEqual(["ever_paid", "first_payment"]);
    expect(s.readOnly).toBe(true);
    expect(s.trialSupported).toBe(true);
    expect(s.identityMatching.recommendation).toMatch(/metadata\.userId/);
    expect(s.privacyRules.join(" ")).toMatch(/No amounts/);
    expect(s.configShape).toEqual({ secretKey: "secret string", mode: "string (optional)" });
    expect(s.steps.map((x) => x.action)).toEqual(["collect_credential", "call_tool", "verify"]);
    expect(s.steps[1].detail).toContain('role: "conversion"');
    expect(s.steps[1].detail).toContain('"abc"');
  });

  it("limits RevenueCat to active_paid and warns about anonymous customers", () => {
    const s = conversionSetup({ provider: "revenuecat" })!;
    expect(s.alternatives).toEqual([]);
    expect(s.identityMatching.recommendation).toMatch(/app_user_id/);
    expect(s.identityMatching.howTo).toMatch(/do not expose identities yet/);
    expect(s.notes.join(" ")).toMatch(/anonymous/);
    expect(s.requiredCredentials.map((c) => c.key)).toEqual(["apiKey", "projectId", "mode"]);
  });
});

describe("identityMappingGuidance", () => {
  it("maps the identity id onto analytics and conversion sources without PII", () => {
    const g = identityMappingGuidance({ identitySource: "firebase", analyticsSource: "posthog", conversionSource: "revenuecat", projectType: "mobile" });
    expect(g.recommendedMapping.map((m) => [m.from, m.to])).toEqual([["firebase.uid", "posthog.distinct_id"], ["firebase.uid", "revenuecat.app_user_id"]]);
    expect(g.howUserTrackMatches).toMatch(/salted \+ SHA-256/);
    expect(g.qualityLevels.cohort_verified.label).toBe("Cohort Verified");
    expect(g.rules.minSubjects).toBe(20);
    expect(g.privacy.join(" ")).toMatch(/Never send emails/);
    expect(JSON.stringify(g)).not.toMatch(/email address|phone number:/);
    const web = identityMappingGuidance({ identitySource: "clerk", conversionSource: "stripe" });
    expect(web.recommendedMapping).toEqual([{ from: "clerk.userId", to: "stripe.subscription.metadata.userId", how: expect.stringMatching(/metadata/) }]);
    expect(web.analyticsSource).toBeNull();
  });
});

describe("rankActivationEvents", () => {
  it("rejects traffic/auth events and prefers outcome events", () => {
    const r = rankActivationEvents(["$pageview", "login", "sign_up", "app_open", "click", "project_created", "first_document_created", "settings_viewed"], "posthog");
    expect(r.recommendedEvent).toBe("first_document_created");
    expect(r.source).toBe("posthog");
    expect(r.rejected.map((x) => x.event)).toEqual(["$pageview", "login", "sign_up", "app_open", "click"]);
    expect(r.rejected.find((x) => x.event === "sign_up")?.reason).toMatch(/Signed up stage/);
    expect(r.alternatives).toEqual([{ event: "project_created", looksLikeActivation: true }, { event: "settings_viewed", looksLikeActivation: false }]);
    expect(r.reason).toMatch(/first_document_created/);
  });

  it("explains when nothing qualifies", () => {
    expect(rankActivationEvents(["$pageview", "screen_view"]).recommendedEvent).toBeUndefined();
    expect(rankActivationEvents(["$pageview"]).reason).toMatch(/No candidate looks like an outcome/);
    expect(rankActivationEvents().reason).toMatch(/No candidate events/);
    expect(rankActivationEvents(["settings_viewed"]).recommendedEvent).toBeUndefined();
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
