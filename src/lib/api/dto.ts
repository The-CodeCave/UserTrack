import { SITE_URL } from "@/lib/site";

type TrustLevel = "verified" | "unverified" | "pending";

// Only the fields the contract reads. Rows may carry more; nothing else is ever copied.
export interface SaasRow {
  slug: string;
  name: string;
  description: string;
  websiteUrl: string;
  logoUrl?: string;
  category?: string;
  tags: string[];
  isDemo?: boolean;
  trust: TrustLevel;
  trustLabel: string;
  trustScore?: number;
  totalUsers: number;
  newUsers24h: number;
  newUsers7d: number;
  newUsers30d: number;
  growth7dPct?: number;
  growth30dPct: number;
  activatedUsers?: number;
  activated24h?: number;
  activated7d?: number;
  activated30d?: number;
  activationRatePct?: number;
  retainedUsers?: number;
  churnedUsers?: number;
  retentionRatePct?: number;
  retentionSource?: "estimated" | "verified";
  visitors30d?: number;
  sessions30d?: number;
  visitorsPrev30d?: number;
  payingUsers?: number;
  mrr?: number;
  currency?: string;
  rank?: number;
  prevRank?: number;
  trendingRank?: number;
  prevTrendingRank?: number;
  trendingScore7d?: number;
  followerCount?: number;
  owner?: { username: string; displayName: string } | null;
  firstSnapshotAt?: number;
  lastSyncedAt?: number;
}

const iso = (ts?: number) => (ts === undefined ? undefined : new Date(ts).toISOString());

export function saasDto(r: SaasRow) {
  return {
    slug: r.slug,
    name: r.name,
    description: r.description,
    websiteUrl: r.websiteUrl,
    logoUrl: r.logoUrl,
    category: r.category,
    tags: r.tags,
    demo: r.isDemo === true,
    trust: { level: r.trust, label: r.trustLabel, score: r.trust === "verified" ? r.trustScore : undefined },
    metrics: {
      totalUsers: r.totalUsers,
      newUsers24h: r.newUsers24h,
      newUsers7d: r.newUsers7d,
      newUsers30d: r.newUsers30d,
      growth7dPct: r.growth7dPct,
      growth30dPct: r.growth30dPct,
      activated: r.activatedUsers === undefined ? undefined : { total: r.activatedUsers, last24h: r.activated24h, last7d: r.activated7d, last30d: r.activated30d, ratePct: r.activationRatePct },
      retention: r.retentionRatePct === undefined ? undefined : { retainedUsers: r.retainedUsers ?? 0, churnedUsers: r.churnedUsers ?? 0, ratePct: r.retentionRatePct, source: r.retentionSource ?? "estimated" },
      traffic: r.visitors30d === undefined ? undefined : { visitors30d: r.visitors30d, sessions30d: r.sessions30d, visitorsPrev30d: r.visitorsPrev30d },
      revenue: r.payingUsers === undefined ? undefined : { payingUsers: r.payingUsers, mrr: r.mrr, currency: r.currency },
    },
    ranks: { leaderboard: r.rank, previousLeaderboard: r.prevRank, trending: r.trendingRank, previousTrending: r.prevTrendingRank, trendingScore7d: r.trendingScore7d },
    followers: r.followerCount ?? 0,
    owner: r.owner ? { username: r.owner.username, displayName: r.owner.displayName } : undefined,
    timestamps: { firstSnapshotAt: iso(r.firstSnapshotAt), lastSyncedAt: iso(r.lastSyncedAt) },
    urls: { page: `${SITE_URL}/s/${r.slug}`, badge: `${SITE_URL}/api/badge/${r.slug}.svg` },
  };
}

export function milestoneDto(m: { _id: string; kind: string; title: string; copy: string; value: number; achievedAt: number }) {
  return { id: m._id, kind: m.kind, title: m.title, copy: m.copy, value: m.value, achievedAt: new Date(m.achievedAt).toISOString() };
}

export function historyDto(points: { t: number; total: number; delta: number; activated?: number }[]) {
  return points.map((p) => ({ t: new Date(p.t).toISOString(), totalUsers: p.total, newUsers: p.delta, activatedUsers: p.activated }));
}
