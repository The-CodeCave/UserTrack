export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const RANGES = ["24h", "7d", "30d", "90d", "1y", "all"] as const;
export type Range = (typeof RANGES)[number];

export const RANGE_MS: Record<Range, number | null> = {
  "24h": DAY,
  "7d": 7 * DAY,
  "30d": 30 * DAY,
  "90d": 90 * DAY,
  "1y": 365 * DAY,
  all: null,
};

export function dayKey(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function dayStart(ts: number) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ISO week key, e.g. 2026-W36 (Monday-based).
export function weekKey(ts: number) {
  const d = new Date(dayStart(ts));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
