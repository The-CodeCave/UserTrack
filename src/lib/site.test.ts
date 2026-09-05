import { describe, expect, it } from "vitest";
import { attributedUrl, shareLinkUrl, shareUrl } from "./site";

describe("attributedUrl", () => {
  it("appends ref + utm_* to a clean url", () => {
    expect(attributedUrl("https://usertrack.dev/s/acme", { ref: "badge", source: "badge", medium: "image", campaign: "users" })).toBe("https://usertrack.dev/s/acme?ref=badge&utm_source=badge&utm_medium=image&utm_campaign=users");
  });
  it("preserves an existing query string and hash", () => {
    expect(attributedUrl("https://usertrack.dev/compare?s=a,b&days=30#chart", { ref: "share", source: "x", medium: "share-card", campaign: "compare" })).toBe("https://usertrack.dev/compare?s=a,b&days=30&ref=share&utm_source=x&utm_medium=share-card&utm_campaign=compare#chart");
  });
  it("shareLinkUrl attributes the canonical share page per channel", () => {
    expect(shareLinkUrl("acme", "growth", "x-founder")).toBe(`${shareUrl("acme", "growth")}?ref=share&utm_source=x-founder&utm_medium=share-card&utm_campaign=growth`);
  });
});
