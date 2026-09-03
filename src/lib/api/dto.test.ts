import { describe, expect, it } from "vitest";
import { benchmarkHistoryDto, cohortsDto, compareDto, conversionDto, engagementDto, feedItemDto, funnelDto, historyDto, historySeriesDto, milestoneDto, rankHistoryDto, saasDto, type SaasRow } from "./dto";

const FORBIDDEN = ["ownerId", "trustState", "trustScore", "config", "flags", "fraudFlags", "isPublic", "showTraffic", "showRevenue", "_id", "_creationTime", "spark", "sources", "visibility", "secret"];

const keysDeep = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); }
  return out;
};

const base: SaasRow = {
  slug: "acme", name: "Acme", description: "Widgets", websiteUrl: "https://acme.dev", tags: ["b2b"], category: "ai",
  trust: "verified", trustLabel: "Verified", trustScore: 87,
  totalUsers: 12481, newUsers24h: 40, newUsers7d: 300, newUsers30d: 1900, growth30dPct: 18.2, growth7dPct: 2.5,
  rank: 4, prevRank: 6, trendingRank: 2, followerCount: 12,
  owner: { username: "jane", displayName: "Jane" },
  firstSnapshotAt: Date.UTC(2026, 0, 1), lastSyncedAt: Date.UTC(2026, 8, 1),
};

// A raw-looking row with junk that must never reach the wire.
const junk = {
  ...base, _id: "j57abc", _creationTime: 1, ownerId: "profiles:123", isPublic: true, trustState: "review", showTraffic: false, showRevenue: false,
  config: { apiKey: "sk_live_secret" }, flags: [{ kind: "impossible_growth" }], spark: [1, 2, 3], sources: [{ provider: "clerk" }], visibility: { totalUsers: true }, secret: "whsec_x",
  owner: { username: "jane", displayName: "Jane", _id: "profiles:123", avatarUrl: "x", bio: "hi" },
} as unknown as SaasRow;

describe("saasDto", () => {
  it("never leaks fields outside the contract", () => {
    const wire = JSON.parse(JSON.stringify(saasDto(junk)));
    const keys = keysDeep(wire);
    for (const k of FORBIDDEN) expect(keys.has(k), k).toBe(false);
    expect(Object.keys(wire).sort()).toEqual(["category", "demo", "description", "followers", "metrics", "name", "owner", "ranks", "slug", "tags", "timestamps", "trust", "urls", "websiteUrl"]);
    expect(JSON.stringify(wire)).not.toContain("whsec_");
    expect(wire.owner).toEqual({ username: "jane", displayName: "Jane" });
    expect(JSON.stringify(wire)).not.toContain("sk_live_secret");
  });

  it("maps core fields", () => {
    const d = saasDto(base);
    expect(d.trust).toEqual({ level: "verified", label: "Verified", score: 87 });
    expect(d.metrics.totalUsers).toBe(12481);
    expect(d.metrics.activated).toBeUndefined();
    expect(d.metrics.traffic).toBeUndefined();
    expect(d.metrics.revenue).toBeUndefined();
    expect(d.metrics.retention).toBeUndefined();
    expect(d.ranks).toEqual({ leaderboard: 4, previousLeaderboard: 6, leaderboard7dAgo: undefined, leaderboardDelta7d: undefined, trending: 2, previousTrending: undefined, trending7dAgo: undefined, trendingDelta7d: undefined, bestTrending: undefined, trendingScore7d: undefined });
    expect(d.foundedAt).toBeUndefined();
    const moved = saasDto({ ...base, rank7dAgo: 9, rankDelta7d: 5, trendingRank7dAgo: 3, trendingRankDelta7d: 1, bestTrendingRank: 1, foundedAt: Date.UTC(2025, 5, 1) });
    expect(moved.ranks).toMatchObject({ leaderboard7dAgo: 9, leaderboardDelta7d: 5, trending7dAgo: 3, trendingDelta7d: 1, bestTrending: 1 });
    expect(moved.foundedAt).toBe("2025-06-01T00:00:00.000Z");
    expect(d.followers).toBe(12);
    expect(d.demo).toBe(false);
    expect(d.timestamps.firstSnapshotAt).toBe("2026-01-01T00:00:00.000Z");
    expect(d.urls.page).toMatch(/\/s\/acme$/);
    expect(d.urls.badge).toMatch(/\/api\/badge\/acme\.svg$/);
  });

  it("hides trust score unless verified", () => {
    expect(saasDto({ ...base, trust: "unverified", trustLabel: "Self-reported" }).trust.score).toBeUndefined();
    expect(saasDto({ ...base, trust: "pending", trustLabel: "Pending" }).trust.score).toBeUndefined();
  });

  it("includes optional metric groups only when present", () => {
    const d = saasDto({ ...base, activatedUsers: 500, activationRatePct: 4, retentionRatePct: 71.5, retainedUsers: 700, churnedUsers: 280, visitors30d: 9000, sessions30d: 12000, convertedUsers: 40, signupToConvertedPct: 3.1 });
    expect(d.metrics.activated).toEqual({ total: 500, last24h: undefined, last7d: undefined, last30d: undefined, ratePct: 4 });
    expect(d.metrics.retention).toEqual({ retainedUsers: 700, churnedUsers: 280, ratePct: 71.5, source: "estimated" });
    expect(d.metrics.traffic).toEqual({ visitors30d: 9000, sessions30d: 12000, visitorsPrev30d: undefined });
    expect(d.metrics.conversion).toMatchObject({ convertedUsers: 40, signupToConvertedPct: 3.1 });
    expect(d.metrics.revenue).toEqual({ payingUsers: 40 });
  });
});

