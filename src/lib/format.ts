const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en");

export function formatCompact(n: number) {
  return Math.abs(n) < 10_000 ? full.format(n) : compact.format(n);
}

export function formatDelta(n: number) {
  if (n === 0) return "±0";
  return `${n > 0 ? "+" : "−"}${formatCompact(Math.abs(n))}`;
}

export function formatPct(n: number) {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function timeAgo(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export type Range = "24h" | "7d" | "30d" | "90d" | "1y" | "all";
export const RANGES: Range[] = ["24h", "7d", "30d", "90d", "1y", "all"];

export function formatTick(t: number, range: Range) {
  const d = new Date(t);
  if (range === "24h") return d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (range === "7d") return d.toLocaleDateString("en", { weekday: "short" });
  if (range === "1y" || range === "all") return d.toLocaleDateString("en", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

export function formatPointDate(t: number, range: Range) {
  const d = new Date(t);
  return range === "24h" || range === "7d"
    ? d.toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function formatRate(pct: number | undefined) {
  return pct === undefined ? "—" : `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}
