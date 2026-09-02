import { formatCompact, formatDelta, formatPct } from "@/lib/format";

export type BadgeType = "users" | "growth" | "trending" | "verified" | "chart";
export type BadgeTheme = "dark" | "light";
export type BadgeWindow = "7d" | "30d";
export const BADGE_TYPES: BadgeType[] = ["users", "growth", "trending", "verified", "chart"];

export interface BadgeInput {
  type: BadgeType;
  theme: BadgeTheme;
  name: string;
  totalUsers: number;
  newUsers7d?: number;
  newUsers30d: number;
  growth7dPct?: number;
  growth30dPct: number;
  trendingRank?: number;
  trustLabel: string;
  window?: BadgeWindow;
  compact?: boolean;
  spark?: number[];
}

const PINK = "#fb0184";
const H = 28;
const CHAR = 7;
const PAD = 8;
const num = new Intl.NumberFormat("en");
const FONT = `font-family="ui-monospace, Menlo, Consolas, monospace"`;

export const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function palette(theme: BadgeTheme) {
  return theme === "light"
    ? { base: "#ffffff", text: "#111111", line: "rgba(0,0,0,0.15)", muted: "#6b7280", grid: "rgba(0,0,0,0.06)" }
    : { base: "#0b0c0e", text: "#ffffff", line: "rgba(255,255,255,0.2)", muted: "#8b8f98", grid: "rgba(255,255,255,0.06)" };
}

const bars = (x: number, y: number) => [4, 6, 8, 10].map((h, i) => `<rect x="${x + i * 3}" y="${y - h}" width="2" height="${h}" fill="${PINK}"/>`).join("");

function svg(theme: BadgeTheme, title: string, value: string, right: { bg: string; fg: string; border?: string }, compact = false) {
  const p = palette(theme);
  const leftW = compact ? PAD + 12 + PAD - 2 : PAD + 12 + 6 + "UserTrack".length * CHAR + PAD;
  const rightW = PAD + value.length * CHAR + PAD;
  const w = leftW + rightW;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>` +
    `<rect width="${w}" height="${H}" fill="${p.base}"/>` +
    `<rect x="${leftW}" width="${rightW}" height="${H}" fill="${right.bg}"/>` +
    bars(PAD, 19) +
    (compact ? "" : `<text x="${PAD + 18}" y="18" ${FONT} font-size="12" fill="${p.text}">UserTrack</text>`) +
    `<text x="${leftW + PAD}" y="18" ${FONT} font-size="12" fill="${right.fg}">${escapeXml(value)}</text>` +
    (right.border ? `<rect x="${leftW + 0.5}" y="0.5" width="${rightW - 1}" height="${H - 1}" fill="none" stroke="${right.border}"/>` : "") +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${H - 1}" fill="none" stroke="${p.line}"/>` +
    `</svg>`;
}

// 320×120 live widget: total users, window delta and a 30-day sparkline. Always carries the UserTrack mark (embed policy).
function chart(i: BadgeInput) {
  const p = palette(i.theme);
  const W = 320, HH = i.compact ? 96 : 120;
  const values = (i.spark ?? []).filter((v) => Number.isFinite(v));
  const win = i.window ?? "30d";
  const delta = win === "7d" ? (i.newUsers7d ?? 0) : i.newUsers30d;
  const pct = win === "7d" ? (i.growth7dPct ?? 0) : i.growth30dPct;
  const title = `${i.name} on UserTrack: ${num.format(i.totalUsers)} users, ${formatDelta(delta)} in ${win}`;
  const gx = 150, gy = 14, gw = W - gx - 12, gh = HH - gy - 26;
  let path = "";
  let dot = "";
  if (values.length >= 2) {
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, k) => [gx + (k / (values.length - 1)) * gw, gy + gh - ((v - min) / span) * gh] as const);
    path = `<path d="${pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} L${pts[pts.length - 1][0].toFixed(1)} ${gy + gh} L${pts[0][0].toFixed(1)} ${gy + gh} Z" fill="${PINK}" fill-opacity="0.12"/>` +
      `<path d="${pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")}" fill="none" stroke="${p.text}" stroke-width="1.5" stroke-linejoin="round"/>`;
    const [lx, ly] = pts[pts.length - 1];
    dot = `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="${PINK}" stroke="${p.base}" stroke-width="1.5"/>`;
  } else {
    path = `<line x1="${gx}" y1="${gy + gh - 2}" x2="${gx + gw}" y2="${gy + gh - 2}" stroke="${p.line}" stroke-dasharray="2 3"/>`;
  }
  const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="${gx}" y1="${(gy + gh * f).toFixed(1)}" x2="${gx + gw}" y2="${(gy + gh * f).toFixed(1)}" stroke="${p.grid}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HH}" viewBox="0 0 ${W} ${HH}" role="img" aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>` +
    `<rect width="${W}" height="${HH}" fill="${p.base}"/>` +
    grid + path + dot +
    `<text x="14" y="24" ${FONT} font-size="11" letter-spacing="1.5" fill="${p.muted}">${escapeXml((i.name.length > 18 ? `${i.name.slice(0, 17)}…` : i.name).toUpperCase())}</text>` +
    `<text x="14" y="${i.compact ? 56 : 60}" font-family="Geist, Inter, ui-sans-serif, system-ui, sans-serif" font-size="${i.compact ? 26 : 30}" font-weight="600" fill="${p.text}">${escapeXml(formatCompact(i.totalUsers))}</text>` +
    `<text x="14" y="${i.compact ? 74 : 80}" ${FONT} font-size="11" fill="${PINK}">${escapeXml(`${formatDelta(delta)} · ${formatPct(pct)} · ${win}`)}</text>` +
    bars(14, HH - 9) + `<text x="32" y="${HH - 10}" ${FONT} font-size="10" letter-spacing="1" fill="${p.muted}">USERTRACK</text>` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${HH - 1}" fill="none" stroke="${p.line}"/>` +
    `</svg>`;
}

export function renderBadge(i: BadgeInput) {
  const p = palette(i.theme);
  const title = `${i.name} on UserTrack`;
  const win = i.window ?? "30d";
  switch (i.type) {
    case "users":
      return svg(i.theme, title, `${num.format(i.totalUsers)} users`, { bg: PINK, fg: "#ffffff" }, i.compact);
    case "growth":
      return svg(i.theme, title, `${formatPct(win === "7d" ? (i.growth7dPct ?? 0) : i.growth30dPct)} · ${win}`, { bg: p.base, fg: PINK }, i.compact);
    case "trending":
      return svg(i.theme, title, i.trendingRank ? `#${i.trendingRank} trending` : "— trending", { bg: PINK, fg: "#ffffff" }, i.compact);
    case "verified":
      return svg(i.theme, title, i.trustLabel.toUpperCase(), { bg: p.base, fg: p.text, border: PINK }, i.compact);
    case "chart":
      return chart(i);
  }
}

export function renderNotFoundBadge(theme: BadgeTheme) {
  return svg(theme, "Not found on UserTrack", "not found", { bg: palette(theme).base, fg: palette(theme).muted });
}