describe("conversionDto / engagementDto / cohortsDto", () => {
  it("conversion is null (with note) when nothing was published", () => {
    const d = conversionDto(base);
    expect(d.conversion).toBeNull();
    expect(d.note).toMatch(/not published/);
    expect(d.identityQuality).toBe("aggregate_only");
    expect(saasDto(base).metrics.conversion).toBeUndefined();
    expect(saasDto(base).metrics.revenue).toBeUndefined();
  });
  it("rate-only publication never carries counts", () => {
    const d = conversionDto({ ...base, signupToConvertedPct: 8.7, activatedToConvertedPct: 12.4, identityQuality: "cohort_verified" });
    expect(d.conversion).toEqual({ convertedUsers: undefined, newConverted7d: undefined, newConverted30d: undefined, convertedGrowth30dPct: undefined, trialUsers: undefined, signupToConvertedPct: 8.7, activatedToConvertedPct: 12.4, trialToConvertedPct: undefined });
    expect(d.identityQuality).toBe("cohort_verified");
    expect(JSON.stringify(d)).not.toMatch(/mrr|currency|amount/);
  });
  it("published counts appear in conversion and in the deprecated revenue alias without amounts", () => {
    const d = saasDto({ ...base, convertedUsers: 447, newConverted30d: 31, signupToConvertedPct: 3.6 });
    expect(d.metrics.conversion?.convertedUsers).toBe(447);
    expect(d.metrics.revenue).toEqual({ payingUsers: 447 });
    expect(keysDeep(d).has("mrr")).toBe(false);
  });
  it("engagement is null without activation and maps retention", () => {
    expect(engagementDto(base).engagement).toBeNull();
    const d = engagementDto({ ...base, activatedUsers: 800, activationRatePct: 64.1, retentionRatePct: 71, retainedUsers: 500 });
    expect(d.engagement).toMatchObject({ activatedUsers: 800, activationRatePct: 64.1, retention: { retainedUsers: 500, churnedUsers: 0, ratePct: 71, source: "estimated" } });
  });
  it("cohorts keep nulls for hidden counts and ISO computedAt", () => {
    const d = cohortsDto("acme", { identityQuality: "cohort_verified", label: "Cohort Verified", explanation: "x", basis: "cohort", cohorts: [{ cohort: "2026-08", signedUp: null, activated: null, activationPct: 61, convertedPct: 12.7, computedAt: Date.UTC(2026, 8, 1) }] });
    expect(d.cohorts[0]).toMatchObject({ cohort: "2026-08", signedUp: null, activationPct: 61, convertedPct: 12.7, computedAt: "2026-09-01T00:00:00.000Z" });
    expect(d.note).toBeUndefined();
    expect(cohortsDto("acme", { identityQuality: "aggregate_only", label: "Aggregate", explanation: "x", basis: "cohort", cohorts: [] }).note).toMatch(/No cohorts yet/);
  });
  it("mobile store links and project type", () => {
    const d = saasDto({ ...base, projectType: "mobile", appStoreUrl: "https://apps.apple.com/app/id1" });
    expect(d.projectType).toBe("mobile");
    expect(d.stores).toEqual({ appStore: "https://apps.apple.com/app/id1", googlePlay: undefined });
    expect(saasDto(base).stores).toBeUndefined();
  });
});

