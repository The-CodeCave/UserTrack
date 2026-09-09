import { describe, expect, it } from "vitest";
import { attributedUrl, displayHost, productLinkUrl, shareLinkUrl, shareUrl } from "./site";

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

describe("productLinkUrl", () => {
  it("tags an outbound product link as coming from us", () => {
    expect(productLinkUrl("https://acme.com")).toBe("https://acme.com?ref=usertrack&utm_source=usertrack");
  });
  it("preserves an existing query string and hash", () => {
    expect(productLinkUrl("https://acme.com/pricing?plan=pro#faq")).toBe("https://acme.com/pricing?plan=pro&ref=usertrack&utm_source=usertrack#faq");
  });
});

describe("displayHost", () => {
  it("shows the hostname of a stored url", () => {
    expect(displayHost("https://www.acme.com/pricing")).toBe("www.acme.com");
  });
  it("falls back to the raw value instead of throwing on an unparseable url", () => {
    expect(displayHost("acme.com")).toBe("acme.com");
  });
});
