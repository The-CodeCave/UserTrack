import { describe, expect, it } from "vitest";
import { canonicalString, generateIntegrationSecret, sha256Hex, sign, signedHeaders, verify, versionAtLeast } from "./betterAuthProtocol";
import fixtures from "../../packages/better-auth/tests/fixtures/signatures.json";

describe("Better Auth protocol (server twin)", () => {
  it("matches the frozen fixtures shared with @usertrack/better-auth", async () => {
    for (const f of fixtures.cases) {
      const input = { method: f.method as "REQUEST" | "RESPONSE", path: f.path, timestamp: f.timestamp, nonce: f.nonce, body: f.body };
      expect(await sha256Hex(f.body)).toBe(f.bodyHash);
      expect(canonicalString(input, f.bodyHash)).toBe(f.canonical);
      expect(await sign(fixtures.secret, input)).toBe(f.signature);
    }
  });
  it("round-trips signed headers and rejects stale / tampered ones", async () => {
    const h = await signedHeaders("s", "p", { method: "REQUEST", path: "/x", body: "{}" });
    expect((await verify("s", h, { method: "REQUEST", path: "/x", body: "{}" })).ok).toBe(true);
    expect((await verify("s", h, { method: "REQUEST", path: "/x", body: "{}" }, { expectedNonce: "other" })).ok).toBe(false);
    expect((await verify("x", h, { method: "REQUEST", path: "/x", body: "{}" })).ok).toBe(false);
    const old = await signedHeaders("s", "p", { method: "REQUEST", path: "/x", body: "", timestamp: Date.now() - 6 * 60_000 });
    expect(await verify("s", old, { method: "REQUEST", path: "/x", body: "" })).toMatchObject({ ok: false, reason: "stale" });
  });
  it("compares plugin versions", () => {
    expect(versionAtLeast("0.1.0", "0.1.0")).toBe(true);
    expect(versionAtLeast("0.2.0-beta.1", "0.1.9")).toBe(true);
    expect(versionAtLeast("0.0.9", "0.1.0")).toBe(false);
    expect(versionAtLeast("1.0.0", "0.9.9")).toBe(true);
  });
  it("generates ut_int_ secrets with a display prefix", () => {
    const { secret, prefix } = generateIntegrationSecret();
    expect(secret).toMatch(/^ut_int_[A-Za-z0-9]{40}$/);
    expect(prefix).toBe(secret.slice(0, 11));
    expect(generateIntegrationSecret().secret).not.toBe(secret);
  });
});
