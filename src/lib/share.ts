import { formatCompact, formatDelta, formatPct, formatRate } from "@/lib/format";

export interface ShareSaas {
  name: string; slug: string; totalUsers: number; newUsers7d: number; newUsers30d: number; growth7dPct?: number; growth30dPct: number; rank?: number; trendingRank?: number;
  activatedUsers?: number; activationRatePct?: number; signupToConvertedPct?: number; trust: "verified" | "unverified" | "pending"; trustLabel: string;
}
// A stored achievement (milestone or growth spike) rendered as its own card.
export interface ShareEvent { title: string; copy: string; kind: string; value?: number; achievedAt: number; eyebrow?: string }

export type ShareKind = "users" | "growth" | "week" | "rank" | "trending" | "activation" | "conversion" | "benchmark" | `milestone-${string}` | `spike-${string}`;
export const SHARE_KINDS = ["users", "growth", "week", "rank", "trending", "activation", "conversion", "benchmark"] as const;
// Kinds whose headline is a time series, where the studio offers a range picker.
export const GRAPH_KINDS: ReadonlySet<string> = new Set(["users", "growth", "week"]);
export type ShareSize = "og" | "square";
export const SHARE_SIZES: Record<ShareSize, { width: number; height: number }> = { og: { width: 1200, height: 630 }, square: { width: 1080, height: 1080 } };

export function parseShareKind(kind: string): { kind: ShareKind; milestoneId?: string; eventId?: string } | null {
  if (kind.startsWith("milestone-")) return { kind: kind as ShareKind, milestoneId: kind.slice("milestone-".length) };
  if (kind.startsWith("spike-")) return { kind: kind as ShareKind, eventId: kind.slice("spike-".length) };
  return (SHARE_KINDS as readonly string[]).includes(kind) ? { kind: kind as ShareKind } : null;
}

export const parseShareSize = (v: string | null | undefined): ShareSize => (v === "square" ? "square" : "og");

// Headline / value / sub copy for every card kind. Used by the share page, its OG image and the share text.
export function shareCopy(s: ShareSaas, kind: ShareKind, m?: ShareEvent | null) {
  if (m) return { eyebrow: m.eyebrow ?? (kind.startsWith("spike-") ? "GROWTH SPIKE" : kind === "benchmark" ? "BENCHMARK" : "MILESTONE"), value: m.title, sub: m.copy, text: `${m.copy} ${hashtag(s)}` };
  switch (kind) {
    case "growth":
      return { eyebrow: "LAST 30 DAYS", value: formatDelta(s.newUsers30d), sub: `${formatPct(s.growth30dPct)} growth · ${formatCompact(s.totalUsers)} users total`, text: `${s.name} gained ${formatDelta(s.newUsers30d)} users in the last 30 days (${formatPct(s.growth30dPct)}). ${hashtag(s)}` };
    case "week":
      return { eyebrow: "LAST 7 DAYS", value: formatDelta(s.newUsers7d), sub: `${formatPct(s.growth7dPct ?? 0)} this week · ${formatCompact(s.totalUsers)} users total`, text: `${s.name} gained ${formatDelta(s.newUsers7d)} users this week (${formatPct(s.growth7dPct ?? 0)}). ${hashtag(s)}` };
    case "rank":
      return { eyebrow: "USERTRACK LEADERBOARD", value: s.rank ? `#${s.rank}` : "Unranked", sub: `${formatDelta(s.newUsers30d)} verified new users in 30 days`, text: `${s.name} is #${s.rank} on the UserTrack leaderboard by verified new users. ${hashtag(s)}` };
    case "trending":
      return { eyebrow: "TRENDING NOW", value: s.trendingRank ? `#${s.trendingRank}` : "—", sub: `${formatDelta(s.newUsers7d)} new users this week · momentum, not size`, text: `${s.name} is #${s.trendingRank} trending on UserTrack right now. ${hashtag(s)}` };
    case "activation":
      return { eyebrow: "ACTIVATION", value: formatRate(s.activationRatePct), sub: `${formatCompact(s.activatedUsers ?? 0)} of ${formatCompact(s.totalUsers)} users activated`, text: `${formatRate(s.activationRatePct)} of ${s.name} users activate. ${hashtag(s)}` };
    case "benchmark":
      return { eyebrow: "BENCHMARK", value: "Top quarter", sub: "Compared with verified products on UserTrack", text: `${s.name} ranks in the top quarter of verified products on UserTrack. ${hashtag(s)}` };
    case "conversion":
      return { eyebrow: "CONVERSION", value: formatRate(s.signupToConvertedPct), sub: "Signup → Converted · users who convert, never revenue", text: `${formatRate(s.signupToConvertedPct)} of ${s.name} signups convert. ${hashtag(s)}` };
    default:
      return { eyebrow: "TOTAL USERS", value: formatCompact(s.totalUsers), sub: `${formatDelta(s.newUsers30d)} in the last 30 days`, text: `${s.name} just hit ${formatCompact(s.totalUsers)} users. ${hashtag(s)}` };
  }
}

// The cards a product can share right now (only kinds backed by real data).
export function availableShareKinds(s: ShareSaas): { kind: ShareKind; label: string }[] {
  return [
    { kind: "users" as ShareKind, label: `${formatCompact(s.totalUsers)} users` },
    { kind: "growth" as ShareKind, label: `${formatDelta(s.newUsers30d)} in 30d` },
    { kind: "week" as ShareKind, label: `${formatDelta(s.newUsers7d)} this week` },
    ...(s.rank ? [{ kind: "rank" as ShareKind, label: `#${s.rank} on UserTrack` }] : []),
    ...(s.trendingRank ? [{ kind: "trending" as ShareKind, label: `#${s.trendingRank} trending` }] : []),
    ...(s.activationRatePct !== undefined ? [{ kind: "activation" as ShareKind, label: `${formatRate(s.activationRatePct)} activation` }] : []),
    // Only present on the public object when the founder published conversion rates.
    ...(s.signupToConvertedPct !== undefined ? [{ kind: "conversion" as ShareKind, label: `${formatRate(s.signupToConvertedPct)} signup → converted` }] : []),
  ];
}

const hashtag = (s: ShareSaas) => (s.trust === "verified" ? "Verified on UserTrack." : "Tracked on UserTrack.");
