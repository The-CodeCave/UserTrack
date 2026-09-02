import { describe, expect, it } from "vitest";
import { historyDto, milestoneDto, saasDto, type SaasRow } from "./dto";

const FORBIDDEN = ["ownerId", "trustState", "trustScore", "config", "flags", "fraudFlags", "isPublic", "showTraffic", "showRevenue", "_id", "_creationTime", "spark", "sources"];

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
  config: { apiKey: "sk_live_secret" }, flags: [{ kind: "impossible_growth" }], spark: [1, 2, 3], sources: [{ provider: "clerk" }],
  owner: { username: "jane", displayName: "Jane", _id: "profiles:123", avatarUrl: "x", bio: "hi" },
} as unknown as SaasRow;

describe("saasDto", () => {
  it("never leaks fields outside the contract", () => {
    const wire = JSON.parse(JSON.stringify(saasDto(junk)));
    const keys = keysDeep(wire);
    for (const k of FORBIDDEN) expect(keys.has(k), k).toBe(false);
    expect(Object.keys(wire).sort()).toEqual(["category", "demo", "description", "followers", "metrics", "name", "owner", "ranks", "slug", "tags", "timestamps", "trust", "urls", "websiteUrl"]);
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
    expect(d.ranks).toEqual({ leaderboard: 4, previousLeaderboard: 6, trending: 2, previousTrending: undefined, trendingScore7d: undefined });
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
    const d = saasDto({ ...base, activatedUsers: 500, activationRatePct: 4, retentionRatePct: 71.5, retainedUsers: 700, churnedUsers: 280, visitors30d: 9000, sessions30d: 12000, payingUsers: 40, mrr: 120000, currency: "usd" });
    expect(d.metrics.activated).toEqual({ total: 500, last24h: undefined, last7d: undefined, last30d: undefined, ratePct: 4 });
    expect(d.metrics.retention).toEqual({ retainedUsers: 700, churnedUsers: 280, ratePct: 71.5, source: "estimated" });
    expect(d.metrics.traffic).toEqual({ visitors30d: 9000, sessions30d: 12000, visitorsPrev30d: undefined });
    expect(d.metrics.revenue).toEqual({ payingUsers: 40, mrr: 120000, currency: "usd" });
  });
});

describe("milestoneDto / historyDto", () => {
  it("maps milestone", () => {
    expect(milestoneDto({ _id: "m1", kind: "users", title: "1K users", copy: "Hit 1,000 users", value: 1000, achievedAt: 0, saasId: "x", key: "k" } as never)).toEqual({ id: "m1", kind: "users", title: "1K users", copy: "Hit 1,000 users", value: 1000, achievedAt: "1970-01-01T00:00:00.000Z" });
  });
  it("maps history points", () => {
    expect(historyDto([{ t: 0, total: 10, delta: 2 }, { t: 86_400_000, total: 12, delta: 2, activated: 3 }])).toEqual([
      { t: "1970-01-01T00:00:00.000Z", totalUsers: 10, newUsers: 2, activatedUsers: undefined },
      { t: "1970-01-02T00:00:00.000Z", totalUsers: 12, newUsers: 2, activatedUsers: 3 },
    ]);
  });
});
