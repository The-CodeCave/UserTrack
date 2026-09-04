import { describe, expect, it } from "vitest";
import { DEFAULT_VISIBILITY, publicLogo, stripPrivate, visibilityOf } from "./visibility";

const doc = { convertedUsers: 447, trialUsers: 80, signupToConvertedPct: 6.8, trialToConvertedPct: 42.3, activatedUsers: 3601, activationRatePct: 54.7, visitors30d: 81240, mrr: 1234, currency: "USD", ownerId: "p1", totalUsers: 6581 } as never;

describe("visibility", () => {
  it("defaults keep growth public and conversion private", () => {
    expect(visibilityOf({})).toEqual(DEFAULT_VISIBILITY);
    expect(DEFAULT_VISIBILITY.conversionRate).toBe(false);
    expect(DEFAULT_VISIBILITY.convertedCount).toBe(false);
  });
  it("maps legacy toggles and lets explicit keys win", () => {
    expect(visibilityOf({ showRevenue: true, showTraffic: true })).toMatchObject({ conversionRate: true, convertedCount: true, traffic: true });
    expect(visibilityOf({ showRevenue: true, visibility: { convertedCount: false } })).toMatchObject({ conversionRate: true, convertedCount: false });
  });
  it("connected but private: strips every conversion field and always strips amounts + owner", () => {
    const out = stripPrivate(doc, visibilityOf({})) as Record<string, unknown>;
    expect(out.convertedUsers).toBeUndefined();
    expect(out.trialUsers).toBeUndefined();
    expect(out.signupToConvertedPct).toBeUndefined();
    expect(out.trialToConvertedPct).toBeUndefined();
    expect(out.visitors30d).toBeUndefined();
    expect(out.mrr).toBeUndefined();
    expect(out.currency).toBeUndefined();
    expect(out.ownerId).toBeUndefined();
    expect(out.activationRatePct).toBe(54.7);
    expect(out.totalUsers).toBe(6581);
  });
  it("public rate, private count", () => {
    const out = stripPrivate(doc, visibilityOf({ visibility: { conversionRate: true } })) as Record<string, unknown>;
    expect(out.signupToConvertedPct).toBe(6.8);
    expect(out.convertedUsers).toBeUndefined();
    expect(out.mrr).toBeUndefined();
    const all = stripPrivate(doc, visibilityOf({ visibility: { conversionRate: true, convertedCount: true, trialConversion: true } })) as Record<string, unknown>;
    expect(all.convertedUsers).toBe(447);
    expect(all.trialToConvertedPct).toBe(42.3);
    expect(all.mrr).toBeUndefined();
  });
});

describe("anonymous mode", () => {
  const row = { ...(doc as object), anonymous: true, logoUrl: "https://acme.io/logo.png", websiteUrl: "https://acme.io", appStoreUrl: "https://apps.apple.com/x", playStoreUrl: "https://play.google.com/x", cofounders: [{ name: "Ada" }], name: "Acme", logoStorageId: "st1", techStack: ["nextjs"] };
  it("hides identity, logo, website, stores and cofounders but keeps name, metrics and the stack", () => {
    const out = stripPrivate(row as never, visibilityOf({})) as Record<string, unknown>;
    for (const k of ["logoUrl", "websiteUrl", "appStoreUrl", "playStoreUrl", "cofounders", "ownerId", "logoStorageId"]) expect(out[k], k).toBeUndefined();
    expect(out).toMatchObject({ name: "Acme", totalUsers: 6581, anonymous: true, techStack: ["nextjs"] });
    expect(publicLogo(row as never)).toBeUndefined();
    expect(publicLogo({ anonymous: false, logoUrl: "x" })).toBe("x");
  });
  it("keeps the links when not anonymous", () => {
    const out = stripPrivate({ ...row, anonymous: undefined } as never, visibilityOf({})) as Record<string, unknown>;
    expect(out.websiteUrl).toBe("https://acme.io");
    expect(out.cofounders).toEqual([{ name: "Ada" }]);
    expect(out.logoStorageId).toBeUndefined();
  });
});
