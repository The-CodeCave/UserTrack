import { describe, expect, it } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import nextConfig from "../../next.config";

// next.config.ts relies on entry order: the catch-all CSP first, then X-Frame-Options for everything that is not
// embeddable, then the embeddable overrides. This walks the entries the way Next does — later match wins per key.
async function headersFor(path: string) {
  const entries = await nextConfig.headers!();
  const out = new Map<string, string>();
  for (const entry of entries) if (getPathMatch(entry.source)(path)) for (const h of entry.headers) out.set(h.key, h.value);
  return out;
}

describe("next.config headers", () => {
  it("leaves the embeddable routes framable by anyone", async () => {
    for (const path of ["/embed/acme", "/embed/acme/chart", "/api/badge/acme.svg", "/api/embed/acme.json", "/widget.js"]) {
      const h = await headersFor(path);
      expect(h.get("Content-Security-Policy"), path).toContain("frame-ancestors *");
      expect(h.has("X-Frame-Options"), path).toBe(false);
    }
  });

  it("denies framing everywhere else", async () => {
    for (const path of ["/", "/leaderboard", "/app", "/app/settings/notifications", "/s/acme", "/api/v1/leaderboard", "/embedded-nope"]) {
      const h = await headersFor(path);
      expect(h.get("Content-Security-Policy"), path).toContain("frame-ancestors 'none'");
      expect(h.get("X-Frame-Options"), path).toBe("DENY");
    }
  });

  it("sends the SEC-1 headers and the public cache policy on a board page", async () => {
    const h = await headersFor("/leaderboard");
    expect(h.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("Cache-Control")).toBe("public, s-maxage=300, stale-while-revalidate=1800");
    expect((await headersFor("/app")).has("Cache-Control")).toBe(false);
  });
});
