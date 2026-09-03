import { describe, expect, it } from "vitest";
import { canonicalString, EVENTS_PATH, LEGACY_EVENTS_PATH, LIFECYCLE_EVENT_TYPES, NATIVE_SOURCES, NonceCache, pseudonymize, randomId, readHeader, sha256Hex, sign, signedHeaders, timingSafeEqual, verify } from "../src/index.js";
import fixtures from "./fixtures/signatures.json" with { type: "json" };

describe("signature protocol", () => {
  it("produces the frozen fixtures (cross-checked by the UserTrack server tests)", async () => {
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(6);
    for (const f of fixtures.cases) {
      expect(await sha256Hex(f.body)).toBe(f.bodyHash);
      expect(canonicalString({ method: f.method as "REQUEST" | "RESPONSE", path: f.path, timestamp: f.timestamp, nonce: f.nonce, body: f.body }, f.bodyHash)).toBe(f.canonical);
      expect(await sign(fixtures.secret, { method: f.method as "REQUEST" | "RESPONSE", path: f.path, timestamp: f.timestamp, nonce: f.nonce, body: f.body })).toBe(f.signature);
    }
  });
  it("verifies a signed header set and rejects tampering", async () => {
    const h = await signedHeaders("s", "p", { method: "REQUEST", path: "/x", body: "{}" });
    expect((await verify("s", h, { method: "REQUEST", path: "/x", body: "{}" })).ok).toBe(true);
    expect((await verify("s", h, { method: "REQUEST", path: "/x", body: "{ }" })).ok).toBe(false);
    expect((await verify("other", h, { method: "REQUEST", path: "/x", body: "{}" })).ok).toBe(false);
    expect((await verify("s", h, { method: "RESPONSE", path: "/x", body: "{}" })).ok).toBe(false);
    expect((await verify("s", new Headers(h), { method: "REQUEST", path: "/x", body: "{}" })).ok).toBe(true);
  });
  it("rejects stale and malformed timestamps", async () => {
    const old = await signedHeaders("s", "p", { method: "REQUEST", path: "/x", body: "", timestamp: Date.now() - 6 * 60_000 });
    expect(await verify("s", old, { method: "REQUEST", path: "/x", body: "" })).toMatchObject({ ok: false, reason: "stale" });
    const bad = { ...old, "x-usertrack-timestamp": "yesterday" };
    expect(await verify("s", bad, { method: "REQUEST", path: "/x", body: "" })).toMatchObject({ ok: false, reason: "bad_timestamp" });
    expect(await verify("s", {}, { method: "REQUEST", path: "/x", body: "" })).toMatchObject({ ok: false, reason: "missing_headers" });
  });
  it("binds a response to the request nonce", async () => {
    const h = await signedHeaders("s", "p", { method: "RESPONSE", path: "/x", body: "{}", nonce: "abc" });
    expect((await verify("s", h, { method: "RESPONSE", path: "/x", body: "{}" }, { expectedNonce: "abc" })).ok).toBe(true);
    expect((await verify("s", h, { method: "RESPONSE", path: "/x", body: "{}" }, { expectedNonce: "zzz" })).ok).toBe(false);
  });
  it("reads headers from Headers objects, plain records and Node-style arrays", () => {
    expect(readHeader(new Headers({ "x-usertrack-nonce": "n" }), "x-usertrack-nonce")).toBe("n");
    expect(readHeader({ "X-UserTrack-Nonce": undefined, "x-usertrack-nonce": ["a", "b"] }, "x-usertrack-nonce")).toBe("a");
    expect(readHeader({}, "x-usertrack-nonce")).toBeUndefined();
  });
  it("timing-safe compare handles different lengths", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
  it("pseudonymizes deterministically without leaking the id", async () => {
    const a = await pseudonymize("secret", "user_123");
    expect(a).toHaveLength(32);
    expect(a).toBe(await pseudonymize("secret", "user_123"));
    expect(a).not.toBe(await pseudonymize("other", "user_123"));
    expect(a).not.toContain("user_123");
  });
  it("nonce cache rejects reuse and bounds memory", () => {
    const c = new NonceCache(1000, 3);
    expect(c.use("a", 0)).toBe(true);
    expect(c.use("a", 1)).toBe(false);
    expect(c.use("b", 1)).toBe(true);
    expect(c.use("c", 1)).toBe(true);
    expect(c.use("d", 5000)).toBe(true);
    expect(c.use("a", 5001)).toBe(true);
  });
  it("exposes stable constants", () => {
    expect(EVENTS_PATH).toBe("/api/integrations/native/events");
    expect(LEGACY_EVENTS_PATH).toBe("/api/integrations/better-auth/events");
    expect(NATIVE_SOURCES).toEqual(["better-auth", "prisma", "drizzle", "convex", "authjs", "custom"]);
    expect(LIFECYCLE_EVENT_TYPES).toContain("user.converted");
    expect(randomId()).toMatch(/^[0-9a-f-]{32,36}$/);
  });
});
