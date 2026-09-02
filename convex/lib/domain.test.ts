import { describe, expect, it } from "vitest";
import { canonicalWebsiteUrl, normalizeDomain, sameDomain } from "./domain";

describe("domain normalization", () => {
  it("collapses protocol, www, case, paths and trailing dots", () => {
    for (const input of ["https://www.example.com/", "example.com", "WWW.EXAMPLE.COM", "http://example.com/pricing?x=1", "example.com."]) {
      expect(normalizeDomain(input), input).toBe("example.com");
    }
    expect(normalizeDomain("app.example.co.uk")).toBe("app.example.co.uk");
  });

  it("rejects junk", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("not a url")).toBeNull();
    expect(normalizeDomain("http://")).toBeNull();
  });

  it("builds canonical website urls", () => {
    expect(canonicalWebsiteUrl("www.example.com")).toBe("https://example.com");
    expect(canonicalWebsiteUrl("https://Example.com/app/")).toBe("https://example.com/app");
    expect(canonicalWebsiteUrl("garbage")).toBeNull();
  });

  it("compares domains", () => {
    expect(sameDomain("https://www.acme.dev/", "acme.dev")).toBe(true);
    expect(sameDomain("acme.dev", "acme.app")).toBe(false);
    expect(sameDomain("", "acme.app")).toBe(false);
  });
});
