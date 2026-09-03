import { describe, expect, it } from "vitest";
import { renderWidgetHtml, type WidgetData } from "./widget";

const data: WidgetData = { slug: "acme", name: "Acme", totalUsers: 12481, newUsers7d: 300, newUsers30d: 1900, growth7dPct: 2.5, growth30dPct: 18.2, trust: "verified", trustLabel: "Verified", trendingRank: 4, lastSyncedAt: 1, spark: [1, 2, 3] };
const base = { theme: "auto" as const, window: "30d" as const, jsonUrl: "https://ut.dev/api/embed/acme.json", pageUrl: "https://ut.dev/s/acme?ref=embed", homeUrl: "https://ut.dev/?ref=embed" };

describe("renderWidgetHtml", () => {
  it("inlines config + data and links to the product page", () => {
    const h = renderWidgetHtml({ ...base, type: "users", data });
    expect(h.startsWith("<!doctype html>")).toBe(true);
    expect(h).toContain('data-theme="auto"');
    expect(h).toContain('content="dark light"');
    expect(h).toContain('window.__UT_CFG={"type":"users","window":"30d","json":"https://ut.dev/api/embed/acme.json","refreshMs":300000}');
    expect(h).toContain('"totalUsers":12481');
    expect(h).toContain('href="https://ut.dev/s/acme?ref=embed"');
    expect(h).toContain('<meta name="robots" content="noindex">');
    expect(h).toContain("<title>Acme on UserTrack</title>");
  });
  it("renders the not-found state without a refresh loop", () => {
    const h = renderWidgetHtml({ ...base, type: "chart", theme: "light", data: null });
    expect(h).toContain('data-theme="light"');
    expect(h).toContain('content="light"');
    expect(h).toContain('"json":null');
    expect(h).toContain("window.__UT_DATA=null");
    expect(h).toContain('href="https://ut.dev/?ref=embed"');
    expect(h).toContain("<title>Not found on UserTrack</title>");
  });
  it("escapes names in markup and in the inlined JSON", () => {
    const h = renderWidgetHtml({ ...base, type: "verified", data: { ...data, name: '</script><b>"x"' } });
    expect(h).not.toContain("</script><b>");
    expect(h).toContain("\\u003c/script>");
    expect(h).toContain("&lt;/script&gt;&lt;b&gt;");
  });
});
