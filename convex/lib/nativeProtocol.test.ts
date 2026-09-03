import { describe, expect, it } from "vitest";
import { canonicalString, EVENTS_PATH, generateIntegrationSecret, LEGACY_EVENTS_PATH, NATIVE_SOURCES, normalizeSource, sha256Hex, sign, signedHeaders, verify, versionAtLeast } from "./nativeProtocol";
import * as pkg from "../../packages/protocol/src/index";
import fixtures from "../../packages/protocol/tests/fixtures/signatures.json";

describe("native protocol (server twin)", () => {
  it("matches the frozen fixtures shared with @usertrack/protocol", async () => {
    for (const f of fixtures.cases) {
      const input = { method: f.method as "REQUEST" | "RESPONSE", path: f.path, timestamp: f.timestamp, nonce: f.nonce, body: f.body };
      expect(await sha256Hex(f.body)).toBe(f.bodyHash);
      expect(canonicalString(input, f.bodyHash)).toBe(f.canonical);
      expect(await sign(fixtures.secret, input)).toBe(f.signature);
    }
  });
  it("produces byte-identical signatures to the @usertrack/protocol package for random inputs", async () => {
    for (let i = 0; i < 25; i++) {
      const input = { method: (i % 2 ? "REQUEST" : "RESPONSE") as "REQUEST" | "RESPONSE", path: i % 3 ? EVENTS_PATH : "/usertrack/metrics", timestamp: 1_700_000_000_000 + i * 977, nonce: Math.random().toString(16).slice(2), body: i % 4 ? JSON.stringify({ i, s: "ü€😀".repeat(i) }) : "" };
      const secret = `ut_int_${i}_${Math.random().toString(36).slice(2)}`;
      expect(await sign(secret, input)).toBe(await pkg.sign(secret, input));
      const h = await pkg.signedHeaders(secret, "p", input);
      expect((await verify(secret, h, input, { now: input.timestamp })).ok).toBe(true);
      const mine = await signedHeaders(secret, "p", input);
      expect((await pkg.verify(secret, mine, input, { now: input.timestamp })).ok).toBe(true);
    }
    expect(EVENTS_PATH).toBe(pkg.EVENTS_PATH);
    expect(LEGACY_EVENTS_PATH).toBe(pkg.LEGACY_EVENTS_PATH);
    expect([...NATIVE_SOURCES]).toEqual([...pkg.NATIVE_SOURCES]);
  });
  it("round-trips signed headers and rejects stale / tampered ones", async () => {
    const h = await signedHeaders("s", "p", { method: "REQUEST", path: "/x", body: "{}" });
    expect((await verify("s", h, { method: "REQUEST", path: "/x", body: "{}" })).ok).toBe(true);
    expect((await verify("s", h, { method: "REQUEST", path: "/x", body: "{}" }, { expectedNonce: "other" })).ok).toBe(false);
    expect((await verify("x", h, { method: "REQUEST", path: "/x", body: "{}" })).ok).toBe(false);
    const old = await signedHeaders("s", "p", { method: "REQUEST", path: "/x", body: "", timestamp: Date.now() - 6 * 60_000 });
    expect(await verify("s", old, { method: "REQUEST", path: "/x", body: "" })).toMatchObject({ ok: false, reason: "stale" });
  });
  it("compares client versions", () => {
    expect(versionAtLeast("0.1.0", "0.1.0")).toBe(true);
    expect(versionAtLeast("0.2.0-beta.1", "0.1.9")).toBe(true);
    expect(versionAtLeast("0.0.9", "0.1.0")).toBe(false);
    expect(versionAtLeast("1.0.0", "0.9.9")).toBe(true);
  });
  it("normalizes unknown sources to custom", () => {
    expect(normalizeSource("prisma")).toBe("prisma");
    expect(normalizeSource("mongo")).toBe("custom");
    expect(normalizeSource(undefined)).toBe("custom");
  });
  it("generates ut_int_ secrets with a display prefix", () => {
    const { secret, prefix } = generateIntegrationSecret();
    expect(secret).toMatch(/^ut_int_[A-Za-z0-9]{40}$/);
    expect(prefix).toBe(secret.slice(0, 11));
    expect(generateIntegrationSecret().secret).not.toBe(secret);
  });
});
