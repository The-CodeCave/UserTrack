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

// Compact metrics view: the numbers a badge, widget or newsletter needs, nothing else.
export function metricsDto(r: SaasRow) {
  return {
    slug: r.slug,
    name: r.name,
    verification: r.trust,
    metrics: {
      totalUsers: r.totalUsers,
      newUsers24h: r.newUsers24h,
      newUsers7d: r.newUsers7d,
      newUsers30d: r.newUsers30d,
      growth7dPercentage: r.growth7dPct,
      growth30dPercentage: r.growth30dPct,
      activatedUsers: r.activatedUsers,
      activationRatePercentage: r.activationRatePct,
      trendingRank: r.trendingRank,
      overallRank: r.rank,
    },
    updatedAt: iso(r.lastSyncedAt),
    urls: { page: `${SITE_URL}/s/${r.slug}`, badge: `${SITE_URL}/api/badge/${r.slug}.svg` },
  };
}

export function profileDto(p: { username: string; displayName: string; avatarUrl?: string; bio?: string; website?: string; x?: string; github?: string; linkedin?: string; followerCount: number }) {
  return {
    username: p.username,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    bio: p.bio,
    links: { website: p.website, x: p.x, github: p.github, linkedin: p.linkedin },
    followers: p.followerCount,
    urls: { profile: `${SITE_URL}/u/${p.username}` },
  };
}

// Funnel: stages carry their own provenance so a mixed funnel is never presented as "verified".
export function funnelDto(f: { timeframe: string; days: number; verification: string; coverageDays: number; stages: { key: string; label: string; value: number; previous?: number; changePct?: number; conversionPct?: number; previousConversionPct?: number; kind: string; source?: { provider: string; label: string; verification: string } }[] }) {
  return {
    timeframe: f.timeframe,
    days: f.days,
    verification: f.verification,
    coverageDays: f.coverageDays,
    stages: f.stages.map((s) => ({ key: s.key, label: s.label, value: s.value, previous: s.previous, changePct: s.changePct, conversionPct: s.conversionPct, previousConversionPct: s.previousConversionPct, kind: s.kind, source: s.source ? { provider: s.source.provider, label: s.source.label, verification: s.source.verification } : undefined })),
  };
}

export function feedItemDto(i: { id: string; kind: string; subkind: string; at: number; title: string; detail: string; value?: number; share?: string; saas: { slug: string; name: string; logoUrl?: string; category?: string; totalUsers: number; trust: TrustLevel; trustLabel: string } }) {
  return {
    id: i.id,
    kind: i.kind,
    subkind: i.subkind,
    at: new Date(i.at).toISOString(),
    title: i.title,
    detail: i.detail,
    value: i.value,
    saas: { slug: i.saas.slug, name: i.saas.name, logoUrl: i.saas.logoUrl, category: i.saas.category, totalUsers: i.saas.totalUsers, trust: { level: i.saas.trust, label: i.saas.trustLabel } },
    urls: { page: `${SITE_URL}/s/${i.saas.slug}`, share: i.share ? `${SITE_URL}/s/${i.saas.slug}/${i.share}` : undefined },
  };
}

// Compare: absolute daily totals plus an index (100 at the first day inside the window) so sizes are comparable.
export function compareDto(items: (SaasRow & { series: { day: string; total: number; delta: number; activated?: number }[] })[], days: number) {
  return {
    days: days === 0 ? "all" : days,
    products: items.map((s) => {
      const base = s.series.find((p) => p.total > 0)?.total ?? 0;
      return {
        ...saasDto(s),
        series: s.series.map((p) => ({ day: p.day, totalUsers: p.total, newUsers: p.delta, activatedUsers: p.activated, index: base > 0 ? Math.round((p.total / base) * 1000) / 10 : undefined })),
      };
    }),
    urls: { page: `${SITE_URL}/compare?s=${items.map((s) => s.slug).join(",")}${days ? `&days=${days}` : "&days=all"}` },
  };
}
