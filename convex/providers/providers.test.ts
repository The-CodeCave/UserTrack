import { describe, expect, it } from "vitest";
import { providers, sameSite } from "./index";

describe("providers", () => {
  it("sameSite matches host and subdomains", () => {
    expect(sameSite("https://api.acme.com/x", "https://www.acme.com")).toBe(true);
    expect(sameSite("https://acme.com", "https://acme.com")).toBe(true);
    expect(sameSite("https://evil.com", "https://acme.com")).toBe(false);
    expect(sameSite("nope", "https://acme.com")).toBe(false);
  });
  it("endpoint trust depends on domain match", () => {
    const v = providers.endpoint.validate({ url: "https://api.acme.com/users", token: "" }, "users");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(providers.endpoint.trust(v.config, "https://acme.com")).toBe("verified");
    expect(providers.endpoint.trust(v.config, "https://other.com")).toBe("unverified");
  });
  it("manual is never verified and validates counts", () => {
    expect(providers.manual.validate({ totalUsers: -1 }, "users").ok).toBe(false);
    const v = providers.manual.validate({ totalUsers: 12.9 }, "users");
    expect(v.ok && v.config.totalUsers).toBe(12);
    expect(providers.manual.trust({ totalUsers: 1 }, "https://x.com")).toBe("unverified");
  });
  it("clerk / supabase validation", () => {
    expect(providers.clerk.validate({ secretKey: "nope" }, "users").ok).toBe(false);
    expect(providers.clerk.validate({ secretKey: "sk_test_abc" }, "users").ok).toBe(true);
    expect(providers.supabase.validate({ url: "https://x.supabase.co", serviceKey: "k".repeat(30) }, "users").ok).toBe(true);
    expect(providers.supabase.validate({ url: "https://x.com", serviceKey: "k".repeat(30) }, "users").ok).toBe(false);
  });
});
