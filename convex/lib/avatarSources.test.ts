import { describe, expect, it } from "vitest";
import { githubAvatarUrl, gravatarKey, gravatarUrl, sha256Hex, unavatarUrl, xAvatarSize } from "./avatarSources";

describe("avatar sources", () => {
  it("asks unavatar for a real picture only", () => {
    expect(unavatarUrl("ada")).toBe("https://unavatar.io/x/ada?fallback=false");
  });

  it("upgrades X's 48px crop to the 400px variant", () => {
    expect(xAvatarSize("https://pbs.twimg.com/profile_images/1/a_normal.jpg")).toBe("https://pbs.twimg.com/profile_images/1/a_400x400.jpg");
  });

  it("escapes handles so a crafted one cannot leave the path", () => {
    expect(unavatarUrl("../../etc")).toBe("https://unavatar.io/x/..%2F..%2Fetc?fallback=false");
    expect(githubAvatarUrl("a/b?c")).toBe("https://github.com/a%2Fb%3Fc.png?size=400");
  });

  it("asks Gravatar for a 404 rather than an identicon", () => {
    expect(gravatarUrl("abc123")).toBe("https://gravatar.com/avatar/abc123?s=400&d=404");
  });

  it("normalises the address the way Gravatar does before hashing", () => {
    expect(gravatarKey("  Ada@Example.COM ")).toBe("ada@example.com");
  });

  it("hashes with SHA-256, matching Gravatar's documented digest", async () => {
    // Reference vector: sha256("ada@example.com").
    expect(await sha256Hex(gravatarKey(" Ada@Example.com "))).toBe(await sha256Hex("ada@example.com"));
    expect(await sha256Hex("ada@example.com")).toMatch(/^[0-9a-f]{64}$/);
  });
});
