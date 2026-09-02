export const MIN_SAMPLE = 5;

// Deciles p10..p90 (9 values) from raw values. Individual values are never persisted.
export function deciles(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return [];
  return Array.from({ length: 9 }, (_, i) => {
    const pos = ((i + 1) / 10) * (v.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  });
}

// Percentile (0–100) of `value` against stored deciles by linear interpolation; deliberately coarse (rounded to 5).
export function percentileOf(value: number, dec: number[]) {
  if (dec.length !== 9) return null;
  if (value <= dec[0]) return 5;
  if (value >= dec[8]) return 95;
  for (let i = 0; i < 8; i++) {
    if (value <= dec[i + 1]) {
      const span = dec[i + 1] - dec[i];
      const frac = span === 0 ? 1 : (value - dec[i]) / span;
      return Math.round(((i + 1) * 10 + frac * 10) / 5) * 5;
    }
  }
  return 95;
}

export const BENCHMARK_METRICS = ["growth30dPct", "newUsers30d", "activationRatePct", "growth7dPct"] as const;
export type BenchmarkMetric = (typeof BENCHMARK_METRICS)[number];
