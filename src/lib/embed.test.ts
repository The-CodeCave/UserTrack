import { describe, expect, it } from "vitest";
import { parseWidgetParams, widgetPageUrl, widgetQuery, widgetSnippets } from "./embed";

describe("widget params", () => {
  it("parses with safe defaults", () => {
    expect(parseWidgetParams(new URLSearchParams(""))).toEqual({ type: "users", theme: "auto", window: "30d" });
    expect(parseWidgetParams(new URLSearchParams("type=chart&theme=light&window=7d"))).toEqual({ type: "chart", theme: "light", window: "7d" });
    expect(parseWidgetParams(new URLSearchParams("type=evil&theme=neon&window=1y"))).toEqual({ type: "users", theme: "auto", window: "30d" });
  });
  it("round-trips through the query string and omits defaults", () => {
    const p = { type: "growth", theme: "dark", window: "7d" } as const;
    expect(widgetQuery(p)).toBe("type=growth&theme=dark&window=7d");
    expect(parseWidgetParams(new URLSearchParams(widgetQuery(p)))).toEqual(p);
    expect(widgetQuery({ type: "users", theme: "auto", window: "7d" })).toBe("type=users");
  });
});

describe("widgetSnippets", () => {
  const base = { siteUrl: "https://usertrack.dev", slug: "acme", name: "Acme" } as const;
  it("builds matching script and iframe snippets", () => {
    const s = widgetSnippets({ ...base, type: "users", theme: "auto", window: "30d" });
    expect(s.script).toBe('<script async src="https://usertrack.dev/widget.js" data-slug="acme" data-type="users"></script>');
    expect(s.iframeSrc).toBe("https://usertrack.dev/embed/acme?type=users");
    expect(s.iframe).toContain('width="200" height="28"');
    expect(s.iframe).toContain('title="Acme on UserTrack"');
    expect(s.jsonUrl).toBe("https://usertrack.dev/api/embed/acme.json");
  });
  it("carries theme and window only when they differ from the defaults", () => {
    const s = widgetSnippets({ ...base, type: "chart", theme: "light", window: "7d" });
    expect(s.script).toContain('data-theme="light" data-window="7d"');
    expect(s.iframeSrc).toBe("https://usertrack.dev/embed/acme?type=chart&theme=light&window=7d");
    expect(s.width).toBe(320);
    expect(widgetSnippets({ ...base, type: "verified", theme: "auto", window: "7d" }).script).not.toContain("data-window");
  });
  it("links back with attribution", () => {
    expect(widgetPageUrl("https://usertrack.dev", "acme", "chart")).toBe("https://usertrack.dev/s/acme?ref=embed&utm_source=embed&utm_medium=widget&utm_campaign=chart");
  });
});
