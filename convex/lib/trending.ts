/**
 * UserTrack Trending Score v2.
 *
 * score = 100 · volume · growth · acceleration · trust · activation · conversion · freshness · history
 *
 *   volume       = log10(1 + newUsers)^1.5                    — absolute traction, log-dampened but still the dominant term
 *   growth       = 1 + min(newUsers / max(base, 50), 2)       — relative growth; a 50-user floor stops 1→5 products dominating, capped at 3×
 *   acceleration = 1 + 0.5 · clamp((new − prev) / max(prev, 10), −0.5, 2)  — this window vs the previous one (0.75× … 2×)
 *   trust        = 0.5 + 0.5 · trustScore/100                 — low-confidence sources are discounted, never boosted
 *   activation   = 1 + 0.25 · activationRate                  — optional; products whose users actually activate get a small lift
 *   conversion   = 1 + 0.10 · clamp(signupToConverted, 0, 25)/25 — optional, max 1.10; conversion is a supporting signal, never the driver
 *   freshness    = 1 while the last successful sync is ≤ 24h old, linearly down to 0.5 at 72h, 0 afterwards (stale = no signal)
 *   history      = 0.6 + 0.4 · min(1, trackedDays / 14)       — full weight needs two weeks of continuous verified history
 *
 * No signal (score 0): fewer than 5 new users in the window, a stale source (> 72h without a sync) or data under review.
 * Every factor is returned by `trendingFactors` so the UI and API can explain a rank instead of showing a magic number.
 */
export interface TrendingInput {
  newUsers: number;
  prevNewUsers: number;
  baseUsers: number;
  trustScore?: number;
  activationRatePct?: number;
  signupToConvertedPct?: number;
  lastSyncedAt?: number;
  firstSnapshotAt?: number;
  underReview?: boolean;
  now?: number;
}

export const TRENDING_MIN_NEW_USERS = 5;
export const TRENDING_FRESH_MS = 24 * 3_600_000;
export const TRENDING_STALE_MS = 72 * 3_600_000;
export const TRENDING_FULL_HISTORY_DAYS = 14;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function trendingFactors(i: TrendingInput) {
  const now = i.now ?? Date.now();
  const newUsers = Math.max(0, i.newUsers);
  const age = i.lastSyncedAt === undefined ? 0 : Math.max(0, now - i.lastSyncedAt);
  const freshness = age <= TRENDING_FRESH_MS ? 1 : age >= TRENDING_STALE_MS ? 0 : 1 - 0.5 * ((age - TRENDING_FRESH_MS) / (TRENDING_STALE_MS - TRENDING_FRESH_MS));
  const trackedDays = i.firstSnapshotAt === undefined ? TRENDING_FULL_HISTORY_DAYS : Math.max(0, now - i.firstSnapshotAt) / 86_400_000;
  return {
    volume: Math.pow(Math.log10(1 + newUsers), 1.5),
    growth: 1 + Math.min(newUsers / Math.max(i.baseUsers, 50), 2),
    acceleration: 1 + 0.5 * clamp((newUsers - Math.max(0, i.prevNewUsers)) / Math.max(i.prevNewUsers, 10), -0.5, 2),
    trust: 0.5 + (0.5 * clamp(i.trustScore ?? 60, 0, 100)) / 100,
    activation: i.activationRatePct === undefined ? 1 : 1 + (0.25 * clamp(i.activationRatePct, 0, 100)) / 100,
    conversion: i.signupToConvertedPct === undefined ? 1 : 1 + (0.1 * clamp(i.signupToConvertedPct, 0, 25)) / 25,
    freshness,
    history: 0.6 + 0.4 * Math.min(1, trackedDays / TRENDING_FULL_HISTORY_DAYS),
    signal: newUsers >= TRENDING_MIN_NEW_USERS && freshness > 0 && !i.underReview,
  };
}

export function trendingScore(i: TrendingInput) {
  const f = trendingFactors(i);
  if (!f.signal) return 0;
  return Math.round(100 * f.volume * f.growth * f.acceleration * f.trust * f.activation * f.conversion * f.freshness * f.history * 10) / 10;
}

// Short human explanation for cards ("2.1× prev period · +12% relative · 61% activate · 6% convert").
export function explainTrending(i: TrendingInput) {
  const parts: string[] = [];
  if (i.prevNewUsers > 0) parts.push(`${(i.newUsers / i.prevNewUsers).toFixed(1)}× prev period`);
  else if (i.newUsers > 0) parts.push("first growth in window");
  if (i.baseUsers > 0) parts.push(`+${Math.round((i.newUsers / Math.max(i.baseUsers, 1)) * 100)}% relative`);
  if (i.activationRatePct !== undefined) parts.push(`${i.activationRatePct.toFixed(0)}% activate`);
  if (i.signupToConvertedPct !== undefined) parts.push(`${i.signupToConvertedPct.toFixed(0)}% convert`);
  const f = trendingFactors(i);
  if (f.freshness === 0) parts.push("stale source");
  else if (f.history < 1) parts.push("short history");
  return parts.join(" · ");
}
