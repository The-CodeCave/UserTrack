// Benchmark cohorts, deciles, percentiles and insight sentences. Pure; runs in Convex and in tests (docs/BENCHMARKS.md).
import { SIZE_BUCKETS, sizeBucket } from "./metrics";
import { DAY } from "./time";
import { CATEGORIES } from "../../src/lib/categories";

// Minimum cohort size before any percentile is shown. Below it a cohort is dropped entirely, so nobody can
// reverse-engineer a competitor from a two-product "median".
export const MIN_SAMPLE = 10;
// Conversion cohorts are smaller (only published rates count); same floor.
export const MIN_SAMPLE_CONVERSION = 10;

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

export const BENCHMARK_METRICS = ["growth30dPct", "newUsers30d", "activationRatePct", "growth7dPct", "acceleration30dPct", "trendingScore7d", "signupToConvertedPct", "activatedToConvertedPct", "trialToConvertedPct", "convertedGrowth30dPct"] as const;
export type BenchmarkMetric = (typeof BENCHMARK_METRICS)[number];
export const BENCHMARK_METRIC_LABEL: Record<BenchmarkMetric, string> = {
  growth30dPct: "30-day growth",
  growth7dPct: "7-day growth",
  newUsers30d: "new users (30d)",
  activationRatePct: "activation rate",
  acceleration30dPct: "growth acceleration",
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
  acceleration30dPct: "aggregate",
  trendingScore7d: "aggregate",
  signupToConvertedPct: "aggregate",
  activatedToConvertedPct: "aggregate",
  trialToConvertedPct: "aggregate",
  convertedGrowth30dPct: "aggregate",
};
export const CONVERSION_BENCHMARK_METRICS: readonly BenchmarkMetric[] = ["signupToConvertedPct", "activatedToConvertedPct", "trialToConvertedPct", "convertedGrowth30dPct"];
export const isConversionBenchmark = (m: BenchmarkMetric) => CONVERSION_BENCHMARK_METRICS.includes(m);

export interface BenchmarkSubject {
  totalUsers: number;
  newUsers30d: number;
  newUsersPrev30d?: number;
  growth30dPct: number;
  growth7dPct?: number;
  activationRatePct?: number;
  trendingScore7d?: number;
  signupToConvertedPct?: number;
  activatedToConvertedPct?: number;
  trialToConvertedPct?: number;
  convertedGrowth30dPct?: number;
  category?: string;
  projectType?: "web" | "mobile" | "hybrid";
  foundedAt?: number;
  firstSnapshotAt?: number;
}

// Growth acceleration: this 30-day window vs the previous one, in %. Needs a previous window with at least 10 users.
export function acceleration30dPct(s: Pick<BenchmarkSubject, "newUsers30d" | "newUsersPrev30d">) {
  if (s.newUsersPrev30d === undefined || s.newUsersPrev30d < 10) return undefined;
  return Math.round(((s.newUsers30d - s.newUsersPrev30d) / s.newUsersPrev30d) * 1000) / 10;
}

// The product's current value of a benchmarked metric (undefined = does not take part in that metric's cohorts).
export function benchmarkValue(s: BenchmarkSubject, metric: BenchmarkMetric): number | undefined {
  const v = metric === "acceleration30dPct" ? acceleration30dPct(s) : s[metric];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// ---- Cohorts ------------------------------------------------------------------------------------------------------------

export const AGE_BUCKETS = [
  { key: "lt3m", label: "under 3 months", min: 0, max: 90 },
  { key: "3-6m", label: "3–6 months", min: 90, max: 180 },
  { key: "6-12m", label: "6–12 months", min: 180, max: 365 },
  { key: "1-2y", label: "1–2 years", min: 365, max: 730 },
  { key: "2y+", label: "2+ years", min: 730, max: Infinity },
] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number]["key"];

export function ageBucket(sinceMs: number, now = Date.now()): AgeBucket {
  const days = Math.max(0, now - sinceMs) / DAY;
  return (AGE_BUCKETS.find((b) => days >= b.min && days < b.max) ?? AGE_BUCKETS[AGE_BUCKETS.length - 1]).key;
}

export const PLATFORM_LABEL: Record<"web" | "mobile" | "hybrid", string> = { web: "web SaaS", mobile: "mobile apps", hybrid: "hybrid (web + mobile) products" };

export interface Cohort { key: string; label: string; short: string; dimension: "all" | "category" | "size" | "category_size" | "platform" | "age" | "tracked" }

