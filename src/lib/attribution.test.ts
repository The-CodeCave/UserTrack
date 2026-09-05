import { describe, expect, it } from "vitest";
import { ATTRIBUTION_MAX_AGE_MS, parseAttribution, sanitizeAttribution, sanitizeParam } from "./attribution";

describe("attribution", () => {
  it("sanitizes to lowercase [a-z0-9_-], 40 chars max", () => {
    expect(sanitizeParam(" Badge ")).toBe("badge");
    expect(sanitizeParam("share-card_2")).toBe("share-card_2");
    expect(sanitizeParam("<script>")).toBeUndefined();
    expect(sanitizeParam("a".repeat(50))).toBe("a".repeat(40));
    expect(sanitizeParam("")).toBeUndefined();
    expect(sanitizeParam(42)).toBeUndefined();
  });
  it("parses ref + utm_* from a query string and ignores everything else", () => {
    expect(parseAttribution("?ref=badge&utm_source=badge&utm_medium=image&utm_campaign=users&next=/app", 1000)).toEqual({ ref: "badge", source: "badge", medium: "image", campaign: "users", at: 1000 });
    expect(parseAttribution("?ref=<x>&utm_source=Embed", 1000)).toEqual({ source: "embed", at: 1000 });
    expect(parseAttribution("?next=/app", 1000)).toBeNull();
    expect(parseAttribution("", 1000)).toBeNull();
  });
  it("re-validates stored records and expires them after 30 days", () => {
    const now = 10 * ATTRIBUTION_MAX_AGE_MS;
    expect(sanitizeAttribution({ ref: "email", campaign: "users", at: now - 1000, junk: 1 }, now)).toEqual({ ref: "email", campaign: "users", at: now - 1000 });
    expect(sanitizeAttribution({ ref: "email", at: now - ATTRIBUTION_MAX_AGE_MS - 1 }, now)).toBeNull();
    expect(sanitizeAttribution({ ref: "email" }, now)).toBeNull();
    expect(sanitizeAttribution({ ref: "***", at: now }, now)).toBeNull();
    expect(sanitizeAttribution("nope", now)).toBeNull();
  });
});
