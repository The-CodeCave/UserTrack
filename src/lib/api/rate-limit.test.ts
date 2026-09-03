import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const { fetchMutation } = vi.hoisted(() => ({ fetchMutation: vi.fn() }));
vi.mock("convex/nextjs", () => ({ fetchMutation }));

import { LIMIT, limit, take, tooMany } from "./rate-limit";

describe("take (in-memory first line)", () => {
  it("allows LIMIT requests then denies", () => {
    const now = 1_000_000;
    for (let i = 0; i < LIMIT; i++) expect(take("a", now).allowed).toBe(true);
    const denied = take("a", now);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("refills one token per second", () => {
    const now = 2_000_000;
    for (let i = 0; i < LIMIT; i++) take("b", now);
    expect(take("b", now + 500).allowed).toBe(false);
    expect(take("b", now + 1_000).allowed).toBe(true);
    expect(take("b", now + 1_000).allowed).toBe(false);
    expect(take("b", now + 61_000).remaining).toBe(LIMIT - 1);
  });

  it("keys are independent", () => {
    const now = 3_000_000;
    for (let i = 0; i < LIMIT; i++) take("c", now);
    expect(take("c", now).allowed).toBe(false);
    expect(take("d", now).allowed).toBe(true);
  });
});

describe("limit (trusted IP + Convex)", () => {
  let ipCounter = 0;
  const request = (headers: Record<string, string> = {}) => new Request("http://localhost/api/badge/acme.svg", { headers: { "x-forwarded-for": `10.9.0.${++ipCounter}`, ...headers } });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(2026, 8, 4, 12) });
    process.env.UT_GATEWAY_SECRET = "gw";
    fetchMutation.mockReset();
    fetchMutation.mockResolvedValue({ ok: true, retryAfterMs: 0, remaining: 41 });
  });
  afterEach(() => vi.useRealTimers());

  it("keys on the LAST forwarded hop and passes the gateway secret", async () => {
    const r = await limit(request({ "x-forwarded-for": "evil, 203.0.113.9" }), "badge");
    expect(r).toEqual({ allowed: true, limit: 120, remaining: 41, retryAfterSec: 0 });
    expect(getFunctionName(fetchMutation.mock.calls[0][0])).toBe("rateLimits:check");
    expect(fetchMutation.mock.calls[0][1]).toEqual({ gateway: "gw", name: "badge", key: "203.0.113.9" });
  });

  it("uses an explicit key instead of the IP", async () => {
    await limit(request(), "nativeEvents", "proj_1");
    expect(fetchMutation.mock.calls[0][1]).toMatchObject({ name: "nativeEvents", key: "proj_1" });
  });

  it("maps a Convex denial to retryAfterSec (rounded up, at least 1)", async () => {
    fetchMutation.mockResolvedValueOnce({ ok: false, retryAfterMs: 2_400, remaining: 0 });
    const r = await limit(request(), "card");
    expect(r).toEqual({ allowed: false, limit: 40, remaining: 0, retryAfterSec: 3 });
    fetchMutation.mockResolvedValueOnce({ ok: false, retryAfterMs: 10, remaining: 0 });
    expect((await limit(request(), "card")).retryAfterSec).toBe(1);
  });

  it("denies locally before consulting Convex once the in-memory bucket is empty", async () => {
    const ip = "198.51.100.42";
    for (let i = 0; i < 40; i++) expect((await limit(request({ "x-forwarded-for": ip }), "card")).allowed).toBe(true);
    expect(fetchMutation).toHaveBeenCalledTimes(40);
    const r = await limit(request({ "x-forwarded-for": ip }), "card");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(fetchMutation).toHaveBeenCalledTimes(40);
  });

  it("degrades to the local bucket when Convex is unreachable", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMutation.mockRejectedValueOnce(new Error("network down"));
    const r = await limit(request(), "embed");
    expect(r).toEqual({ allowed: true, limit: 60, remaining: 59, retryAfterSec: 0 });
    spy.mockRestore();
  });

  it("denies when Convex reports write contention on the key (the flood itself)", async () => {
    fetchMutation.mockRejectedValueOnce(new Error('{"code":"OptimisticConcurrencyControlFailure","message":"Documents read from or written to the \"rateLimits\" table changed"}'));
    expect(await limit(request(), "badge")).toEqual({ allowed: false, limit: 120, remaining: 0, retryAfterSec: 1 });
  });

  it("tooMany sets Retry-After and no-store", async () => {
    const res = tooMany({ allowed: false, limit: 10, remaining: 0, retryAfterSec: 7 }, "Too many attempts");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("7");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("Too many attempts");
  });
});
