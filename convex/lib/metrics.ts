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

// Collapse raw snapshots into chart points with per-point deltas.
export function toSeries(points: Point[]) {
  let prev: number | null = null;
  return points.map((p) => {
    const delta = prev === null ? 0 : p.totalUsers - prev;
    prev = p.totalUsers;
    return { t: p.capturedAt, total: p.totalUsers, delta };
  });
}
