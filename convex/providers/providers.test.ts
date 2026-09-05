import { describe, expect, it } from "vitest";
import { historyLimit, providers, sameSite } from "./index";
import { BOUNDED_HISTORY_DAYS, FULL_HISTORY_DAYS, fillDaily } from "./types";
import { NATIVE_HISTORY_DAYS } from "./native";

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
  it("history reach: full (5 years) for aggregate queries, bounded for per-day requests, protocol cap for native", () => {
    expect(historyLimit("postgres", {})).toEqual({ reach: "full", maxDays: FULL_HISTORY_DAYS });
    expect(historyLimit("firebase", {})).toEqual({ reach: "full", maxDays: FULL_HISTORY_DAYS });
    expect(historyLimit("supabase", { mode: "database" })).toEqual({ reach: "full", maxDays: FULL_HISTORY_DAYS });
    expect(historyLimit("supabase", { mode: "api" })).toEqual({ reach: "bounded", maxDays: BOUNDED_HISTORY_DAYS });
    expect(historyLimit("clerk", {})).toEqual({ reach: "bounded", maxDays: 365 });
    expect(historyLimit("auth0", {})).toEqual({ reach: "bounded", maxDays: 365 });
    expect(historyLimit("native", {})).toEqual({ reach: "bounded", maxDays: NATIVE_HISTORY_DAYS });
    expect(NATIVE_HISTORY_DAYS).toBe(90);
    // Traffic sources keep the 30-day window (refreshed on a rolling basis).
    expect(historyLimit("plausible", {})).toEqual({ reach: "bounded", maxDays: 30 });
    expect(FULL_HISTORY_DAYS).toBe(1826);
  });
  it("fillDaily starts at the first signup when nothing is older than the window, else at the window start", () => {
    const now = Date.UTC(2026, 8, 5, 12);
    const day = (d: number) => new Date(now - d * 86_400_000).toISOString().slice(0, 10);
    const perDay = new Map([[day(2), 3], [day(0), 1]]);
    expect(fillDaily(perDay, 10, 0, now)).toEqual([{ day: day(2), value: 3 }, { day: day(1), value: 0 }, { day: day(0), value: 1 }]);
    const full = fillDaily(perDay, 10, 5, now);
    expect(full).toHaveLength(11);
    expect(full[0]).toEqual({ day: day(10), value: 0 });
    expect(fillDaily(new Map(), 10, 0, now)).toEqual([]);
  });
});
