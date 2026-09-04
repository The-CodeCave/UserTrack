// One definition per public board: which products it lists, what it sorts by, and which `saas` index carries
// that sort order. Boards are read through the index (convex/public.ts → scanBoard) so a page render walks a
// few hundred documents instead of the whole public set; `sortBoard` keeps the in-memory form for the jobs
// that already hold every row (daily ranking snapshots, gateway datasets).
import type { Doc } from "../_generated/dataModel";
import { SIZE_BUCKETS, sizeBucket } from "./metrics";
import { visibilityOf } from "../domain/visibility";
import { DAY } from "./time";

export const BOARDS = ["trending", "fastest", "most-users", "most-new", "most-activated", "activation-rate", "new-rising", "hidden-gems", "movers", "best-conversion", "best-trial-conversion", "converted-growth"] as const;
export type Board = (typeof BOARDS)[number];
export type BoardWindow = "24h" | "7d" | "30d";
export const PLATFORMS = ["web", "mobile", "hybrid"] as const;
export const platformOf = (s: Pick<Doc<"saas">, "projectType">) => s.projectType ?? "web";
// New & rising: listed within the last 30 days (first stored snapshot, backfills included), ranked by 7-day new users.
export const NEW_RISING_RULES = { maxAgeDays: 30, minNew7d: 5 } as const;
// Hidden gems: small products with unusually strong, trustworthy traction. The criteria are public so the list is explainable.
export const HIDDEN_GEM_RULES = { maxUsers: 1000, minNew7d: 10, minGrowth7dPct: 10, minHistoryDays: 7, minTrustScore: 60 } as const;

export const isVerified = (s: Doc<"saas">) => s.trust === "verified" && s.trustState !== "review";

export interface BoardFilters { board: Board; window: BoardWindow; verifiedOnly: boolean; category?: string; size?: string; platform?: string; stack?: string; limit: number }

const newIn = (s: Doc<"saas">, w: BoardWindow) => (w === "24h" ? s.newUsers24h : w === "7d" ? s.newUsers7d : s.newUsers30d);
// 24h growth is materialized on the row (growth24hPct) but recomputed here so a row synced before the field existed still sorts right.
export const growth24h = (s: Pick<Doc<"saas">, "totalUsers" | "newUsers24h">) => (s.totalUsers - s.newUsers24h > 0 ? (s.newUsers24h / (s.totalUsers - s.newUsers24h)) * 100 : 0);
const growthIn = (s: Doc<"saas">, w: BoardWindow) => (w === "30d" ? s.growth30dPct : w === "7d" ? (s.growth7dPct ?? 0) : growth24h(s));
const trendingIn = (s: Doc<"saas">, w: BoardWindow) => (w === "24h" ? s.trendingScore24h : w === "7d" ? s.trendingScore7d : s.trendingScore30d) ?? 0;
const activatedIn = (s: Doc<"saas">, w: BoardWindow) => (w === "24h" ? s.activated24h : w === "7d" ? s.activated7d : s.activated30d);

const isHiddenGem = (s: Doc<"saas">, now: number) =>
  isVerified(s) && !s.isDemo && s.totalUsers < HIDDEN_GEM_RULES.maxUsers && s.newUsers7d >= HIDDEN_GEM_RULES.minNew7d && (s.growth7dPct ?? 0) >= HIDDEN_GEM_RULES.minGrowth7dPct &&
  s.firstSnapshotAt !== undefined && now - s.firstSnapshotAt >= HIDDEN_GEM_RULES.minHistoryDays * DAY && (s.trustScore ?? 0) >= HIDDEN_GEM_RULES.minTrustScore;

interface Rule {
  include?: (s: Doc<"saas">, w: BoardWindow, now: number) => boolean;
  score: (s: Doc<"saas">, w: BoardWindow) => number;
  // Only for boards whose tiebreak is not "30-day new users, then total users".
  compare?: (a: Doc<"saas">, b: Doc<"saas">) => number;
  // `saas` index whose descending order equals the board order, plus the raw indexed value (undefined = unset).
  index?: (w: BoardWindow) => { name: BoardIndex; key: (s: Doc<"saas">) => number | undefined };
}

export type BoardIndex =
  | "by_public_trending24h" | "by_public_trending7d" | "by_public_trending30d"
  | "by_public_growth24h" | "by_public_growth7d" | "by_public_growth30d"
  | "by_public_total" | "by_public_new24h" | "by_public_new7d" | "by_public_new30d"
  | "by_public_activation_rate" | "by_public_rank_delta7d"
  | "by_public_signup_conv" | "by_public_trial_conv" | "by_public_converted_growth";

const perWindow = <T,>(a: T, b: T, c: T) => (w: BoardWindow) => (w === "24h" ? a : w === "7d" ? b : c);

