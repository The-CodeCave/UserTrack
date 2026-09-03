import { describe, expect, it, vi } from "vitest";
import { PgDialect, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { isNull, type SQL } from "drizzle-orm";
import { prismaUsers, userTrackPrismaExtension } from "../src/prisma.js";
import { drizzleUsers } from "../src/drizzle.js";
import { convexHandler, countWithCap } from "../src/convex.js";
import { userTrackAuthjsEvents } from "../src/authjs.js";
import { DAY, NOW, PROJECT, readSigned, SECRET, signedRequest } from "./helpers.js";

const from = new Date(NOW - 7 * DAY);
const to = new Date(NOW);

describe("prisma adapter", () => {
  const rows = [{ id: "a", createdAt: new Date(NOW - DAY), deletedAt: null }, { id: "b", createdAt: new Date(NOW - 10 * DAY), deletedAt: null }, { id: "c", createdAt: new Date(NOW - DAY), deletedAt: new Date() }];
  const fakeUser = { count: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
    const w = (args?.where ?? {}) as { createdAt?: { gte?: Date; lt?: Date }; deletedAt?: null };
    return rows.filter((r) => (!w.createdAt?.gte || r.createdAt >= w.createdAt.gte) && (!w.createdAt?.lt || r.createdAt < w.createdAt.lt) && (w.deletedAt === undefined || r.deletedAt === w.deletedAt)).length;
  }) };
  it("counts with createdAt bounds and an extra where", async () => {
    const src = prismaUsers(fakeUser, { where: { deletedAt: null } });
    expect(await src.count({})).toBe(2);
    expect(await src.count({ createdAtGte: from, createdAtLt: to })).toBe(1);
    expect(fakeUser.count).toHaveBeenLastCalledWith({ where: { deletedAt: null, createdAt: { gte: from, lt: to } } });
    expect(src.timeFilter).toBe(true);
  });
  it("supports models without a timestamp (totals only)", async () => {
    const src = prismaUsers(fakeUser, { createdAtField: null });
    expect(src.timeFilter).toBe(false);
    expect(await src.count({ createdAtGte: from })).toBe(3);
    expect(fakeUser.count).toHaveBeenLastCalledWith(undefined);
    expect(() => prismaUsers({} as never)).toThrow(/count/);
  });
  it("extension pushes user.created / user.deleted after the write and never blocks it", async () => {
    const sent: string[] = [];
    const ext = userTrackPrismaExtension({ projectId: PROJECT, secret: SECRET, fetch: (async (_u: unknown, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body)).type); return new Response("{}", { status: 202 }); }) as unknown as typeof fetch });
    expect(ext.name).toBe("usertrack");
    const hooks = ext.query.user as { create: (p: { args: unknown; query: (a: unknown) => Promise<unknown> }) => Promise<unknown>; delete: (p: { args: unknown; query: (a: unknown) => Promise<unknown> }) => Promise<unknown> };
    const created = await hooks.create({ args: { data: { email: "x@example.com" } }, query: async () => ({ id: "u1", email: "x@example.com", createdAt: new Date(NOW) }) });
    expect(created).toMatchObject({ id: "u1" });
    await hooks.delete({ args: { where: { id: "u1" } }, query: async () => ({ id: "u1" }) });
    await new Promise((r) => setTimeout(r, 20));
    expect(sent).toEqual(["user.created", "user.deleted"]);
    const failing = userTrackPrismaExtension({ projectId: PROJECT, secret: SECRET, model: "account", fetch: (async () => { throw new Error("down"); }) as unknown as typeof fetch });
    expect(Object.keys(failing.query)).toEqual(["account"]);
    await expect((failing.query.account as typeof hooks).create({ args: {}, query: async () => ({ id: "u2" }) })).resolves.toMatchObject({ id: "u2" });
  });
});

