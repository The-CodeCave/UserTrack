import { formatCompact, formatDelta, formatPct, formatRate } from "@/lib/format";

export interface ShareSaas {
  name: string; slug: string; totalUsers: number; newUsers30d: number; growth30dPct: number; rank?: number; trendingRank?: number;
  activatedUsers?: number; activationRatePct?: number; trust: "verified" | "unverified" | "pending"; trustLabel: string;
}
export interface ShareMilestone { title: string; copy: string; kind: string; value: number; achievedAt: number }

export type ShareKind = "users" | "growth" | "rank" | "trending" | "activation" | `milestone-${string}`;

export function parseShareKind(kind: string): { kind: ShareKind; milestoneId?: string } | null {
  if (kind.startsWith("milestone-")) return { kind: kind as ShareKind, milestoneId: kind.slice("milestone-".length) };
  return ["users", "growth", "rank", "trending", "activation"].includes(kind) ? { kind: kind as ShareKind } : null;
}

// Headline / value / sub copy for every card kind. Used by the share page, its OG image and the share text.
export function shareCopy(s: ShareSaas, kind: ShareKind, m?: ShareMilestone | null) {
  if (m) return { eyebrow: "MILESTONE", value: m.title, sub: m.copy, text: `${m.copy} ${hashtag(s)}` };
  switch (kind) {
    case "growth":
      return { eyebrow: "LAST 30 DAYS", value: formatDelta(s.newUsers30d), sub: `${formatPct(s.growth30dPct)} growth · ${formatCompact(s.totalUsers)} users total`, text: `${s.name} gained ${formatDelta(s.newUsers30d)} users in the last 30 days (${formatPct(s.growth30dPct)}). ${hashtag(s)}` };
    case "rank":
      return { eyebrow: "USERTRACK LEADERBOARD", value: s.rank ? `#${s.rank}` : "Unranked", sub: `${formatDelta(s.newUsers30d)} verified new users in 30 days`, text: `${s.name} is #${s.rank} on the UserTrack leaderboard by verified new users. ${hashtag(s)}` };
    case "trending":
      return { eyebrow: "TRENDING NOW", value: s.trendingRank ? `#${s.trendingRank}` : "—", sub: `${formatDelta(s.newUsers30d)} new users · momentum, not size`, text: `${s.name} is #${s.trendingRank} trending on UserTrack right now. ${hashtag(s)}` };
    case "activation":
      return { eyebrow: "ACTIVATION", value: formatRate(s.activationRatePct), sub: `${formatCompact(s.activatedUsers ?? 0)} of ${formatCompact(s.totalUsers)} users activated`, text: `${formatRate(s.activationRatePct)} of ${s.name} users activate. ${hashtag(s)}` };
    default:
      return { eyebrow: "TOTAL USERS", value: formatCompact(s.totalUsers), sub: `${formatDelta(s.newUsers30d)} in the last 30 days`, text: `${s.name} just hit ${formatCompact(s.totalUsers)} users. ${hashtag(s)}` };
  }
}

const hashtag = (s: ShareSaas) => (s.trust === "verified" ? "Verified on UserTrack." : "Tracked on UserTrack.");
