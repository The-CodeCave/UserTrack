import { formatPct } from "@/lib/format";

export type BadgeType = "users" | "growth" | "trending" | "verified";
export type BadgeTheme = "dark" | "light";
export const BADGE_TYPES: BadgeType[] = ["users", "growth", "trending", "verified"];

export interface BadgeInput {
  type: BadgeType;
  theme: BadgeTheme;
  name: string;
  totalUsers: number;
  newUsers30d: number;
  growth30dPct: number;
  trendingRank?: number;
  trustLabel: string;
}

const PINK = "#fb0184";
const H = 28;
const CHAR = 7;
const PAD = 8;
const num = new Intl.NumberFormat("en");

export const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function palette(theme: BadgeTheme) {
  return theme === "light"
    ? { base: "#ffffff", text: "#111111", line: "rgba(0,0,0,0.15)", muted: "#6b7280" }
    : { base: "#0b0c0e", text: "#ffffff", line: "rgba(255,255,255,0.2)", muted: "#8b8f98" };
}

function svg(theme: BadgeTheme, title: string, value: string, right: { bg: string; fg: string; border?: string }) {
  const p = palette(theme);
  const leftW = PAD + 12 + 6 + "UserTrack".length * CHAR + PAD;
  const rightW = PAD + value.length * CHAR + PAD;
  const w = leftW + rightW;
  const font = `font-family="ui-monospace, Menlo, Consolas, monospace" font-size="12"`;
  const bars = [4, 6, 8, 10].map((h, i) => `<rect x="${PAD + i * 3}" y="${19 - h}" width="2" height="${h}" fill="${PINK}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>` +
    `<rect width="${w}" height="${H}" fill="${p.base}"/>` +
    `<rect x="${leftW}" width="${rightW}" height="${H}" fill="${right.bg}"/>` +
    bars +
    `<text x="${PAD + 18}" y="18" ${font} fill="${p.text}">UserTrack</text>` +
    `<text x="${leftW + PAD}" y="18" ${font} fill="${right.fg}">${escapeXml(value)}</text>` +
    (right.border ? `<rect x="${leftW + 0.5}" y="0.5" width="${rightW - 1}" height="${H - 1}" fill="none" stroke="${right.border}"/>` : "") +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${H - 1}" fill="none" stroke="${p.line}"/>` +
    `</svg>`;
}

export function renderBadge(i: BadgeInput) {
  const p = palette(i.theme);
  const title = `${i.name} on UserTrack`;
  switch (i.type) {
    case "users":
      return svg(i.theme, title, `${num.format(i.totalUsers)} users`, { bg: PINK, fg: "#ffffff" });
    case "growth":
      return svg(i.theme, title, `${formatPct(i.growth30dPct)} · 30d`, { bg: p.base, fg: PINK });
    case "trending":
      return svg(i.theme, title, i.trendingRank ? `#${i.trendingRank} trending` : "— trending", { bg: PINK, fg: "#ffffff" });
    case "verified":
      return svg(i.theme, title, i.trustLabel.toUpperCase(), { bg: p.base, fg: p.text, border: PINK });
  }
}

export function renderNotFoundBadge(theme: BadgeTheme) {
  return svg(theme, "Not found on UserTrack", "not found", { bg: palette(theme).base, fg: palette(theme).muted });
}
