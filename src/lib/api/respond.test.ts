import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { PLANS } from "@convex/lib/tokens";

const { fetchMutation, limit } = vi.hoisted(() => ({ fetchMutation: vi.fn(), limit: vi.fn() }));
vi.mock("convex/nextjs", () => ({ fetchMutation }));
// The limiter has its own tests (rate-limit.test.ts); here it is a stub so withApi's mapping is what is under test.
vi.mock("./rate-limit", () => ({ limit }));

import { fail, ok, withApi } from "./respond";

const KEY = "ut_api_" + "k".repeat(40);
let ipCounter = 0;
const request = (headers: Record<string, string> = {}) => new Request("http://localhost/api/v1/saas", { headers: { "x-forwarded-for": `10.0.0.${++ipCounter}`, ...headers } });
const keyed = (key = KEY) => request({ authorization: `Bearer ${key}` });
const okHandler = withApi("saas", async () => ok({ hello: "world" }));
const quota = { perDay: PLANS.free.api.perDay, usedToday: 5, remaining: PLANS.free.api.perDay - 5, resetAt: Date.UTC(2026, 8, 3) };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(2026, 8, 2, 12) });
  fetchMutation.mockReset();
  limit.mockReset();
  limit.mockResolvedValue({ allowed: true, limit: 60, remaining: 59, retryAfterSec: 0 });
});
afterEach(() => vi.useRealTimers());

describe("withApi anonymous", () => {
  it("passes anonymous requests through with a per-minute window", async () => {
    const res = await okHandler(request(), {});
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Window")).toBe("minute");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    expect(res.headers.get("Cache-Control")).toContain("public");
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After once the anonymous limit denies", async () => {
    limit.mockResolvedValueOnce({ allowed: false, limit: 60, remaining: 0, retryAfterSec: 1 });
    const res = await okHandler(request(), {});
    expect(limit.mock.calls[0][1]).toBe("anonApi");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    const body = await res.json();
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.message).toMatch(/API key/);
  });
});

describe("withApi keyed", () => {
  it("authorizes a well-formed ut_api_ key and reports the daily window", async () => {
    fetchMutation.mockResolvedValueOnce({ limit: quota });
    const res = await okHandler(keyed(), {});
    expect(res.status).toBe(200);
    expect(fetchMutation).toHaveBeenCalledTimes(1);
    expect(fetchMutation.mock.calls[0][1]).toMatchObject({ type: "api", category: "saas" });
    expect(limit.mock.calls[0].slice(1)).toEqual(["apiKey", expect.stringMatching(/^[0-9a-f]{64}$/)]);
    expect(res.headers.get("X-RateLimit-Window")).toBe("day");
    expect(res.headers.get("X-RateLimit-Limit")).toBe(String(quota.perDay));
    expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(quota.remaining));
    expect(res.headers.get("X-RateLimit-Reset")).toBe(String(Math.floor(quota.resetAt / 1000)));
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.data).toEqual({ hello: "world" });
    expect(body.meta.version).toBe("v1");
  });

  it("maps a revoked token to a 401 envelope", async () => {
    fetchMutation.mockRejectedValueOnce(new ConvexError({ code: "revoked", message: "This token has been revoked" }));
    const res = await okHandler(keyed("ut_api_" + "r".repeat(40)), {});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "revoked", message: "This token has been revoked" } });
    expect(res.headers.get("X-RateLimit-Window")).toBe("day");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("maps a daily quota failure to 429 with Retry-After", async () => {
    fetchMutation.mockRejectedValueOnce(new ConvexError({ code: "rate_limited", message: "Daily limit reached", retryAfterSec: 3600, limit: 1000, resetAt: quota.resetAt }));
    const res = await okHandler(keyed("ut_api_" + "q".repeat(40)), {});
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("1000");
    expect((await res.json()).error.code).toBe("rate_limited");
  });

  it("returns 429 when the per-key burst limit denies", async () => {
    limit.mockResolvedValueOnce({ allowed: false, limit: 120, remaining: 0, retryAfterSec: 2 });
    const res = await okHandler(keyed(), {});
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("2");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("120");
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  it("rejects a malformed key with 401 unauthorized without calling Convex", async () => {
    const res = await okHandler(keyed("ut_api_short"), {});
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  it("rethrows non-gateway errors from authorize", async () => {
    fetchMutation.mockRejectedValueOnce(new Error("network down"));
    await expect(okHandler(keyed("ut_api_" + "n".repeat(40)), {})).rejects.toThrow("network down");
  });
});

describe("withApi handler errors and envelopes", () => {
  it("turns a throwing handler into a 500 internal envelope", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await withApi("saas", async () => { throw new Error("boom"); })(request(), {});
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Internal error" } });
    expect(res.headers.get("X-RateLimit-Window")).toBe("minute");
    spy.mockRestore();
  });

  it("shapes success and error envelopes", async () => {
    const success = await ok({ a: 1 }, { total: 3 }).json();
    expect(success.data).toEqual({ a: 1 });
    expect(success.meta.version).toBe("v1");
    expect(success.meta.total).toBe(3);
    expect(typeof success.meta.generatedAt).toBe("string");
    const failed = fail("not_found", "Nope", 404);
    expect(failed.status).toBe(404);
    expect(await failed.json()).toEqual({ error: { code: "not_found", message: "Nope" } });
    expect(failed.headers.get("Cache-Control")).toBe("no-store");
  });
});
