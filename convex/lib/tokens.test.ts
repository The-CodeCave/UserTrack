import { describe, expect, it } from "vitest";
import { DEFAULT_MCP_SCOPES, displayPrefix, generateSecret, hasScope, isActive, looksLikeSecret, maskToken, sha256Hex, tokenTypeOf, validScopes } from "./tokens";

describe("tokens", () => {
  it("generates prefixed secrets with a display prefix", () => {
    const { secret, prefix } = generateSecret("mcp");
    expect(secret.startsWith("ut_mcp_")).toBe(true);
    expect(secret.length).toBe(47);
    expect(prefix).toBe(secret.slice(0, 11));
    expect(displayPrefix("ut_api_abcdXYZ")).toBe("ut_api_abcd");
    expect(maskToken("ut_api_abcd")).toMatch(/^ut_api_abcd•+$/);
    expect(generateSecret("api").secret).not.toBe(generateSecret("api").secret);
  });

  it("recognises secret shapes", () => {
    expect(tokenTypeOf("ut_api_x")).toBe("api");
    expect(tokenTypeOf("ut_mcp_x")).toBe("mcp");
    expect(tokenTypeOf("sk_live_x")).toBeNull();
    expect(looksLikeSecret(generateSecret("api").secret)).toBe(true);
    expect(looksLikeSecret("ut_api_short")).toBe(false);
    expect(looksLikeSecret("ut_api_" + "a".repeat(40) + "$")).toBe(false);
  });

  it("hashes with SHA-256 (known vectors)", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("The quick brown fox jumps over the lazy dog")).toBe("d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592");
    // 56 bytes hits the padding boundary.
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    expect(sha256Hex("ü€")).toBe("efb65b779538006d489299318d8a96a512e6b42d1127d64a0afa38169c30c33a");
  });

  it("checks scopes and lifetime", () => {
    expect(hasScope(DEFAULT_MCP_SCOPES, "projects:write")).toBe(true);
    expect(hasScope(["metrics:read"], "projects:write")).toBe(false);
    expect(hasScope(["metrics:read"])).toBe(true);
    expect(validScopes(["metrics:read", "profile:read"])).toBe(true);
    expect(validScopes(["follows:read", "follows:write", "webhooks:read", "webhooks:write"])).toBe(true);
    expect(DEFAULT_MCP_SCOPES).toEqual(expect.arrayContaining(["follows:read", "follows:write", "webhooks:read", "webhooks:write"]));
    expect(validScopes(["metrics:read", "tokens:manage"])).toBe(false);
    expect(isActive({}, 100)).toBe(true);
    expect(isActive({ revokedAt: 50 }, 100)).toBe(false);
    expect(isActive({ expiresAt: 100 }, 100)).toBe(false);
    expect(isActive({ expiresAt: 101 }, 100)).toBe(true);
  });
});
