import { describe, expect, it } from "vitest";
import { renderBadge, renderNotFoundBadge, type BadgeInput } from "./badge";

const base: BadgeInput = { type: "users", theme: "dark", name: "Acme", totalUsers: 12481, newUsers30d: 1900, growth30dPct: 18.2, trendingRank: 4, trustLabel: "Verified" };
const width = (s: string) => Number(/ width="(\d+)"/.exec(s)![1]);

describe("renderBadge", () => {
  it("renders users", () => {
    const s = renderBadge(base);
    expect(s.startsWith("<svg")).toBe(true);
    expect(s).toContain('height="28"');
    expect(s).toContain('role="img"');
    expect(s).toContain("<title>Acme on UserTrack</title>");
    expect(s).toContain(">12,481 users</text>");
    expect(s).toContain("UserTrack</text>");
    expect(s).toContain("ui-monospace, Menlo, Consolas, monospace");
  });
  it("renders growth", () => {
    expect(renderBadge({ ...base, type: "growth" })).toContain(">+18.2% · 30d</text>");
  });
  it("renders trending with and without rank", () => {
    expect(renderBadge({ ...base, type: "trending" })).toContain(">#4 trending</text>");
    expect(renderBadge({ ...base, type: "trending", trendingRank: undefined })).toContain(">— trending</text>");
  });
  it("renders verified with pink border", () => {
    const s = renderBadge({ ...base, type: "verified" });
    expect(s).toContain(">VERIFIED</text>");
    expect(s).toContain('stroke="#fb0184"');
  });
  it("light theme swaps colors", () => {
    const s = renderBadge({ ...base, theme: "light" });
    expect(s).toContain('fill="#ffffff"');
    expect(s).toContain('fill="#111111"');
    expect(s).toContain("rgba(0,0,0,0.15)");
    expect(s).not.toContain("#0b0c0e");
  });
  it("escapes XML in text", () => {
    const s = renderBadge({ ...base, name: 'A<b>&"c"', type: "verified", trustLabel: "<x>" });
    expect(s).not.toContain("<b>");
    expect(s).not.toContain("<x>");
    expect(s).toContain("A&lt;b&gt;&amp;&quot;c&quot; on UserTrack");
    expect(s).toContain(">&lt;X&gt;</text>");
  });
  it("width grows with text", () => {
    expect(width(renderBadge({ ...base, totalUsers: 12_345_678 }))).toBeGreaterThan(width(renderBadge({ ...base, totalUsers: 7 })));
  });
  it("renders not-found badge", () => {
    const s = renderNotFoundBadge("dark");
    expect(s).toContain(">not found</text>");
    expect(s).toContain("<title>Not found on UserTrack</title>");
  });
});