export const BOARD_RULES: Record<Board, Rule> = {
  trending: {
    include: (s, w) => trendingIn(s, w) > 0,
    score: trendingIn,
    index: perWindow(
      { name: "by_public_trending24h" as const, key: (s: Doc<"saas">) => s.trendingScore24h },
      { name: "by_public_trending7d" as const, key: (s: Doc<"saas">) => s.trendingScore7d },
      { name: "by_public_trending30d" as const, key: (s: Doc<"saas">) => s.trendingScore30d },
    ),
  },
  fastest: {
    include: (s, w) => newIn(s, w) >= 10,
    score: growthIn,
    index: perWindow(
      { name: "by_public_growth24h" as const, key: (s: Doc<"saas">) => s.growth24hPct },
      { name: "by_public_growth7d" as const, key: (s: Doc<"saas">) => s.growth7dPct },
      { name: "by_public_growth30d" as const, key: (s: Doc<"saas">) => s.growth30dPct },
    ),
  },
  "most-users": { score: (s) => s.totalUsers, index: () => ({ name: "by_public_total", key: (s) => s.totalUsers }) },
  "most-new": {
    score: newIn,
    index: perWindow(
      { name: "by_public_new24h" as const, key: (s: Doc<"saas">) => s.newUsers24h },
      { name: "by_public_new7d" as const, key: (s: Doc<"saas">) => s.newUsers7d },
      { name: "by_public_new30d" as const, key: (s: Doc<"saas">) => s.newUsers30d },
    ),
  },
  // No index: the score falls back to the all-time `activatedUsers` when a window field is missing, which no single index can order.
  "most-activated": {
    include: (s, w) => (activatedIn(s, w) ?? s.activatedUsers) !== undefined,
    score: (s, w) => activatedIn(s, w) ?? s.activatedUsers ?? 0,
  },
  "activation-rate": {
    include: (s) => s.activationRatePct !== undefined && s.totalUsers >= 50,
    score: (s) => s.activationRatePct ?? 0,
    index: () => ({ name: "by_public_activation_rate", key: (s) => s.activationRatePct }),
  },
  "new-rising": {
    include: (s, _w, now) => s.firstSnapshotAt !== undefined && now - s.firstSnapshotAt <= NEW_RISING_RULES.maxAgeDays * DAY && s.newUsers7d >= NEW_RISING_RULES.minNew7d,
    score: (s) => s.newUsers7d,
    index: () => ({ name: "by_public_new7d", key: (s) => s.newUsers7d }),
  },
  "hidden-gems": {
    include: (s, _w, now) => isHiddenGem(s, now),
    score: (s) => s.growth7dPct ?? 0,
    index: () => ({ name: "by_public_growth7d", key: (s) => s.growth7dPct }),
  },
  // Stored 7-day leaderboard movement (rankHistory, materialized by rerank): climbers first, biggest climb wins.
  movers: {
    include: (s) => isVerified(s) && !s.isDemo && s.rank !== undefined && (s.rankDelta7d ?? 0) > 0,
    score: (s) => s.rankDelta7d ?? 0,
    compare: (a, b) => (b.rankDelta7d ?? 0) - (a.rankDelta7d ?? 0) || (a.rank ?? 0) - (b.rank ?? 0),
    index: () => ({ name: "by_public_rank_delta7d", key: (s) => s.rankDelta7d }),
  },
  "best-conversion": {
    include: (s) => s.signupToConvertedPct !== undefined && s.totalUsers >= 50 && visibilityOf(s).conversionRate,
    score: (s) => s.signupToConvertedPct ?? 0,
    index: () => ({ name: "by_public_signup_conv", key: (s) => s.signupToConvertedPct }),
  },
  "best-trial-conversion": {
    include: (s) => s.trialToConvertedPct !== undefined && visibilityOf(s).trialConversion,
    score: (s) => s.trialToConvertedPct ?? 0,
    index: () => ({ name: "by_public_trial_conv", key: (s) => s.trialToConvertedPct }),
  },
  "converted-growth": {
    include: (s) => s.convertedGrowth30dPct !== undefined && (s.convertedUsers ?? 0) >= 10 && visibilityOf(s).conversionRate,
    score: (s) => s.convertedGrowth30dPct ?? 0,
    index: () => ({ name: "by_public_converted_growth", key: (s) => s.convertedGrowth30dPct }),
  },
};

export const SIZE_KEYS = SIZE_BUCKETS.map((b) => b.key);

// Filters that apply to every board, in the order the boards have always applied them.
export function boardPass(s: Doc<"saas">, f: BoardFilters, now: number) {
  if (f.verifiedOnly && !isVerified(s)) return false;
  if (f.size && sizeBucket(s.totalUsers) !== f.size) return false;
  if (f.category && s.category !== f.category) return false;
  if (f.platform && platformOf(s) !== f.platform) return false;
  if (f.stack && !s.techStack?.includes(f.stack)) return false;
  return BOARD_RULES[f.board].include?.(s, f.window, now) ?? true;
}

export function boardCompare(f: BoardFilters) {
  const rule = BOARD_RULES[f.board];
  if (rule.compare) return rule.compare;
  return (a: Doc<"saas">, b: Doc<"saas">) => rule.score(b, f.window) - rule.score(a, f.window) || b.newUsers30d - a.newUsers30d || b.totalUsers - a.totalUsers;
}

export const boardIndex = (f: BoardFilters) => BOARD_RULES[f.board].index?.(f.window);

// Sort + filter over an in-memory set. Ranks/trending are precomputed; everything else is a field sort.
export function sortBoard(rows: Doc<"saas">[], f: BoardFilters) {
  const now = Date.now();
  return rows.filter((s) => boardPass(s, f, now)).sort(boardCompare(f)).slice(0, f.limit);
}
