export interface Point { capturedAt: number; totalUsers: number }

// Users gained since `baseline`; when there is no snapshot before the window, the first snapshot is the baseline.
export function windowDelta(total: number, baseline: Point | null, first: Point | null) {
  const base = baseline ?? first;
  if (!base) return 0;
  return total - base.totalUsers;
}

export function growthPct(total: number, baseline: Point | null, first: Point | null) {
  const base = baseline ?? first;
  if (!base || base.totalUsers <= 0) return 0;
  return Math.round(((total - base.totalUsers) / base.totalUsers) * 1000) / 10;
}

// Delta inside a past window [start, end], both snapshots optional (first snapshot is the floor).
export function previousWindowDelta(end: Point | null, start: Point | null, first: Point | null) {
  const e = end ?? first;
  const s = start ?? first;
  if (!e || !s) return 0;
  return Math.max(0, e.totalUsers - s.totalUsers);
}

// Collapse raw snapshots into chart points with per-point deltas.
export function toSeries(points: Point[]) {
  let prev: number | null = null;
  return points.map((p) => {
    const delta = prev === null ? 0 : p.totalUsers - prev;
    prev = p.totalUsers;
    return { t: p.capturedAt, total: p.totalUsers, delta };
  });
}

export function pct(part: number | undefined, whole: number | undefined) {
  if (part === undefined || whole === undefined || whole <= 0) return undefined;
  return Math.round((part / whole) * 1000) / 10;
}

// Size buckets used for benchmarks and leaderboard filters.
export const SIZE_BUCKETS = [
  { key: "0-100", label: "< 100", min: 0, max: 100 },
  { key: "100-1k", label: "100 – 1K", min: 100, max: 1_000 },
  { key: "1k-10k", label: "1K – 10K", min: 1_000, max: 10_000 },
  { key: "10k-100k", label: "10K – 100K", min: 10_000, max: 100_000 },
  { key: "100k+", label: "100K+", min: 100_000, max: Infinity },
] as const;
export type SizeBucket = (typeof SIZE_BUCKETS)[number]["key"];

export function sizeBucket(totalUsers: number): SizeBucket {
  return (SIZE_BUCKETS.find((b) => totalUsers >= b.min && totalUsers < b.max) ?? SIZE_BUCKETS[0]).key;
}