describe("milestoneDto / historyDto", () => {
  it("maps milestone", () => {
    expect(milestoneDto({ _id: "m1", kind: "users", title: "1K users", copy: "Hit 1,000 users", value: 1000, achievedAt: 0, saasId: "x", key: "k" } as never)).toEqual({ id: "m1", kind: "users", title: "1K users", copy: "Hit 1,000 users", value: 1000, achievedAt: "1970-01-01T00:00:00.000Z" });
  });
  it("maps history points", () => {
    expect(historyDto([{ t: 0, total: 10, delta: 2 }, { t: 86_400_000, total: 12, delta: 2, activated: 3, visitors: 40, converted: 1 }])).toEqual([
      { t: "1970-01-01T00:00:00.000Z", totalUsers: 10, newUsers: 2, activatedUsers: undefined, visitors: undefined, convertedUsers: undefined },
      { t: "1970-01-02T00:00:00.000Z", totalUsers: 12, newUsers: 2, activatedUsers: 3, visitors: 40, convertedUsers: 1 },
    ]);
  });
  it("maps the storage-aware series with resolution and ISO gaps", () => {
    const d = historySeriesDto({ range: "1y", resolution: "week", points: [{ t: 0, total: 1, delta: 1 }], gaps: [{ from: 0, to: 86_400_000 * 20, days: 20 }] });
    expect(d).toEqual({ range: "1y", resolution: "week", points: [{ t: "1970-01-01T00:00:00.000Z", totalUsers: 1, newUsers: 1, activatedUsers: undefined, visitors: undefined, convertedUsers: undefined }], gaps: [{ from: "1970-01-01T00:00:00.000Z", to: "1970-01-21T00:00:00.000Z", days: 20 }] });
  });
  it("maps rank and benchmark history without internals", () => {
    const r = rankHistoryDto({ slug: "acme", kind: "leaderboard", window: "30d", current: 4, best: 3, rank7dAgo: 9, movement7d: { kind: "up", delta: 5 }, points: [{ day: "2026-09-01", rank: 5, score: undefined, at: 1 } as never] });
    expect(r.points).toEqual([{ day: "2026-09-01", rank: 5, score: undefined }]);
    expect(r.movement7d).toEqual({ kind: "up", delta: 5 });
    const b = benchmarkHistoryDto({ slug: "acme", weeks: [{ week: "2026-W36", day: "2026-09-01", computedAt: 0, standings: [{ cohort: "all", metric: "growth30dPct", metricLabel: "30-day growth", percentile: 85, band: "Top 15%", sampleSize: 12, value: 99, median: 3 } as never] }] });
    expect(b.weeks[0].computedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(b.weeks[0].standings[0]).toEqual({ cohort: "all", metric: "growth30dPct", metricLabel: "30-day growth", percentile: 85, band: "Top 15%", sampleSize: 12 });
    expect(keysDeep(b).has("value")).toBe(false);
  });
});

describe("funnelDto / feedItemDto / compareDto", () => {
  it("keeps per-stage provenance", () => {
    const d = funnelDto({
      timeframe: "30d", days: 30, verification: "partially_verified", coverageDays: 30,
      stages: [
        { key: "signed_up", label: "Signed up", value: 100, kind: "flow", source: { provider: "clerk", label: "Clerk", verification: "verified", secret: "x" } as never, health: "healthy", updatedAt: Date.UTC(2026, 8, 1) },
        { key: "activated", label: "Activated", value: 40, conversionPct: 40, kind: "flow" },
        { key: "converted", label: "Converted", value: null, conversionPct: 12.5, kind: "stock", source: { provider: "stripe", label: "Stripe", verification: "verified" } },
      ],
      rates: [{ from: "signed_up", to: "converted", label: "Signup → Converted", pct: 5, adjacent: false }],
      identityQuality: "partially_mapped",
    });
    expect(d.stages[0].source).toEqual({ provider: "clerk", label: "Clerk", verification: "verified" });
    expect(d.stages[0].verified).toBe(true);
    expect(d.stages[0].updatedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(d.stages[1].source).toBeUndefined();
    expect(d.stages[1].verified).toBe(false);
    expect(d.stages[2].value).toBeNull();
    expect(d.rates).toEqual([{ from: "signed_up", to: "converted", label: "Signup → Converted", pct: 5, previousPct: undefined, adjacent: false }]);
    expect(d.basis).toBe("aggregate");
    expect(d.identityQuality).toBe("partially_mapped");
    expect(d.verification).toBe("partially_verified");
  });
  it("defaults basis / identityQuality for legacy funnel objects", () => {
    const d = funnelDto({ timeframe: "7d", days: 7, verification: "none", coverageDays: 0, stages: [] });
    expect(d).toMatchObject({ basis: "aggregate", identityQuality: "aggregate_only", rates: [] });
  });
  it("feed item emits ISO time and share URLs", () => {
    const item = { id: "f1", kind: "milestone", subkind: "users", at: Date.UTC(2026, 0, 2), title: "1K users", detail: "Hit 1,000", saas: { slug: "acme", name: "Acme", totalUsers: 1000, trust: "verified" as const, trustLabel: "Verified" } };
    const d = feedItemDto({ ...item, share: "milestone-m1" });
    expect(d.at).toBe("2026-01-02T00:00:00.000Z");
    expect(d.urls.page).toMatch(/\/s\/acme$/);
    expect(d.urls.share).toMatch(/\/s\/acme\/milestone-m1$/);
    expect(d.saas.trust).toEqual({ level: "verified", label: "Verified" });
    expect(feedItemDto(item).urls.share).toBeUndefined();
  });
  it("compare indexes to 100 at the first non-zero day", () => {
    const series = [{ day: "2026-01-01", total: 0, delta: 0 }, { day: "2026-01-02", total: 50, delta: 50 }, { day: "2026-01-03", total: 75, delta: 25 }];
    const d = compareDto([{ ...base, series }, { ...base, slug: "beta", series: series.map((p) => ({ ...p, total: 0 })) }], 0);
    expect(d.days).toBe("all");
    expect(d.products[0].series.map((p) => p.index)).toEqual([0, 100, 150]);
    expect(d.products[1].series.map((p) => p.index)).toEqual([undefined, undefined, undefined]);
    expect(d.urls.page).toMatch(/\/compare\?s=acme,beta&days=all$/);
    expect(compareDto([{ ...base, series }], 30)).toMatchObject({ days: 30, urls: { page: expect.stringMatching(/&days=30$/) } });
  });
});
