import { describe, expect, it } from "vitest";
import { CACHEABLE_PUBLIC, PUBLIC_CACHE_CONTROL, PUBLIC_REVALIDATE, isCacheablePublicPath, stableArgs } from "./public-cache";
import { LEGAL_PAGES } from "./legal";

describe("public cache policy", () => {
  it("covers every anonymous page and no signed-in or API route", () => {
    for (const path of ["/", "/leaderboard", "/trending", "/discover", "/compare", "/categories", "/categories/ai", "/rankings", "/rankings/2026/08/all", "/s/acme", "/s/acme/share/milestone", "/u/ada", "/stacks/nextjs", "/developers", "/developers/webhooks", "/hidden-gems", "/biggest-movers", "/sitemap.xml", "/robots.txt"])
      expect(isCacheablePublicPath(path), path).toBe(true);
    for (const p of LEGAL_PAGES) expect(isCacheablePublicPath(p.href), p.href).toBe(true);
    for (const path of ["/app", "/app/settings", "/sign-in", "/sign-up", "/api/v1/leaderboard", "/api/auth/session", "/api/account/export", "/email/preferences", "/mcp", "/embed/acme"])
      expect(isCacheablePublicPath(path), path).toBe(false);
  });

  it("keeps the header and the ISR window in sync", () => {
    expect(PUBLIC_CACHE_CONTROL).toBe(`public, s-maxage=${PUBLIC_REVALIDATE}, stale-while-revalidate=1800`);
    expect(new Set(CACHEABLE_PUBLIC).size).toBe(CACHEABLE_PUBLIC.length);
  });

  it("keys cached Convex reads by value, not by argument order", () => {
    expect(stableArgs({ board: "trending", window: "7d" })).toBe(stableArgs({ window: "7d", board: "trending" }));
    expect(stableArgs({ board: "trending" })).not.toBe(stableArgs({ board: "fastest" }));
    expect(stableArgs({ slugs: ["a", "b"] })).not.toBe(stableArgs({ slugs: ["b", "a"] }));
  });
});
