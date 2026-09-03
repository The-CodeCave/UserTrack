// Widget embed parameters + snippets. Shared by the configurator, the /embed route, the loader defaults and the MCP
// gateway (imported from convex/), so every snippet matches what /embed/[slug] actually parses.
export const WIDGET_TYPES = ["users", "growth", "verified", "chart"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];
export type WidgetTheme = "dark" | "light" | "auto";
export type WidgetWindow = "7d" | "30d";
export interface WidgetParams { type: WidgetType; theme: WidgetTheme; window: WidgetWindow }

export const WIDGET_REFRESH_MS = 5 * 60_000;
// Initial iframe size; the widget reports its real size via postMessage once rendered.
export const WIDGET_SIZE: Record<WidgetType, { width: number; height: number }> = {
  users: { width: 200, height: 28 },
  growth: { width: 180, height: 28 },
  verified: { width: 170, height: 28 },
  chart: { width: 320, height: 120 },
};
export const widgetHasWindow = (type: WidgetType) => type === "growth" || type === "chart";

export function parseWidgetParams(q: URLSearchParams): WidgetParams {
  const type = (WIDGET_TYPES as readonly string[]).includes(q.get("type") ?? "") ? (q.get("type") as WidgetType) : "users";
  const t = q.get("theme");
  return { type, theme: t === "dark" || t === "light" ? t : "auto", window: q.get("window") === "7d" ? "7d" : "30d" };
}

export function widgetQuery(p: WidgetParams) {
  const q = new URLSearchParams({ type: p.type });
  if (p.theme !== "auto") q.set("theme", p.theme);
  if (widgetHasWindow(p.type) && p.window === "7d") q.set("window", "7d");
  return q.toString();
}

// Every link out of a widget is attributable: ref for the app, utm_* for whatever analytics the founder runs.
export const widgetPageUrl = (siteUrl: string, slug: string, type: WidgetType) => `${siteUrl}/s/${slug}?ref=embed&utm_source=embed&utm_medium=widget&utm_campaign=${type}`;

export function widgetSnippets(o: { siteUrl: string; slug: string; name: string } & WidgetParams) {
  const q = widgetQuery(o);
  const iframeSrc = `${o.siteUrl}/embed/${o.slug}?${q}`;
  const { width, height } = WIDGET_SIZE[o.type];
  const attrs = [`data-slug="${o.slug}"`, `data-type="${o.type}"`, ...(o.theme !== "auto" ? [`data-theme="${o.theme}"`] : []), ...(widgetHasWindow(o.type) && o.window === "7d" ? [`data-window="7d"`] : [])];
  return {
    iframeSrc,
    jsonUrl: `${o.siteUrl}/api/embed/${o.slug}.json`,
    scriptUrl: `${o.siteUrl}/widget.js`,
    script: `<script async src="${o.siteUrl}/widget.js" ${attrs.join(" ")}></script>`,
    iframe: `<iframe src="${iframeSrc}" width="${width}" height="${height}" title="${o.name} on UserTrack" loading="lazy" scrolling="no" style="border:0;overflow:hidden;max-width:100%"></iframe>`,
    width,
    height,
  };
}
