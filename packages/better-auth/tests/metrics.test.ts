import { describe, expect, it } from "vitest";
import { collectMetrics, countUsers, MetricsError, SCAN_LIMIT, type UserStore } from "../src/metrics.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);

function store(users: { createdAt: Date; isAnonymous?: boolean }[], opts: { count?: boolean } = {}): UserStore & { calls: string[] } {
  const rows = users.map((u, i) => ({ id: `u${i}`, ...u }));
  const match = (where: { field: string; operator?: string; value: unknown }[] = []) =>
    rows.filter((r) => where.every((w) => {
      const v = (r as Record<string, unknown>)[w.field];
      const t = w.value instanceof Date ? w.value.getTime() : w.value;
      const x = v instanceof Date ? v.getTime() : v;
      switch (w.operator ?? "eq") {
        case "eq": return x === t;
        case "gte": return typeof x === "number" && typeof t === "number" && x >= t;
        case "lt": return typeof x === "number" && typeof t === "number" && x < t;
        default: throw new Error(`unsupported operator ${w.operator}`);
      }
    }));
  const s: UserStore & { calls: string[] } = {
    calls: [],
    findMany: async ({ where, limit = Infinity, offset = 0, select }) => {
      s.calls.push("findMany");
      return match(where).slice(offset, offset + limit).map((r) => (select ? Object.fromEntries(select.map((k) => [k, (r as Record<string, unknown>)[k]])) : r)) as never;
    },
  };
  if (opts.count !== false) s.count = async ({ where }) => { s.calls.push("count"); return match(where).length; };
  return s;
}

describe("collectMetrics", () => {
  const users = [
    { createdAt: new Date(NOW - 2 * 3600_000) },
    { createdAt: new Date(NOW - 3 * DAY) },
    { createdAt: new Date(NOW - 10 * DAY) },
    { createdAt: new Date(NOW - 45 * DAY) },
  ];
  it("counts total users and 24h/7d/30d windows", async () => {
    const m = await collectMetrics(store(users), { protocolVersion: 1 }, { projectId: "p", excludeAnonymous: false, now: NOW });
    expect(m.totalUsers).toBe(4);
    expect(m.newUsers).toEqual({ "24h": 1, "7d": 2, "30d": 3 });
    expect(m.protocolVersion).toBe(1);
    expect(m.provider).toBe("better-auth");
    expect(m.projectId).toBe("p");
    expect(m.capabilities).toEqual({ exactCounts: true, history: true, anonymousExcluded: false });
    expect(m.daily).toBeUndefined();
  });
  it("returns a daily series of the requested length, oldest first, UTC day keys", async () => {
    const m = await collectMetrics(store(users), { protocolVersion: 1, days: 5 }, { projectId: "p", excludeAnonymous: false, now: NOW });
    expect(m.daily).toHaveLength(5);
    expect(m.daily![0]!.day).toBe("2026-08-28");
    expect(m.daily![4]).toEqual({ day: "2026-09-01", newUsers: 1 });
    expect(m.daily![1]).toEqual({ day: "2026-08-29", newUsers: 1 });
  });
  it("counts an arbitrary [from, to) range", async () => {
    const m = await collectMetrics(store(users), { protocolVersion: 1, from: new Date(NOW - 20 * DAY).toISOString(), to: new Date(NOW - DAY).toISOString() }, { projectId: "p", excludeAnonymous: false, now: NOW });
    expect(m.range).toMatchObject({ count: 2 });
  });
  it("rejects malformed requests", async () => {
    await expect(collectMetrics(store(users), { protocolVersion: 1, days: 0 }, { projectId: "p", excludeAnonymous: false })).rejects.toBeInstanceOf(MetricsError);
    await expect(collectMetrics(store(users), { protocolVersion: 1, days: 91 }, { projectId: "p", excludeAnonymous: false })).rejects.toThrow(/days/);
    await expect(collectMetrics(store(users), { protocolVersion: 1, from: "nope", to: new Date().toISOString() }, { projectId: "p", excludeAnonymous: false })).rejects.toThrow(/from/);
    await expect(collectMetrics(store(users), { protocolVersion: 1, from: new Date(NOW).toISOString(), to: new Date(NOW - DAY).toISOString() }, { projectId: "p", excludeAnonymous: false })).rejects.toThrow(/after/);
  });
  it("excludes anonymous users when asked", async () => {
    const s = store([...users, { createdAt: new Date(NOW - 3600_000), isAnonymous: true }]);
    const m = await collectMetrics(s, { protocolVersion: 1 }, { projectId: "p", excludeAnonymous: true, now: NOW });
    expect(m.totalUsers).toBe(4);
    expect(m.newUsers["24h"]).toBe(1);
    expect(m.capabilities.anonymousExcluded).toBe(true);
  });
  it("propagates adapter failures", async () => {
    const s = store(users);
    s.count = async () => { throw new Error("connection refused"); };
    await expect(collectMetrics(s, { protocolVersion: 1 }, { projectId: "p", excludeAnonymous: false })).rejects.toThrow(/connection refused/);
  });
});

describe("countUsers fallback", () => {
  it("uses count when available", async () => {
    const s = store([{ createdAt: new Date() }]);
    expect(await countUsers(s, [])).toEqual({ count: 1, exact: true });
    expect(s.calls).toEqual(["count"]);
  });
  it("falls back to an id-only scan when the adapter has no count", async () => {
    const s = store(Array.from({ length: 1203 }, () => ({ createdAt: new Date() })), { count: false });
    expect(await countUsers(s, [])).toEqual({ count: 1203, exact: true });
    expect(s.calls.every((c) => c === "findMany")).toBe(true);
  });
  it("marks the scan inexact when it hits the cap", async () => {
    const s: UserStore = { findMany: async ({ limit }) => Array.from({ length: limit ?? 0 }, (_, i) => ({ id: String(i) })) as never };
    expect(await countUsers(s, [])).toEqual({ count: SCAN_LIMIT, exact: false });
  });
});
