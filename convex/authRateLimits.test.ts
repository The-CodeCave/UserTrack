/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { betterAuth } from "better-auth/minimal";
import { memoryAdapter } from "better-auth/adapters/memory";
import schema from "./schema";
import { internal } from "./_generated/api";
import { AUTH_RATE_LIMIT_DEFAULT, AUTH_RATE_LIMIT_RULES, decideAuthRateLimit } from "./lib/authRateLimits";
import { CLIENT_IP_HEADER } from "../src/lib/client-ip";

vi.mock("./email/users", () => ({ findAuthUser: async () => null }));

const modules = import.meta.glob("./**/*.*s");
const t = () => convexTest(schema, modules);
const rows = (tx: ReturnType<typeof t>) => tx.run((ctx) => ctx.db.query("authRateLimits").collect());

// The same options `createAuth` builds, on an in-memory user store: only the rate-limit path is under test.
function authWith(tx: ReturnType<typeof t>) {
  return betterAuth({
    baseURL: "https://usertrack.dev",
    database: memoryAdapter({}),
    emailAndPassword: { enabled: true },
    advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
    rateLimit: {
      enabled: true,
      ...AUTH_RATE_LIMIT_DEFAULT,
      customRules: AUTH_RATE_LIMIT_RULES,
      customStorage: {
        get: (key: string) => tx.query(internal.authRateLimits.get, { key }),
        set: async (key: string, value: { count: number; lastRequest: number }) => {
          await tx.mutation(internal.authRateLimits.set, { key, count: value.count, lastRequest: value.lastRequest });
        },
        consume: (key: string, rule: { window: number; max: number }) => tx.mutation(internal.authRateLimits.consume, { key, window: rule.window, max: rule.max }),
      },
    },
  });
}

const post = (auth: ReturnType<typeof authWith>, path: string, ip: string, body: unknown) =>
  auth.handler(new Request(`https://usertrack.dev/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", [CLIENT_IP_HEADER]: ip }, body: JSON.stringify(body) }));

describe("decideAuthRateLimit", () => {
  const rule = { window: 600, max: 3 };
  it("counts inside the window, refuses at max and reopens after it", () => {
    expect(decideAuthRateLimit(null, rule, 1000)).toEqual({ allowed: true, count: 1, retryAfter: null });
    expect(decideAuthRateLimit({ count: 2, lastRequest: 1000 }, rule, 2000)).toEqual({ allowed: true, count: 3, retryAfter: null });
    expect(decideAuthRateLimit({ count: 3, lastRequest: 1000 }, rule, 2000)).toEqual({ allowed: false, count: 3, retryAfter: 599 });
    expect(decideAuthRateLimit({ count: 3, lastRequest: 1000 }, rule, 1000 + 600_001)).toEqual({ allowed: true, count: 1, retryAfter: null });
  });
});

describe("authRateLimits storage", () => {
  it("consumes a bucket atomically and keeps buckets apart by key", async () => {
    const tx = t();
    for (let i = 0; i < 3; i++) expect(await tx.mutation(internal.authRateLimits.consume, { key: "1.2.3.4|/sign-in/email", window: 600, max: 3 })).toEqual({ allowed: true, retryAfter: null });
    const blocked = await tx.mutation(internal.authRateLimits.consume, { key: "1.2.3.4|/sign-in/email", window: 600, max: 3 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(await tx.mutation(internal.authRateLimits.consume, { key: "5.6.7.8|/sign-in/email", window: 600, max: 3 })).toEqual({ allowed: true, retryAfter: null });
    expect((await rows(tx)).map((r) => r.key).sort()).toEqual(["1.2.3.4|/sign-in/email", "5.6.7.8|/sign-in/email"]);
  });

  it("round-trips through get / set and sweeps buckets that can no longer decide anything", async () => {
    const tx = t();
    await tx.mutation(internal.authRateLimits.set, { key: "k|/x", count: 4, lastRequest: 111 });
    expect(await tx.query(internal.authRateLimits.get, { key: "k|/x" })).toEqual({ key: "k|/x", count: 4, lastRequest: 111 });
    expect(await tx.query(internal.authRateLimits.get, { key: "absent" })).toBeNull();
    await tx.mutation(internal.authRateLimits.consume, { key: "fresh|/x", window: 60, max: 5 });
    expect((await rows(tx)).map((r) => r.key)).toEqual(["fresh|/x"]);
  });
});

describe("Better Auth over the durable store", () => {
  it("429s the 6th verification mail from one address and leaves another address alone", async () => {
    const tx = t();
    const auth = authWith(tx);
    const body = { email: "ada@example.com" };
    for (let i = 0; i < 5; i++) expect((await post(auth, "/send-verification-email", "203.0.113.7", body)).status).not.toBe(429);
    const blocked = await post(auth, "/send-verification-email", "203.0.113.7", body);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("x-retry-after"))).toBeGreaterThan(0);
    expect((await post(auth, "/send-verification-email", "198.51.100.9", body)).status).not.toBe(429);
    const stored = await rows(tx);
    expect(stored.map((r) => r.key).sort()).toEqual(["198.51.100.9|/send-verification-email", "203.0.113.7|/send-verification-email"]);
    expect(stored.find((r) => r.key.startsWith("203."))!.count).toBe(5);
  });

  it("applies the wildcard sign-in rule (20 per 10 min), not the 100/min default", async () => {
    const tx = t();
    const auth = authWith(tx);
    const body = { provider: "google", callbackURL: "/app" };
    for (let i = 0; i < 20; i++) expect((await post(auth, "/sign-in/social", "203.0.113.7", body)).status).not.toBe(429);
    expect((await post(auth, "/sign-in/social", "203.0.113.7", body)).status).toBe(429);
    expect((await rows(tx)).map((r) => r.key)).toEqual(["203.0.113.7|/sign-in/social"]);
  });
});
