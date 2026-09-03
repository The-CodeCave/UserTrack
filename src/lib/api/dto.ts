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
  trialUsers?: number;
  convertedUsers?: number;
  newConverted7d?: number;
  newConverted30d?: number;
  convertedGrowth30dPct?: number;
  signupToConvertedPct?: number;
  activatedToConvertedPct?: number;
  trialToConvertedPct?: number;
  identityQuality?: "aggregate_only" | "partially_mapped" | "cohort_verified";
  projectType?: "web" | "mobile" | "hybrid";
  appStoreUrl?: string;
  playStoreUrl?: string;
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
    projectType: r.projectType,
    stores: r.appStoreUrl || r.playStoreUrl ? { appStore: r.appStoreUrl, googlePlay: r.playStoreUrl } : undefined,
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
      conversion: conversionMetrics(r),
      // Deprecated alias kept for v1 clients; amounts are never exposed.
      revenue: r.convertedUsers === undefined ? undefined : { payingUsers: r.convertedUsers },
    },
    identityQuality: r.identityQuality,
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

export function profileDto(p: { username: string; displayName: string; avatarUrl?: string; bio?: string; website?: string; x?: string; xConnected?: boolean; github?: string; linkedin?: string; location?: string; followerCount: number; joinedAt?: number }) {
  return {
    username: p.username,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    bio: p.bio,
    location: p.location,
    links: { website: p.website, x: p.x, github: p.github, linkedin: p.linkedin },
    // "connected" = the founder linked the X account through OAuth; "handle_provided" = typed in, unverified.
    xState: p.x ? (p.xConnected ? "connected_via_oauth" : "handle_provided") : "unavailable",
    followers: p.followerCount,
    joinedAt: iso(p.joinedAt),
    urls: { profile: `${SITE_URL}/u/${p.username}`, card: `${SITE_URL}/u/${p.username}/card`, history: `${SITE_URL}/api/v1/users/${p.username}/history` },
  };
}

// Founder aggregates over public projects only. Activation is weighted (sum activated / sum users with an activation source).
export function founderMetricsDto(a: { projectCount: number; verifiedCount: number; totalUsers: number; newUsers7d: number; newUsers30d: number; growth30dPct: number; changeVsPrev30dPct?: number; activatedUsers?: number; activationRatePct?: number; activationProjects: number; convertedUsers?: number; bestRank?: number; trendingCount: number; biggestGrowth?: { slug: string; name: string; newUsers30d: number } }) {
  return {
    projects: a.projectCount,
    verifiedProjects: a.verifiedCount,
    totalUsers: a.totalUsers,
    newUsers7d: a.newUsers7d,
    newUsers30d: a.newUsers30d,
    growth30dPct: a.growth30dPct,
    changeVsPrev30dPct: a.changeVsPrev30dPct,
    activation: a.activationRatePct === undefined ? undefined : { activatedUsers: a.activatedUsers, ratePct: a.activationRatePct, projects: a.activationProjects, method: "weighted" as const },
    convertedUsers: a.convertedUsers,
    bestRank: a.bestRank,
    trendingProjects: a.trendingCount,
    biggestGrowth: a.biggestGrowth,
  };
}

// Conversion group: only present when the owner published a conversion rate or count (visibility gating happens server-side).
function conversionMetrics(r: SaasRow) {
  if (r.signupToConvertedPct === undefined && r.convertedUsers === undefined && r.trialToConvertedPct === undefined) return undefined;
  return {
    convertedUsers: r.convertedUsers,
    newConverted7d: r.newConverted7d,
    newConverted30d: r.newConverted30d,
    convertedGrowth30dPct: r.convertedGrowth30dPct,
    trialUsers: r.trialUsers,
    signupToConvertedPct: r.signupToConvertedPct,
    activatedToConvertedPct: r.activatedToConvertedPct,
    trialToConvertedPct: r.trialToConvertedPct,
  };
}

