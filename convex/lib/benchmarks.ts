// Minimum cohort size before any percentile is shown. Below it a cohort is dropped entirely, so nobody can
// reverse-engineer a competitor from a two-product "median". Raise as the public set grows.
export const MIN_SAMPLE = 5;
// Conversion cohorts are smaller (only published rates count); same floor for now.
export const MIN_SAMPLE_CONVERSION = 5;

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

export const BENCHMARK_METRICS = ["growth30dPct", "newUsers30d", "activationRatePct", "growth7dPct", "trendingScore7d", "signupToConvertedPct", "activatedToConvertedPct", "trialToConvertedPct", "convertedGrowth30dPct"] as const;
export type BenchmarkMetric = (typeof BENCHMARK_METRICS)[number];
export const BENCHMARK_METRIC_LABEL: Record<BenchmarkMetric, string> = {
  growth30dPct: "30-day growth",
  growth7dPct: "7-day growth",
  newUsers30d: "new users (30d)",
  activationRatePct: "activation rate",
  trendingScore7d: "trending score",
  signupToConvertedPct: "signup → converted rate",
  activatedToConvertedPct: "activated → converted rate",
  trialToConvertedPct: "trial → converted rate",
  convertedGrowth30dPct: "converted-user growth (30d)",
};
// Only equivalent definitions are ever compared: every stored metric is an aggregate ratio/count, never a cohort figure.
export const BENCHMARK_METRIC_BASIS: Record<BenchmarkMetric, "aggregate" | "cohort"> = {
  growth30dPct: "aggregate",
  growth7dPct: "aggregate",
  newUsers30d: "aggregate",
  activationRatePct: "aggregate",
  trendingScore7d: "aggregate",
  signupToConvertedPct: "aggregate",
  activatedToConvertedPct: "aggregate",
  trialToConvertedPct: "aggregate",
  convertedGrowth30dPct: "aggregate",
};
export const CONVERSION_BENCHMARK_METRICS: readonly BenchmarkMetric[] = ["signupToConvertedPct", "activatedToConvertedPct", "trialToConvertedPct", "convertedGrowth30dPct"];
export const isConversionBenchmark = (m: BenchmarkMetric) => CONVERSION_BENCHMARK_METRICS.includes(m);

// "1.8× the median" — only when the median is meaningful (> 0); rounded to one decimal.
export function medianMultiple(value: number, median: number) {
  if (!(median > 0) || value < 0) return null;
  return Math.round((value / median) * 10) / 10;
}

// Sentences for founders. Avoids false precision: percentiles are steps of 5, multiples one decimal.
export function benchmarkInsight(i: { metricLabel: string; groupLabel: string; percentile: number; value: number; median: number }) {
  const ahead = i.percentile >= 50;
  const pct = ahead ? i.percentile : 100 - i.percentile;
  const head = `Your ${i.metricLabel} is ${ahead ? "ahead of" : "behind"} ${pct}% of ${i.groupLabel}.`;
  const mult = medianMultiple(i.value, i.median);
  if (i.percentile >= 80) return `${head} Top ${100 - i.percentile}%.`;
  if (mult !== null && mult >= 1.2) return `${head} ${mult}× the median.`;
  return head;
}

// Public statement only for strong positions, so the page never exposes a weak founder's cohort standing.
export function publicBenchmarkStatement(i: { metricLabel: string; groupLabel: string; percentile: number }) {
  if (i.percentile < 75) return null;
  return `Top ${100 - i.percentile}% ${i.metricLabel} in ${i.groupLabel}`;
}
