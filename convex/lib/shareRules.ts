// Which achievements become share-ready cards, and how they rank. Pure and unit-tested; the Share Center, emails,
// MCP and the auto-post job all read the same floors so nothing minor ever becomes a card.
export const SHARE_CATEGORIES = ["userMilestones", "leaderboardMilestones", "growthRecords", "monthlyGrowth", "activationBenchmarks"] as const;
export type ShareCategory = (typeof SHARE_CATEGORIES)[number];

export const SHARE_CATEGORY_META: Record<ShareCategory, { label: string; hint: string }> = {
  userMilestones: { label: "User milestones", hint: "100 · 500 · 1K · 5K · 10K … 1M users (and activated / converted thresholds)." },
  leaderboardMilestones: { label: "Leaderboard milestones", hint: "Entering the Top 100 / Top 10, a new best rank, Top 10 trending." },
  growthRecords: { label: "Growth records", hint: "Biggest day or week ever, 30-day growth streaks, 3× signup spikes." },
  monthlyGrowth: { label: "Monthly growth", hint: "+25% / +50% / +100% in 30 days — at most once per threshold." },
  activationBenchmarks: { label: "Benchmarks", hint: "Top 10% of a cohort for growth or activation — at most once per metric per month." },
};

// Floors below which a milestone is recorded but not pushed into the Share Center.
export const SHARE_FLOORS = { users: 100, activated: 1_000, converted: 100, best_day: 100, best_week: 100, streak: 30, monthly_growth: 25 } as const;
export const SPIKE_SHARE_MULTIPLE = 3;
export const BENCHMARK_SHARE_PERCENTILE = 90;
export const BENCHMARK_SHARE_METRICS = ["growth30dPct", "activationRatePct"] as const;

export interface MilestoneLike { kind: string; value: number }

export function shareCategoryFor(m: MilestoneLike): ShareCategory | null {
  switch (m.kind) {
    case "users": return m.value >= SHARE_FLOORS.users ? "userMilestones" : null;
    case "activated": return m.value >= SHARE_FLOORS.activated ? "userMilestones" : null;
    case "converted": return m.value >= SHARE_FLOORS.converted ? "userMilestones" : null;
    case "rank": case "top10": case "top100": case "trending_top10": return "leaderboardMilestones";
    case "best_day": return m.value >= SHARE_FLOORS.best_day ? "growthRecords" : null;
    case "best_week": return m.value >= SHARE_FLOORS.best_week ? "growthRecords" : null;
    case "streak": return m.value >= SHARE_FLOORS.streak ? "growthRecords" : null;
    case "monthly_growth": return m.value >= SHARE_FLOORS.monthly_growth ? "monthlyGrowth" : null;
    case "spike": return m.value >= SPIKE_SHARE_MULTIPLE ? "growthRecords" : null;
    case "benchmark": return m.value >= BENCHMARK_SHARE_PERCENTILE ? "activationBenchmarks" : null;
    default: return null;
  }
}

// Priority 0–100 used to order the Share Center and to pick "the strongest milestone this month" for agents.
export function shareScore(m: MilestoneLike): number {
  const log = Math.log10(Math.max(1, m.value));
  switch (m.kind) {
    case "rank": return Math.min(100, 96 - (m.value - 1) * 2);
    case "top10": return 90;
    case "users": return Math.min(100, 40 + log * 10);
    case "trending_top10": return 70;
    case "monthly_growth": return Math.min(85, 50 + m.value / 4);
    case "benchmark": return 60;
    case "best_week": return 55;
    case "converted": return Math.min(80, 45 + log * 8);
    case "best_day": return 45;
    case "top100": return 45;
    case "activated": return Math.min(75, 40 + log * 8);
    case "spike": return 40;
    case "streak": return 35;
    default: return 20;
  }
}

// One benchmark card per metric per calendar month, however often the percentile is recomputed.
export const benchmarkShareKey = (metric: string, now: number) => `bench:${metric}:${new Date(now).toISOString().slice(0, 7)}`;

// The UserTrack-owned account only ever posts the big ones, and only for verified data.
export function botWorthy(m: MilestoneLike & { verified: boolean }) {
  if (!m.verified) return false;
  if (m.kind === "users") return m.value >= 1_000;
  if (m.kind === "rank") return m.value <= 3;
  return m.kind === "top10";
}

export interface SocialPrefsLike { allowTagging?: boolean; allowPromotion?: boolean; autoShare?: Partial<Record<ShareCategory, boolean>> }

// Tagging / promotion are opt-out, every auto-share category is opt-in.
export function normalizePrefs(p: SocialPrefsLike | undefined) {
  return {
    allowTagging: p?.allowTagging !== false,
    allowPromotion: p?.allowPromotion !== false,
    autoShare: Object.fromEntries(SHARE_CATEGORIES.map((c) => [c, p?.autoShare?.[c] === true])) as Record<ShareCategory, boolean>,
  };
}