// Every cohort a product belongs to, category cohorts first (the most meaningful comparison), `all` last.
// Age uses the founder-entered founding date when present (`age:`), otherwise the UserTrack tracking age (`tracked:`) —
// two separate families with separate labels, never mixed.
export function cohortsFor(s: BenchmarkSubject, now = Date.now()): Cohort[] {
  const cat = s.category ? CATEGORIES.find((c) => c.slug === s.category) : undefined;
  const catLabel = cat?.label ?? s.category;
  const size = SIZE_BUCKETS.find((b) => b.key === sizeBucket(s.totalUsers))!;
  const platform = s.projectType ?? "web";
  const out: Cohort[] = [];
  if (catLabel) out.push({ key: `cat:${s.category}`, label: `${catLabel} SaaS`, short: catLabel, dimension: "category" });
  if (catLabel) out.push({ key: `cat:${s.category}|size:${size.key}`, label: `${catLabel} SaaS with ${size.label} users`, short: `${catLabel} · ${size.label}`, dimension: "category_size" });
  out.push({ key: `size:${size.key}`, label: `products with ${size.label} users`, short: `${size.label} users`, dimension: "size" });
  out.push({ key: `platform:${platform}`, label: PLATFORM_LABEL[platform], short: platform === "web" ? "Web" : platform === "mobile" ? "Mobile" : "Hybrid", dimension: "platform" });
  if (s.foundedAt !== undefined) {
    const b = AGE_BUCKETS.find((x) => x.key === ageBucket(s.foundedAt!, now))!;
    out.push({ key: `age:${b.key}`, label: `products founded ${b.label} ago`, short: `founded ${b.label} ago`, dimension: "age" });
  } else if (s.firstSnapshotAt !== undefined) {
    const b = AGE_BUCKETS.find((x) => x.key === ageBucket(s.firstSnapshotAt!, now))!;
    out.push({ key: `tracked:${b.key}`, label: `products tracked on UserTrack for ${b.label}`, short: `tracked ${b.label}`, dimension: "tracked" });
  }
  out.push({ key: "all", label: "all SaaS on UserTrack", short: "All SaaS", dimension: "all" });
  return out;
}

// Human-readable definition of a cohort key (for API consumers and the dashboard tooltip).
export function describeCohort(key: string): string {
  if (key === "all") return "Every public, verified, non-demo product that is not under review.";
  const parts = key.split("|").map((p) => {
    const [dim, val] = p.split(":");
    if (dim === "cat") return `category = ${CATEGORIES.find((c) => c.slug === val)?.label ?? val}`;
    if (dim === "size") return `total users in ${SIZE_BUCKETS.find((b) => b.key === val)?.label ?? val}`;
    if (dim === "platform") return `platform = ${val}`;
    if (dim === "age") return `founded ${AGE_BUCKETS.find((b) => b.key === val)?.label ?? val} ago (founder-entered date)`;
    if (dim === "tracked") return `tracked on UserTrack for ${AGE_BUCKETS.find((b) => b.key === val)?.label ?? val}`;
    return p;
  });
  return `Verified public products where ${parts.join(" and ")}.`;
}

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

// "Your activation rate moved from the 55th to the 70th percentile since last month." — only for real moves (≥ 10 points).
export function percentileChangeInsight(i: { metricLabel: string; percentile: number; previousPercentile: number; sinceLabel: string }) {
  const d = i.percentile - i.previousPercentile;
  if (Math.abs(d) < 10) return null;
  const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
  return `Your ${i.metricLabel} ${d > 0 ? "improved" : "slipped"} from the ${ord(i.previousPercentile)} to the ${ord(i.percentile)} percentile since ${i.sinceLabel}.`;
}

// Public statement only for strong positions, so the page never exposes a weak founder's cohort standing.
export function publicBenchmarkStatement(i: { metricLabel: string; groupLabel: string; percentile: number }) {
  if (i.percentile < 75) return null;
  return `Top ${100 - i.percentile}% ${i.metricLabel} in ${i.groupLabel}`;
}

// Display bands for public / share contexts ("Top 5%", "Top 10%", "Top 20%", "Top 25%").
export function topBand(percentile: number) {
  if (percentile >= 95) return "Top 5%";
  if (percentile >= 90) return "Top 10%";
  if (percentile >= 80) return "Top 20%";
  if (percentile >= 75) return "Top 25%";
  return null;
}