export function conversionDto(r: SaasRow) {
  const c = conversionMetrics(r);
  return { slug: r.slug, name: r.name, verification: r.trust, basis: "aggregate" as const, identityQuality: r.identityQuality ?? "aggregate_only", conversion: c ?? null, note: c ? undefined : "The owner has not published conversion metrics.", updatedAt: iso(r.lastSyncedAt), urls: { page: `${SITE_URL}/s/${r.slug}#conversion` } };
}

export function engagementDto(r: SaasRow) {
  const e = r.activatedUsers === undefined ? null : { activatedUsers: r.activatedUsers, activated7d: r.activated7d, activated30d: r.activated30d, activationRatePct: r.activationRatePct, retention: r.retentionRatePct === undefined ? undefined : { retainedUsers: r.retainedUsers ?? 0, churnedUsers: r.churnedUsers ?? 0, ratePct: r.retentionRatePct, source: r.retentionSource ?? "estimated" } };
  return { slug: r.slug, name: r.name, verification: r.trust, engagement: e, note: e ? undefined : "No activation source connected, or the owner has not published the activation rate.", updatedAt: iso(r.lastSyncedAt), urls: { page: `${SITE_URL}/s/${r.slug}#engagement` } };
}

type FunnelSourceIn = { provider: string; label: string; verification: string; updatedAt?: number; status?: string; trial?: boolean; identity?: boolean };
type FunnelIn = {
  timeframe: string; days: number; verification: string; coverageDays: number; basis?: string; identityQuality?: string;
  stages: { key: string; label: string; value: number | null; previous?: number; changePct?: number; conversionPct?: number; previousConversionPct?: number; kind: string; source?: FunnelSourceIn; updatedAt?: number; health?: string }[];
  rates?: { from: string; to: string; label: string; pct?: number; previousPct?: number; adjacent: boolean }[];
};

// Funnel: stages carry their own provenance so a mixed funnel is never presented as "verified". value is null when the owner shares the rate but not the count.
export function funnelDto(f: FunnelIn) {
  return {
    timeframe: f.timeframe,
    days: f.days,
    verification: f.verification,
    coverageDays: f.coverageDays,
    basis: f.basis ?? "aggregate",
    identityQuality: f.identityQuality ?? "aggregate_only",
    stages: f.stages.map((s) => ({
      key: s.key, label: s.label, value: s.value, previous: s.previous, changePct: s.changePct, conversionPct: s.conversionPct, previousConversionPct: s.previousConversionPct, kind: s.kind,
      verified: s.source?.verification === "verified",
      health: s.health,
      updatedAt: iso(s.updatedAt),
      source: s.source ? { provider: s.source.provider, label: s.source.label, verification: s.source.verification } : undefined,
    })),
    rates: (f.rates ?? []).map((r) => ({ from: r.from, to: r.to, label: r.label, pct: r.pct, previousPct: r.previousPct, adjacent: r.adjacent })),
  };
}

type CohortRow = { cohort: string; signedUp: number | null; activated: number | null; activationPct?: number; activatedD7Pct?: number; trial?: number | null; trialPct?: number; converted?: number | null; convertedPct?: number; convertedD30Pct?: number; trialToConvertedPct?: number; medianTimeToActivationMs?: number; medianTimeToConversionMs?: number; computedAt: number };
export function cohortsDto(slug: string, c: { identityQuality: string; label: string; explanation: string; basis: string; cohorts: CohortRow[] }) {
  return {
    slug,
    basis: c.basis,
    identityQuality: c.identityQuality,
    identityQualityLabel: c.label,
    explanation: c.explanation,
    cohorts: c.cohorts.map((r) => ({
      cohort: r.cohort, signedUp: r.signedUp, activated: r.activated, activationPct: r.activationPct, activatedD7Pct: r.activatedD7Pct,
      trial: r.trial, trialPct: r.trialPct, converted: r.converted, convertedPct: r.convertedPct, convertedD30Pct: r.convertedD30Pct, trialToConvertedPct: r.trialToConvertedPct,
      medianTimeToActivationMs: r.medianTimeToActivationMs, medianTimeToConversionMs: r.medianTimeToConversionMs, computedAt: iso(r.computedAt),
    })),
    note: c.cohorts.length ? undefined : "No cohorts yet: cohorts need pseudonymous identities from at least two connected stages.",
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
