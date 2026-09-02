/**
 * UserTrack Trending Score.
 *
 * score = 100 · volume · growth · acceleration · trust · activation
 *
 *   volume       = log10(1 + newUsers)^1.5                    — absolute traction, log-dampened but still the dominant term
 *   growth       = 1 + min(newUsers / max(base, 50), 2)       — relative growth; a 50-user floor stops 1→5 products dominating
 *   acceleration = 1 + 0.5 · clamp((new − prev) / max(prev, 10), −0.5, 2)  — this window vs the previous one
 *   trust        = 0.5 + 0.5 · trustScore/100                 — low-confidence sources are discounted, never boosted
 *   activation   = 1 + 0.25 · activationRate                  — optional; products whose users actually activate get a small lift
 *
 * Products with < 5 new users in the window score 0 ("no signal").
 */
export interface TrendingInput {
  newUsers: number;
  prevNewUsers: number;
  baseUsers: number;
  trustScore?: number;
  activationRatePct?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function trendingScore(i: TrendingInput) {
  const newUsers = Math.max(0, i.newUsers);
  if (newUsers < 5) return 0;
  const volume = Math.pow(Math.log10(1 + newUsers), 1.5);
  const growth = 1 + Math.min(newUsers / Math.max(i.baseUsers, 50), 2);
  const accel = 1 + 0.5 * clamp((newUsers - Math.max(0, i.prevNewUsers)) / Math.max(i.prevNewUsers, 10), -0.5, 2);
  const trust = 0.5 + 0.5 * clamp(i.trustScore ?? 60, 0, 100) / 100;
  const activation = i.activationRatePct === undefined ? 1 : 1 + 0.25 * clamp(i.activationRatePct, 0, 100) / 100;
  return Math.round(100 * volume * growth * accel * trust * activation * 10) / 10;
}

export function explainTrending(i: TrendingInput) {
  const parts: string[] = [];
  if (i.prevNewUsers > 0) parts.push(`${(i.newUsers / i.prevNewUsers).toFixed(1)}× prev period`);
  else if (i.newUsers > 0) parts.push("first growth in window");
  if (i.baseUsers > 0) parts.push(`+${Math.round((i.newUsers / Math.max(i.baseUsers, 1)) * 100)}% relative`);
  if (i.activationRatePct !== undefined) parts.push(`${i.activationRatePct.toFixed(0)}% activate`);
  return parts.join(" · ");
}
