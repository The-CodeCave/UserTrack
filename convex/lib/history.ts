// Pure history helpers: downsampling for long ranges, honest gap markers, rank movement. No I/O (docs/HISTORY.md).
import { DAY, weekKey, type Range } from "./time";

export interface DailyPoint { day: string; totalUsers: number; newUsers: number; activatedUsers?: number; visitors?: number; convertedUsers?: number }
export interface HistoryPoint { t: number; total: number; delta: number; activated?: number; visitors?: number; converted?: number }
export interface Gap { from: number; to: number; days: number }

export type Resolution = "raw" | "day" | "week" | "month";

// UI ranges → storage resolution. Raw 4h snapshots for a week, daily rows up to a year, weekly / monthly beyond.
export function resolutionFor(range: Range, spanDays = 0): Resolution {
  if (range === "24h" || range === "7d") return "raw";
  if (range === "30d" || range === "90d") return "day";
  if (range === "1y") return "week";
  return spanDays > 2 * 365 ? "month" : "week";
}

const bucketOf = (day: string, res: Resolution) => (res === "week" ? weekKey(Date.parse(`${day}T12:00:00Z`)) : res === "month" ? day.slice(0, 7) : day);

// Collapses daily rows into one point per bucket: the last total of the bucket, new users summed over the bucket.
// Nothing is interpolated — a bucket without rows produces no point.
export function downsample(rows: DailyPoint[], res: Resolution): HistoryPoint[] {
  if (res === "raw" || res === "day") return rows.map(toPoint);
  const out: HistoryPoint[] = [];
  let key = "";
  for (const r of rows) {
    const k = bucketOf(r.day, res);
    if (k !== key) {
      out.push(toPoint(r));
      key = k;
    } else {
      const last = out[out.length - 1];
      last.t = tOf(r.day);
      last.total = r.totalUsers;
      last.delta += r.newUsers;
      last.activated = r.activatedUsers ?? last.activated;
      last.visitors = r.visitors !== undefined ? (last.visitors ?? 0) + r.visitors : last.visitors;
      last.converted = r.convertedUsers ?? last.converted;
    }
  }
  return out;
}

const tOf = (day: string) => Date.parse(`${day}T12:00:00Z`);
const toPoint = (r: DailyPoint): HistoryPoint => ({ t: tOf(r.day), total: r.totalUsers, delta: r.newUsers, activated: r.activatedUsers, visitors: r.visitors, converted: r.convertedUsers });

// Rebuilds end-of-day totals from per-day signups by walking back from the current total. Today's signups are subtracted
// but not emitted (the live snapshot owns today); `before` is the total ahead of the first point, the baseline for its newUsers.
export function reconstructTotals(points: { day: string; value: number }[], total: number, today: string) {
  let running = total;
  const totals: { day: string; value: number }[] = [];
  for (const p of [...points].sort((a, b) => b.day.localeCompare(a.day))) {
    if (p.day < today) totals.push({ day: p.day, value: Math.max(0, running) });
    running -= p.value;
  }
  return { totals: totals.reverse(), before: Math.max(0, running) };
}

// Stretches without any stored row longer than `minDays`. Charts shade them instead of drawing a line across.
export function findGaps(points: { t: number }[], minDays = 3): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 1; i < points.length; i++) {
    const days = Math.round((points[i].t - points[i - 1].t) / DAY);
    if (days > minDays) gaps.push({ from: points[i - 1].t, to: points[i].t, days });
  }
  return gaps;
}

// Rank movement between two stored positions. `from` undefined = not ranked then (new entry).
export function rankMovement(from: number | undefined, to: number | undefined) {
  if (to === undefined) return null;
  if (from === undefined) return { kind: "new" as const, delta: 0 };
  return { kind: from > to ? ("up" as const) : from < to ? ("down" as const) : ("same" as const), delta: from - to };
}

export const RANK_JUMP = { minDelta: 10, maxRank: 50 } as const;

// A "biggest mover" feed event: climbed at least 10 places in 7 days and now inside the top 50. Keyed per day upstream.
export function isRankJump(from: number | undefined, to: number | undefined) {
  return from !== undefined && to !== undefined && to <= RANK_JUMP.maxRank && from - to >= RANK_JUMP.minDelta;
}
