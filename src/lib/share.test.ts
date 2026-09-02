import { describe, expect, it } from "vitest";
import { availableShareKinds, parseShareKind, parseShareSize, shareCopy, type ShareSaas } from "./share";

const s: ShareSaas = { name: "Acme", slug: "acme", totalUsers: 12481, newUsers7d: 120, newUsers30d: 1900, growth7dPct: 4, growth30dPct: 18.2, trust: "verified", trustLabel: "Verified" };

describe("parseShareKind / parseShareSize", () => {
  it("parses kinds", () => {
    expect(parseShareKind("users")).toEqual({ kind: "users" });
    expect(parseShareKind("week")).toEqual({ kind: "week" });
    expect(parseShareKind("conversion")).toEqual({ kind: "conversion" });
    expect(parseShareKind("milestone-abc")).toEqual({ kind: "milestone-abc", milestoneId: "abc" });
    expect(parseShareKind("spike-x1")).toEqual({ kind: "spike-x1", eventId: "x1" });
    expect(parseShareKind("nope")).toBeNull();
  });
  it("parses sizes", () => {
    expect(parseShareSize("square")).toBe("square");
    expect(parseShareSize("og")).toBe("og");
    expect(parseShareSize(null)).toBe("og");
    expect(parseShareSize("bogus")).toBe("og");
  });
});

describe("shareCopy", () => {
  it("week", () => {
    expect(shareCopy(s, "week")).toEqual({ eyebrow: "LAST 7 DAYS", value: "+120", sub: "+4.0% this week · 12.5K users total", text: "Acme gained +120 users this week (+4.0%). Verified on UserTrack." });
    expect(shareCopy({ ...s, trust: "unverified" }, "users").text).toBe("Acme just hit 12.5K users. Tracked on UserTrack.");
  });
  it("conversion", () => {
    expect(shareCopy({ ...s, signupToConvertedPct: 8.7 }, "conversion")).toEqual({ eyebrow: "CONVERSION", value: "8.7%", sub: "Signup → Converted · users who convert, never revenue", text: "8.7% of Acme signups convert. Verified on UserTrack." });
  });
  it("spike with an event", () => {
    const ev = { title: "+300 in a day", copy: "Acme gained 300 users in 24h", kind: "spike", achievedAt: 0 };
    expect(shareCopy(s, "spike-x1", ev)).toEqual({ eyebrow: "GROWTH SPIKE", value: "+300 in a day", sub: "Acme gained 300 users in 24h", text: "Acme gained 300 users in 24h Verified on UserTrack." });
    expect(shareCopy(s, "milestone-m1", ev).eyebrow).toBe("MILESTONE");
    expect(shareCopy(s, "spike-x1", { ...ev, eyebrow: "CUSTOM" }).eyebrow).toBe("CUSTOM");
  });
});

describe("availableShareKinds", () => {
  it("hides kinds without data", () => {
    expect(availableShareKinds(s).map((k) => k.kind)).toEqual(["users", "growth", "week"]);
    const all = availableShareKinds({ ...s, rank: 4, trendingRank: 2, activationRatePct: 12.5, signupToConvertedPct: 8.7 });
    expect(all.map((k) => k.kind)).toEqual(["users", "growth", "week", "rank", "trending", "activation", "conversion"]);
    expect(all.map((k) => k.label)).toEqual(["12.5K users", "+1,900 in 30d", "+120 this week", "#4 on UserTrack", "#2 trending", "13% activation", "8.7% signup → converted"]);
  });
});
