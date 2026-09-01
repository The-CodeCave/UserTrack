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
