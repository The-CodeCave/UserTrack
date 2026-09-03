import { describe, expect, it } from "vitest";
import { recommendStack, stackQuestions } from "./stack-recommendation";

describe("stackQuestions", () => {
  it("asks mobile apps sign-in, monetization, analytics in that order", () => {
    const q = stackQuestions("mobile");
    expect(q.map((x) => x.key)).toEqual(["identity", "monetization", "analytics"]);
    expect(q[0].options.map((o) => o.value)).toEqual(["firebase", "supabase", "auth0", "custom", "other"]);
    expect(q[1].options.map((o) => o.label)).toContain("StoreKit directly");
    expect(q[2].options.map((o) => o.label)).toContain("Firebase Analytics");
  });
  it("asks web identity, analytics, monetization", () => {
    const q = stackQuestions("web");
    expect(q.map((x) => x.key)).toEqual(["identity", "analytics", "monetization"]);
    expect(q[0].options.map((o) => o.value)).toEqual(["clerk", "supabase", "firebase", "better_auth", "authjs", "convex", "auth0", "postgres", "custom", "other"]);
    expect(q[2].options.map((o) => o.value)).toEqual(["stripe", "paddle", "lemonsqueezy", "chargebee", "none"]);
  });
  it("hybrid merges RevenueCat into web monetization", () => {
    expect(stackQuestions("hybrid")[2].options.map((o) => o.value)).toEqual(["revenuecat", "stripe", "paddle", "lemonsqueezy", "chargebee", "none"]);
  });
});

describe("recommendStack", () => {
  it("mobile: Firebase + RevenueCat + PostHog, Apple is only a method", () => {
    const r = recommendStack({ platform: "mobile", identity: "firebase", monetization: "revenuecat", analytics: "posthog", authMethods: ["apple", "email"] });
    expect(r).toMatchObject({ users: "firebase", activation: "posthog", conversion: "revenuecat" });
    expect(r.traffic).toBeUndefined();
    expect(r.notes).toEqual(["Sign in with Apple is an authentication method — your registered user count comes from Firebase."]);
  });
  it("web: Clerk + PostHog + Stripe gives traffic too", () => {
    const r = recommendStack({ platform: "web", identity: "clerk", analytics: "posthog", monetization: "stripe" });
    expect(r).toEqual({ users: "clerk", activation: "posthog", traffic: "posthog", conversion: "stripe", notes: [] });
  });
  it("maps identity providers", () => {
    const users = (identity: string) => recommendStack({ platform: "web", identity }).users;
    expect(users("supabase")).toBe("supabase");
    expect(users("auth0")).toBe("auth0");
    expect(users("postgres")).toBe("postgres");
    expect(users("better_auth")).toBe("native");
    expect(users("authjs")).toBe("native");
    expect(users("convex")).toBe("native");
    expect(users("custom")).toBe("native");
    expect(users("other")).toBe("endpoint");
    expect(recommendStack({ platform: "web", identity: "better_auth" }).nativeSource).toBe("better-auth");
    expect(recommendStack({ platform: "web", identity: "custom" })).toMatchObject({ users: "native", nativeSource: "custom" });
    expect(recommendStack({ platform: "web", identity: "clerk" }).nativeSource).toBeUndefined();
    expect(recommendStack({ platform: "web" }).users).toBeNull();
  });
  it("maps analytics with notes", () => {
    expect(recommendStack({ platform: "web", analytics: "plausible" }).traffic).toBe("plausible");
    expect(recommendStack({ platform: "web", analytics: "ga4" }).traffic).toBe("ga4");
    const fb = recommendStack({ platform: "mobile", analytics: "firebase_analytics" });
    expect(fb.traffic).toBe("ga4");
    expect(fb.notes[0]).toMatch(/linked GA4 property/);
    const amp = recommendStack({ platform: "web", analytics: "amplitude" });
    expect(amp.activation).toBe("endpoint");
    expect(amp.notes[0]).toBe("Amplitude is not yet a native provider — expose an activation count via the JSON endpoint.");
    expect(recommendStack({ platform: "web", analytics: "mixpanel" }).notes[0]).toMatch(/^Mixpanel/);
    expect(recommendStack({ platform: "web", analytics: "none" })).toEqual({ users: null, notes: [] });
  });
  it("maps monetization with notes", () => {
    expect(recommendStack({ platform: "web", monetization: "paddle" }).conversion).toBe("paddle");
    expect(recommendStack({ platform: "web", monetization: "lemonsqueezy" }).conversion).toBe("lemonsqueezy");
    expect(recommendStack({ platform: "web", monetization: "chargebee" }).conversion).toBe("chargebee");
    const sk = recommendStack({ platform: "mobile", monetization: "storekit" });
    expect(sk.conversion).toBe("endpoint");
    expect(sk.notes[0]).toMatch(/StoreKit\/Play Billing/);
    expect(recommendStack({ platform: "mobile", monetization: "play_billing" }).conversion).toBe("endpoint");
    const free = recommendStack({ platform: "mobile", monetization: "none" });
    expect(free.conversion).toBeUndefined();
    expect(free.notes).toEqual(["Free product: funnel ends at Activated."]);
  });
  it("Apple note falls back to the backend for custom identity", () => {
    expect(recommendStack({ platform: "mobile", identity: "custom", authMethods: ["apple"] }).notes[0]).toMatch(/comes from your own backend\.$/);
  });
});
