import { describe, expect, it } from "vitest";
import { betterAuthUsers, countUsers, SCAN_LIMIT, type UserStore } from "../src/metrics.js";

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

describe("betterAuthUsers", () => {
  const users = [
    { createdAt: new Date(NOW - 2 * 3600_000) },
    { createdAt: new Date(NOW - 3 * DAY) },
    { createdAt: new Date(NOW - 10 * DAY) },
    { createdAt: new Date(NOW - 45 * DAY) },
  ];
  it("counts totals and createdAt windows through the adapter", async () => {
    const src = betterAuthUsers(store(users), { excludeAnonymous: false });
    expect(src.timeFilter).toBe(true);
    expect(await src.count({})).toEqual({ count: 4, exact: true });
    expect(await src.count({ createdAtGte: new Date(NOW - 7 * DAY) })).toEqual({ count: 2, exact: true });
    expect(await src.count({ createdAtGte: new Date(NOW - 20 * DAY), createdAtLt: new Date(NOW - DAY) })).toEqual({ count: 2, exact: true });
  });
  it("excludes anonymous users when asked", async () => {
    const s = store([...users, { createdAt: new Date(NOW - 3600_000), isAnonymous: true }]);
    const src = betterAuthUsers(s, { excludeAnonymous: true });
    expect(await src.count({})).toEqual({ count: 4, exact: true });
    expect(await src.count({ createdAtGte: new Date(NOW - DAY) })).toEqual({ count: 1, exact: true });
  });
  it("propagates adapter failures", async () => {
    const s = store(users);
    s.count = async () => { throw new Error("connection refused"); };
    await expect(betterAuthUsers(s, { excludeAnonymous: false }).count({})).rejects.toThrow(/connection refused/);
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