describe("drizzle adapter", () => {
  const users = pgTable("users", { id: text("id").primaryKey(), createdAt: timestamp("created_at").notNull(), deletedAt: timestamp("deleted_at") });
  const dialect = new PgDialect();
  const rendered: { sql: string; params: unknown[] }[] = [];
  const db = { select: (fields: { n: SQL<number> }) => ({ from: (_t: unknown) => ({ where: async (cond: SQL | undefined) => { const q = cond ? dialect.sqlToQuery(cond) : { sql: "", params: [] }; rendered.push(q); return [{ n: String(Object.keys(fields).length + 2) }]; } }) }) };
  it("renders count(*) with gte / lt bounds and an extra condition", async () => {
    const src = drizzleUsers(db, users, { createdAt: users.createdAt, where: isNull(users.deletedAt) });
    expect(await src.count({ createdAtGte: from, createdAtLt: to })).toBe(3);
    expect(rendered.at(-1)!.sql).toBe('("users"."deleted_at" is null and "users"."created_at" >= $1 and "users"."created_at" < $2)');
    expect(rendered.at(-1)!.params).toEqual([from.toISOString(), to.toISOString()]);
    expect(await src.count({})).toBe(3);
    expect(rendered.at(-1)!.sql).toBe('"users"."deleted_at" is null');
  });
  it("is totals-only without a timestamp column", async () => {
    const src = drizzleUsers(db, users);
    expect(src.timeFilter).toBe(false);
    expect(await src.count({ createdAtGte: from })).toBe(3);
    expect(rendered.at(-1)!.sql).toBe("");
    expect(() => drizzleUsers({} as never, users)).toThrow(/drizzle/);
  });
});

describe("convex adapter", () => {
  it("routes counts through ctx.runQuery with epoch-millisecond bounds and signs the response", async () => {
    const seen: { ref: string; args: Record<string, number> }[] = [];
    const ctx = { runQuery: async (ref: string, args: Record<string, number>) => { seen.push({ ref, args }); return ref === "users" ? { count: 5, exact: false } : 2; } };
    const handler = convexHandler({ projectId: PROJECT, secret: SECRET, users: "users", activation: "activation", now: () => NOW });
    const req = await signedRequest({}, { timestamp: NOW });
    const res = await handler(ctx as never, req);
    expect(res.status).toBe(200);
    const { json, sig } = await readSigned(res, req);
    expect(sig?.ok).toBe(true);
    expect(json).toMatchObject({ source: "convex", users: { totalUsers: 5, newUsers: { "24h": 5, "7d": 5, "30d": 5 } }, activation: { activatedUsers: 2 }, capabilities: { exactCounts: false, roles: ["users", "activation"] } });
    expect(seen[0]).toEqual({ ref: "users", args: {} });
    expect(seen[1]).toEqual({ ref: "users", args: { createdAtGte: NOW - DAY } });
    expect((await handler(ctx as never, new Request("https://x/y", { method: "GET" }))).status).toBe(405);
  });
  it("countWithCap reports exact=false beyond the cap", async () => {
    const q = (n: number) => ({ take: async (k: number) => Array.from({ length: Math.min(n, k) }) });
    expect(await countWithCap(q(3), 10)).toEqual({ count: 3, exact: true });
    expect(await countWithCap(q(10), 10)).toEqual({ count: 10, exact: true });
    expect(await countWithCap(q(11), 10)).toEqual({ count: 10, exact: false });
  });
});

describe("authjs adapter", () => {
  it("pushes user.created from the createUser event and ignores users without an id", async () => {
    const sent: string[] = [];
    const events = userTrackAuthjsEvents({ projectId: PROJECT, secret: SECRET, fetch: (async (_u: unknown, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body)).source); return new Response("{}", { status: 202 }); }) as unknown as typeof fetch });
    await events.createUser({ user: { id: "u1" } });
    await events.createUser({ user: { id: null } });
    await new Promise((r) => setTimeout(r, 20));
    expect(sent).toEqual(["authjs"]);
  });
});
