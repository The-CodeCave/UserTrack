import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-redirect";

describe("safeInternalPath", () => {
  it("keeps same-origin paths with their query strings", () => {
    expect(safeInternalPath("/app")).toBe("/app");
    expect(safeInternalPath("/app?x=1")).toBe("/app?x=1");
    expect(safeInternalPath("/s/acme?ref=embed&utm=x#chart")).toBe("/s/acme?ref=embed&utm=x#chart");
    expect(safeInternalPath("/app/settings/social")).toBe("/app/settings/social");
  });

  it("falls back for anything that could leave the origin", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/%2F%2Fevil.com", "/%5Cevil.com", "/@evil.com", "/evil.com:443", "/app%0d%0aSet-Cookie:x", "app", "%2Fapp", "/%", ""]) {
      expect(safeInternalPath(bad), bad).toBe("/app");
    }
    expect(safeInternalPath(null)).toBe("/app");
    expect(safeInternalPath(undefined)).toBe("/app");
  });

  it("honours a custom fallback", () => {
    expect(safeInternalPath("//evil.com", "/app/settings/social")).toBe("/app/settings/social");
    expect(safeInternalPath(undefined, "/x")).toBe("/x");
  });
});
