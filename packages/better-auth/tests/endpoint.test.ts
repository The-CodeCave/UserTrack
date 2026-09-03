import { afterEach, describe, expect, it, vi } from "vitest";
import { anonymous } from "better-auth/plugins";
import { HEADER_NONCE, HEADER_SIGNATURE, METRICS_PATH, verify } from "../src/protocol.js";
import { makeAuth, metricsRequest, PROJECT, SECRET, seedUsers, signUp } from "./helpers.js";

const DAY = 86_400_000;
afterEach(() => vi.unstubAllGlobals());

describe("metrics endpoint", () => {
  it("returns signed aggregate metrics for a valid request", async () => {
    const { auth, db } = makeAuth();
    seedUsers(db, [new Date(Date.now() - 2 * DAY), new Date(Date.now() - 40 * DAY)]);
    await signUp(auth, "a@example.com");
    const { res, json, text } = await metricsRequest(auth, { days: 3 });
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ protocolVersion: 1, source: "better-auth", projectId: PROJECT, users: { totalUsers: 3, newUsers: { "24h": 1, "7d": 2, "30d": 2 } }, capabilities: { anonymousExcluded: false, roles: ["users"] } });
    expect(((json!.users as { daily: unknown[] }).daily).length).toBe(3);
    expect(json!.clientVersion).toMatch(/^\d+\.\d+\.\d+/);
    const nonce = res.headers.get(HEADER_NONCE)!;
    expect((await verify(SECRET, res.headers, { method: "RESPONSE", path: METRICS_PATH, body: text }, { expectedNonce: nonce })).ok).toBe(true);
    expect(text).not.toContain("a@example.com");
  });
  it("rejects a wrong project id", async () => {
    const { auth } = makeAuth();
    const { res } = await metricsRequest(auth, {}, { projectId: "other" });
    expect(res.status).toBe(401);
  });
  it("rejects a wrong secret", async () => {
    const { auth } = makeAuth();
    const { res, json } = await metricsRequest(auth, {}, { secret: "ut_int_wrong" });
    expect(res.status).toBe(401);
    expect(json).toMatchObject({ code: "USERTRACK_UNAUTHORIZED" });
  });
  it("rejects a stale timestamp", async () => {
    const { auth } = makeAuth();
    const { res, json } = await metricsRequest(auth, {}, { timestamp: Date.now() - 10 * 60_000 });
    expect(res.status).toBe(401);
    expect(json).toMatchObject({ code: "USERTRACK_STALE_REQUEST" });
  });
  it("rejects a replayed nonce", async () => {
    const { auth } = makeAuth();
    const first = await metricsRequest(auth, {}, { nonce: "abc", timestamp: Date.now() });
    expect(first.res.status).toBe(200);
    const again = await metricsRequest(auth, {}, { nonce: "abc", timestamp: Date.now() });
    expect(again.res.status).toBe(401);
    expect(again.json).toMatchObject({ code: "USERTRACK_REPLAY" });
  });
  it("rejects a tampered body", async () => {
    const { auth } = makeAuth();
    const { res } = await metricsRequest(auth, {}, { rawBody: '{"protocolVersion":1,"days":5}', secret: SECRET, projectId: PROJECT }).then(async (r) => r);
    expect(res.status).toBe(200);
    const raw = '{"protocolVersion":1,"days":5}';
    const { signedHeaders } = await import("../src/protocol.js");
    const headers = await signedHeaders(SECRET, PROJECT, { method: "REQUEST", path: METRICS_PATH, body: raw });
    const tampered = await auth.handler(new Request(`http://localhost:3000/api/auth${METRICS_PATH}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: '{"protocolVersion":1,"days":90}' }));
    expect(tampered.status).toBe(401);
  });
  it("returns 400 for malformed parameters", async () => {
    const { auth } = makeAuth();
    const { res, json } = await metricsRequest(auth, { days: 500 });
    expect(res.status).toBe(400);
    expect(json).toMatchObject({ code: "USERTRACK_BAD_REQUEST" });
  });
  it("supports arbitrary date ranges", async () => {
    const { auth, db } = makeAuth();
    seedUsers(db, [new Date("2026-03-10T00:00:00Z"), new Date("2026-03-20T00:00:00Z"), new Date("2026-05-01T00:00:00Z")]);
    const { json } = await metricsRequest(auth, { from: "2026-03-01T00:00:00Z", to: "2026-04-01T00:00:00Z" });
    expect((json!.users as { range: unknown }).range).toMatchObject({ count: 2 });
  });
  it("excludes anonymous users when the anonymous plugin is installed", async () => {
    const { auth, db } = makeAuth({}, { plugins: [anonymous(), (await import("../src/index.js")).userTrack({ projectId: PROJECT, secret: SECRET, events: false })] });
    seedUsers(db, [new Date()], { isAnonymous: true });
    seedUsers(db, [new Date()]);
    const { json } = await metricsRequest(auth);
    expect((json!.users as { totalUsers: number }).totalUsers).toBe(1);
    expect((json!.capabilities as { anonymousExcluded: boolean }).anonymousExcluded).toBe(true);
  });
  it("maps adapter failures to a 500 without leaking internals", async () => {
    const { auth, db } = makeAuth();
    db.user = new Proxy([], { get: (t, k) => (k === "filter" ? () => { throw new Error("db connection string postgres://user:pw@host"); } : Reflect.get(t, k)) }) as never;
    const { res, text } = await metricsRequest(auth);
    expect(res.status).toBe(500);
    expect(text).not.toContain("postgres://");
  });
});

describe("lifecycle hooks", () => {
  it("pushes a signed user.created event without PII and never blocks signup", async () => {
    const calls: { url: string; body: string; headers: Headers }[] = [];
    let resolveDelivered!: () => void;
    const delivered = new Promise<void>((r) => (resolveDelivered = r));
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), headers: new Headers(init.headers) });
      resolveDelivered();
      return new Response("{}", { status: 202 });
    }));
    const { auth } = makeAuth({ events: true });
    const user = await signUp(auth, "founder@example.com");
    await delivered;
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://usertrack.dev/api/integrations/native/events");
    const body = JSON.parse(calls[0]!.body);
    expect(body).toMatchObject({ type: "user.created", projectId: PROJECT, protocolVersion: 1, source: "better-auth" });
    expect(calls[0]!.body).not.toContain("founder@example.com");
    expect(calls[0]!.body).not.toContain(user.id);
    expect(calls[0]!.headers.get(HEADER_SIGNATURE)).toMatch(/^v1=/);
  });
  it("signup succeeds when UserTrack is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const { auth, db } = makeAuth({ events: true, debug: true });
    const user = await signUp(auth, "down@example.com");
    expect(user.email).toBe("down@example.com");
    expect(db.user).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 20));
  });
  it("signup succeeds when UserTrack hangs", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const { auth } = makeAuth({ events: true });
    const started = Date.now();
    await signUp(auth, "slow@example.com");
    expect(Date.now() - started).toBeLessThan(2000);
    await new Promise((r) => setTimeout(r, 20));
  });
  it("does not call UserTrack when events are disabled", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { auth } = makeAuth({ events: false });
    await signUp(auth, "quiet@example.com");
    await new Promise((r) => setTimeout(r, 20));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("pushes user.deleted when a user is removed", async () => {
    const types: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { types.push(JSON.parse(String(init.body)).type); return new Response("{}", { status: 202 }); }));
    const { auth } = makeAuth({ events: true }, { user: { deleteUser: { enabled: true } } });
    const user = await signUp(auth, "bye@example.com");
    await (await auth.$context).internalAdapter.deleteUser(user.id);
    await new Promise((r) => setTimeout(r, 50));
    expect(types).toEqual(["user.created", "user.deleted"]);
  });
  it("keeps host plugins, providers and existing database hooks intact", async () => {
    const hostHook = vi.fn(async () => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 202 })));
    const { auth } = makeAuth({ events: true }, { databaseHooks: { user: { create: { after: hostHook } } } });
    await signUp(auth, "both@example.com");
    expect(hostHook).toHaveBeenCalledOnce();
    const ctx = await auth.$context;
    expect(ctx.options.plugins!.map((p) => p.id)).toContain("usertrack");
    expect(ctx.options.emailAndPassword?.enabled).toBe(true);
  });
});
