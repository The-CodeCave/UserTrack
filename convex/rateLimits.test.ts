/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "./schema";
import rateLimiterSchema from "../node_modules/@convex-dev/rate-limiter/dist/component/schema.js";
import { api } from "./_generated/api";
import { RATE_LIMITS } from "./lib/rateLimits";

const GATEWAY = "test-gateway-secret";
process.env.UT_GATEWAY_SECRET = GATEWAY;
const modules = import.meta.glob("./**/*.*s");
const rateLimiterModules = import.meta.glob("../node_modules/@convex-dev/rate-limiter/dist/component/**/*.js");

function setup() {
  const t = convexTest(schema, modules);
  t.registerComponent("rateLimiter", rateLimiterSchema, rateLimiterModules);
  return t;
}

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(2026, 8, 4, 12) }));
afterEach(() => vi.useRealTimers());

describe("rateLimits.check", () => {
  it("allows up to the capacity, denies with retryAfterMs, allows again after the window refills", async () => {
    const t = setup();
    const cap = RATE_LIMITS.card.rate;
    for (let i = 0; i < cap; i++) {
      const r = await t.mutation(api.rateLimits.check, { gateway: GATEWAY, name: "card", key: "1.2.3.4" });
      expect(r.ok, `call ${i}`).toBe(true);
      expect(r.remaining).toBe(cap - 1 - i);
    }
    const denied = await t.mutation(api.rateLimits.check, { gateway: GATEWAY, name: "card", key: "1.2.3.4" });
    expect(denied).toEqual({ ok: false, retryAfterMs: expect.any(Number), remaining: 0 });
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(60_000 / cap + 1);
    vi.setSystemTime(Date.now() + 60_000);
    const again = await t.mutation(api.rateLimits.check, { gateway: GATEWAY, name: "card", key: "1.2.3.4" });
    expect(again.ok).toBe(true);
    expect(again.remaining).toBe(cap - 1);
  });

  it("keys and names are independent", async () => {
    const t = setup();
    for (let i = 0; i < RATE_LIMITS.xCallback.rate; i++) await t.mutation(api.rateLimits.check, { gateway: GATEWAY, name: "xCallback", key: "a" });
    expect((await t.mutation(api.rateLimits.check, { gateway: GATEWAY, name: "xCallback", key: "a" })).ok).toBe(false);
    expect((await t.mutation(api.rateLimits.check, { gateway: GATEWAY, name: "xCallback", key: "b" })).ok).toBe(true);
    expect((await t.mutation(api.rateLimits.check, { gateway: GATEWAY, name: "badge", key: "a" })).ok).toBe(true);
  });

  it("requires the gateway secret", async () => {
    const t = setup();
    await expect(t.mutation(api.rateLimits.check, { gateway: "wrong", name: "badge", key: "a" })).rejects.toThrow(ConvexError);
    await expect(t.mutation(api.rateLimits.check, { name: "badge", key: "a" })).rejects.toThrow(ConvexError);
  });
});
