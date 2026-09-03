import { describe, expect, it } from "vitest";
import { type Identities, NonceCache } from "@usertrack/protocol";
import { createUserTrackHandler, toNodeHandler } from "../src/index.js";
import { DAY, memorySource, NOW, PROJECT, readSigned, SECRET, signedRequest } from "./helpers.js";
import { createServer } from "node:http";

const users = () => memorySource([new Date(NOW - 3600_000), new Date(NOW - 3 * DAY), new Date(NOW - 10 * DAY), new Date(NOW - 45 * DAY)]);
const make = (extra: Partial<Parameters<typeof createUserTrackHandler>[0]> = {}) => createUserTrackHandler({ projectId: PROJECT, secret: SECRET, users: users(), now: () => NOW, ...extra });

describe("createUserTrackHandler", () => {
  it("answers a valid request with signed metrics for every configured role", async () => {
    const handler = make({
      source: "prisma",
      activation: memorySource([new Date(NOW - DAY / 2), new Date(NOW - 20 * DAY)]),
      conversion: { converted: memorySource([new Date(NOW - 2 * DAY)]), trial: memorySource([new Date(NOW - DAY), new Date(NOW - 40 * DAY)]), mode: "ever_paid" },
      identities: async () => ({ signedUp: [{ id: "u1", at: new Date(NOW) }, { id: "bad@example.com" }, { id: 7 }], converted: [{ id: "u1" }] }) as unknown as Promise<Identities>,
    });
    const req = await signedRequest({ days: 3 }, { timestamp: NOW });
    const res = await handler(req);
    expect(res.status).toBe(200);
    const { json, sig, text } = await readSigned(res, req);
    expect(sig?.ok).toBe(true);
    expect(json).toMatchObject({
      protocolVersion: 1,
      source: "prisma",
      projectId: PROJECT,
      users: { totalUsers: 4, newUsers: { "24h": 1, "7d": 2, "30d": 3 } },
      activation: { activatedUsers: 2, activated24h: 1, activated7d: 1, activated30d: 2 },
      conversion: { convertedUsers: 1, newConverted7d: 1, trialUsers: 2, newTrials7d: 1, newTrials30d: 1, mode: "ever_paid" },
      identities: { signedUp: [{ id: "u1", at: new Date(NOW).toISOString() }, { id: "7" }], converted: [{ id: "u1" }] },
      capabilities: { exactCounts: true, history: true, roles: ["users", "activation", "conversion"] },
    });
    expect(json!.clientVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect((json!.users as { daily: unknown[] }).daily).toHaveLength(3);
    expect((json!.activation as { daily: unknown[] }).daily).toHaveLength(3);
    expect(text).not.toContain("@example.com");
  });
  it("skips windows and history for sources without a time filter", async () => {
    const handler = make({ users: memorySource([new Date(NOW)], { timeFilter: false }) });
    const req = await signedRequest({ days: 3 }, { timestamp: NOW });
    const { json } = await readSigned(await handler(req), req);
    expect(json!.users).toEqual({ totalUsers: 1 });
    expect(json!.capabilities).toMatchObject({ history: false, exactCounts: true });
  });
  it("reports exactCounts=false when a source hit its cap", async () => {
    const handler = make({ users: memorySource([new Date(NOW)], { exact: false }) });
    const req = await signedRequest({}, { timestamp: NOW });
    const { json } = await readSigned(await handler(req), req);
    expect((json!.capabilities as { exactCounts: boolean }).exactCounts).toBe(false);
  });
  it("accepts an empty body and counts arbitrary ranges", async () => {
    const handler = make();
    const empty = await signedRequest(null, { timestamp: NOW });
    expect((await handler(empty)).status).toBe(200);
    const req = await signedRequest({ from: new Date(NOW - 20 * DAY).toISOString(), to: new Date(NOW - DAY).toISOString() }, { timestamp: NOW });
    const { json } = await readSigned(await handler(req), req);
    expect((json!.users as { range: { count: number } }).range.count).toBe(2);
  });
  it("rejects a wrong project id, wrong secret, stale timestamp, replayed nonce and tampered body", async () => {
    const handler = make({ nonces: new NonceCache() });
    expect((await handler(await signedRequest({}, { projectId: "other", timestamp: NOW }))).status).toBe(401);
    const wrong = await handler(await signedRequest({}, { secret: "ut_int_wrong", timestamp: NOW }));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toMatchObject({ code: "USERTRACK_UNAUTHORIZED" });
    const stale = await handler(await signedRequest({}, { timestamp: NOW - 10 * 60_000 }));
    expect(await stale.json()).toMatchObject({ code: "USERTRACK_STALE_REQUEST" });
    expect((await handler(await signedRequest({}, { nonce: "abc", timestamp: NOW }))).status).toBe(200);
    const replay = await handler(await signedRequest({}, { nonce: "abc", timestamp: NOW }));
    expect(await replay.json()).toMatchObject({ code: "USERTRACK_REPLAY" });
    const signedFor = await signedRequest({ days: 5 }, { timestamp: NOW });
    const tampered = new Request(signedFor.url, { method: "POST", headers: signedFor.headers, body: '{"protocolVersion":1,"days":90}' });
    expect((await handler(tampered)).status).toBe(401);
  });
  it("returns 400 for malformed parameters and 405 for other methods", async () => {
    const handler = make();
    const bad = await handler(await signedRequest({ days: 500 }, { timestamp: NOW }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "USERTRACK_BAD_REQUEST" });
    expect((await handler(await signedRequest({}, { rawBody: "{not json", timestamp: NOW }))).status).toBe(400);
    expect((await handler(await signedRequest({ protocolVersion: 2 as never }, { timestamp: NOW }))).status).toBe(400);
    expect((await handler(await signedRequest({}, { method: "GET" }))).status).toBe(405);
  });
  it("maps source failures to a 500 without leaking internals", async () => {
    const logs: string[] = [];
    const handler = make({ users: { count: async () => { throw new Error("postgres://user:pw@host/db"); } }, debug: (m, meta) => logs.push(`${m} ${JSON.stringify(meta)}`) });
    const res = await handler(await signedRequest({}, { timestamp: NOW }));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("postgres://");
    expect(logs.join("\n")).toContain("metrics query failed");
  });
  it("validates options at construction", () => {
    expect(() => createUserTrackHandler({ projectId: "", secret: "s", users: memorySource([]) })).toThrow(/projectId/);
    expect(() => createUserTrackHandler({ projectId: "p", secret: " ", users: memorySource([]) })).toThrow(/secret/);
    // @ts-expect-error users missing
    expect(() => createUserTrackHandler({ projectId: "p", secret: "s" })).toThrow(/users/);
  });
});

describe("toNodeHandler", () => {
  it("serves the fetch handler over Node http", async () => {
    const server = createServer(toNodeHandler(make()));
    const port = await new Promise<number>((r) => server.listen(0, "127.0.0.1", () => r((server.address() as { port: number }).port)));
    try {
      const req = await signedRequest({}, { timestamp: NOW });
      const res = await fetch(`http://127.0.0.1:${port}/api/usertrack/metrics`, { method: "POST", headers: req.headers, body: await req.text() });
      expect(res.status).toBe(200);
      const { json, sig } = await readSigned(res, req);
      expect(sig?.ok).toBe(true);
      expect(json!.users).toMatchObject({ totalUsers: 4 });
      expect((await fetch(`http://127.0.0.1:${port}/api/usertrack/metrics`, { method: "GET" })).status).toBe(405);
    } finally {
      server.close();
    }
  });
});
