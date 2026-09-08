import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EVENTS, MASK_PATTERNS, SERVER_EVENTS, SKIP_PATTERNS, cleanProps, flushEvents, flushIdentity, identify, reset, resolveSiteId, track, type Rybbit } from "./analytics";

const fake = (): Rybbit => ({ event: vi.fn(), pageview: vi.fn(), identify: vi.fn(), clearUserId: vi.fn(), getUserId: vi.fn(() => "old") });

beforeEach(() => vi.stubGlobal("window", {}));
afterEach(() => {
  reset();
  vi.unstubAllGlobals();
});

describe("track", () => {
  it("is a no-op without window.rybbit", () => {
    expect(() => track("sign_out")).not.toThrow();
    expect(() => track("cta_click", { location: "hero" })).not.toThrow();
  });

  it("replays events fired before the script loaded", () => {
    window.rybbit = fake();
    flushEvents();
    delete window.rybbit;
    track("sign_out");
    track("cta_click", { location: "hero" });
    const r = fake();
    window.rybbit = r;
    expect(r.event).not.toHaveBeenCalled();
    flushEvents();
    expect(r.event).toHaveBeenNthCalledWith(1, "sign_out", undefined);
    expect(r.event).toHaveBeenNthCalledWith(2, "cta_click", { location: "hero" });
  });

  it("forwards name and cleaned props once the script is present", () => {
    const r = fake();
    window.rybbit = r;
    track("integration_test", { provider: "clerk", ok: true });
    track("sign_out");
    expect(r.event).toHaveBeenNthCalledWith(1, "integration_test", { provider: "clerk", ok: "true" });
    expect(r.event).toHaveBeenNthCalledWith(2, "sign_out", undefined);
  });

  it("swallows tracker errors", () => {
    window.rybbit = { ...fake(), event: () => { throw new Error("boom"); } };
    expect(() => track("sign_out")).not.toThrow();
  });
});

describe("cleanProps", () => {
  it("keeps strings and numbers, stringifies booleans, drops undefined", () => {
    expect(cleanProps({ a: "x", b: 2, c: false, d: undefined })).toEqual({ a: "x", b: 2, c: "false" });
    expect(cleanProps(undefined)).toBeUndefined();
  });
});

describe("identify / reset", () => {
  it("replays a pending identify once the script loads", () => {
    identify("user_1");
    const r = fake();
    window.rybbit = r;
    expect(r.identify).not.toHaveBeenCalled();
    flushIdentity();
    expect(r.identify).toHaveBeenCalledWith("user_1");
    flushIdentity();
    expect(r.identify).toHaveBeenCalledTimes(1);
  });

  it("clears the stored id on reset only when one is set", () => {
    const r = fake();
    window.rybbit = r;
    reset();
    expect(r.clearUserId).toHaveBeenCalledTimes(1);
    (r.getUserId as ReturnType<typeof vi.fn>).mockReturnValue(null);
    reset();
    expect(r.clearUserId).toHaveBeenCalledTimes(1);
  });
});

describe("resolveSiteId", () => {
  it("defaults to the production site only for a production build of usertrack.dev", () => {
    expect(resolveSiteId({ nodeEnv: "production", siteUrl: "https://usertrack.dev" })).toBe("753f44fa9c50");
    expect(resolveSiteId({ nodeEnv: "production", siteUrl: "https://usertrack.dev/leaderboard" })).toBe("753f44fa9c50");
  });

  it("stays empty in dev, test, CI and preview deployments", () => {
    expect(resolveSiteId({ nodeEnv: "development", siteUrl: "http://localhost:3000" })).toBe("");
    expect(resolveSiteId({ nodeEnv: "test", siteUrl: "https://usertrack.dev" })).toBe("");
    expect(resolveSiteId({ nodeEnv: "production", siteUrl: "https://usertrack-production.up.railway.app" })).toBe("");
    expect(resolveSiteId({ nodeEnv: "production" })).toBe("");
  });

  it("rejects an evil-twin host that merely starts with the production origin", () => {
    expect(resolveSiteId({ nodeEnv: "production", siteUrl: "https://usertrack.dev.example.com" })).toBe("");
  });

  it("always honours an explicit site id, including the empty kill switch", () => {
    expect(resolveSiteId({ siteId: "abc123", nodeEnv: "development" })).toBe("abc123");
    expect(resolveSiteId({ siteId: "", nodeEnv: "production", siteUrl: "https://usertrack.dev" })).toBe("");
  });
});

describe("catalog", () => {
  it("names match their keys and never collide with server events", () => {
    for (const [k, v] of Object.entries(EVENTS)) expect(v).toBe(k);
    for (const s of SERVER_EVENTS) expect(k(s)).toBe(false);
    expect(Object.keys(EVENTS).length).toBeGreaterThan(0);
    expect(new Set(Object.values(EVENTS)).size).toBe(Object.keys(EVENTS).length);
    expect(new Set(SERVER_EVENTS).size).toBe(SERVER_EVENTS.length);
  });

  it("skips machine endpoints and masks token URLs", () => {
    expect(SKIP_PATTERNS).toEqual(["/api/**", "/embed/**", "/mcp"]);
    // Railway polls /api/health every few seconds — it is covered by the /api/** pattern, like every machine endpoint.
    expect(SKIP_PATTERNS.some((p) => p.endsWith("/**") && "/api/health".startsWith(p.slice(0, -2)))).toBe(true);
    expect(MASK_PATTERNS).toEqual(["/email/preferences*", "/reset-password*"]);
  });
});

const k = (name: string) => name in EVENTS;
