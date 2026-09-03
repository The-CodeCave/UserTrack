import { afterEach, describe, expect, it, vi } from "vitest";
import { explainStatus, metricsUrl, native, normalizeBaseUrl, parseMetrics, type NativeStoredConfig } from "./native";
import { HEADER_NONCE, HEADER_PROJECT, HEADER_SIGNATURE, METRICS_PATH, signedHeaders, verify } from "../lib/nativeProtocol";
import { ProviderError } from "./types";

const cfg: NativeStoredConfig = { url: "https://app.example.com/api/auth", source: "better-auth", secret: "ut_int_secret", secretHash: "h", secretPrefix: "ut_int_secr", projectId: "j57abc", createdAt: 1 };
const legacy = { protocolVersion: 1, pluginVersion: "0.1.0", provider: "better-auth", projectId: "j57abc", generatedAt: "2026-09-01T00:00:00Z", totalUsers: 120, newUsers: { "24h": 3, "7d": 10, "30d": 40 }, capabilities: { exactCounts: true, history: true, anonymousExcluded: false } };
const multi = {
  protocolVersion: 1, clientVersion: "0.1.0", source: "prisma", projectId: "j57abc", generatedAt: "2026-09-01T00:00:00Z",
  users: { totalUsers: 120, newUsers: { "24h": 3, "7d": 10, "30d": 40 }, daily: [{ day: "2026-08-31", newUsers: 2 }, { day: "2026-09-01", newUsers: 5 }] },
  activation: { activatedUsers: 60, activated24h: 1, activated7d: 4, activated30d: 12, daily: [{ day: "2026-09-01", activatedUsers: 1 }] },
  conversion: { convertedUsers: 12, newConverted24h: 0, newConverted7d: 1, newConverted30d: 3, trialUsers: 5, newTrials7d: 1, newTrials30d: 2, mode: "ever_paid" },
  identities: { signedUp: [{ id: "u1", at: "2026-09-01T00:00:00Z" }, { id: "bad@example.com" }], converted: [{ id: "u1" }], trial: ["u2"] },
  capabilities: { exactCounts: false, history: true, roles: ["users", "activation", "conversion"] },
};
const prismaCfg: NativeStoredConfig = { ...cfg, url: "https://app.example.com/api/usertrack", source: "prisma" };

async function signedResponse(body: unknown, req: Request, secret = cfg.secret, status = 200) {
  const text = JSON.stringify(body);
  const h = await signedHeaders(secret, cfg.projectId, { method: "RESPONSE", path: METRICS_PATH, body: text, nonce: req.headers.get(HEADER_NONCE)! });
  return new Response(text, { status, headers: { "content-type": "application/json", ...h } });
}
const respond = (body: unknown) => vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => signedResponse(body, new Request(url, init))));

afterEach(() => vi.unstubAllGlobals());

describe("validate / normalizeBaseUrl", () => {
  it("requires https except for localhost and defaults the path per source", () => {
    expect(normalizeBaseUrl("https://app.example.com")).toEqual({ ok: true, url: "https://app.example.com/api/auth" });
    expect(normalizeBaseUrl("https://app.example.com", "prisma")).toEqual({ ok: true, url: "https://app.example.com/api/usertrack" });
    expect(normalizeBaseUrl("https://app.example.com/auth/")).toEqual({ ok: true, url: "https://app.example.com/auth" });
    expect(normalizeBaseUrl("http://localhost:3000")).toEqual({ ok: true, url: "http://localhost:3000/api/auth" });
    expect(normalizeBaseUrl("http://app.example.com").ok).toBe(false);
    expect(normalizeBaseUrl("not a url", "custom").ok).toBe(false);
    expect(normalizeBaseUrl("https://app.example.com/api/auth?x=1").ok).toBe(false);
    expect(metricsUrl("https://app.example.com/api/auth", "better-auth")).toBe("https://app.example.com/api/auth/usertrack/metrics");
    expect(metricsUrl("https://app.example.com/api/usertrack", "drizzle")).toBe("https://app.example.com/api/usertrack/metrics");
  });
  it("rejects configs without a generated secret and defaults the source", () => {
    expect(native.validate({ url: "https://app.example.com" }, "users")).toMatchObject({ ok: false });
    expect(native.validate({ ...cfg }, "users")).toMatchObject({ ok: true, config: { url: cfg.url, projectId: "j57abc", source: "better-auth" } });
    expect(native.validate({ ...cfg, source: "mongo" }, "users")).toMatchObject({ ok: true, config: { source: "custom" } });
  });
  it("is verified, masks the secret and labels by source", () => {
    expect(native.trust(cfg, "https://other.com")).toBe("verified");
    const pub = native.publicConfig(cfg);
    expect(JSON.stringify(pub)).not.toContain("ut_int_secret");
    expect(pub).toMatchObject({ secret: "ut_int_secr…", source: "better-auth" });
    expect(native.labelFor!(cfg)).toBe("Better Auth");
    expect(native.labelFor!(prismaCfg)).toBe("Prisma (UserTrack SDK)");
    expect(native.labelFor!({ ...cfg, source: "custom" })).toBe("UserTrack SDK");
    expect(native.labelFor!({ ...cfg, source: undefined as never })).toBe("Better Auth");
  });
});

describe("parseMetrics", () => {
  it("reads the legacy users-only shape of the 0.1.x Better Auth plugin", () => {
    expect(parseMetrics(legacy, "users")).toMatchObject({ totalUsers: 120, newUsers24h: 3, newUsers7d: 10, newUsers30d: 40, sourceVersion: "0.1.0", protocolVersion: 1, reported: { roles: ["users"], history: true, identity: false, exactCounts: true } });
    expect(() => parseMetrics(legacy, "activation")).toThrow(/does not report activation/);
  });
  it("reads every role and identities of a multi-role response", () => {
    const users = parseMetrics(multi, "users");
    expect(users).toMatchObject({ totalUsers: 120, newUsers7d: 10, sourceVersion: "0.1.0", reported: { roles: ["users", "activation", "conversion"], identity: true, exactCounts: false } });
    expect(users.identities).toEqual([{ stage: "signed_up", ids: [{ id: "u1", at: Date.parse("2026-09-01T00:00:00Z") }], complete: true }]);
    expect(parseMetrics(multi, "activation")).toMatchObject({ activatedUsers: 60, activated24h: 1, activated7d: 4, activated30d: 12 });
    const conversion = parseMetrics(multi, "conversion");
    expect(conversion).toMatchObject({ convertedUsers: 12, newConverted7d: 1, newConverted30d: 3, trialUsers: 5, newTrials7d: 1, newTrials30d: 2, conversionMode: "ever_paid" });
    expect(conversion.identities?.map((i) => i.stage)).toEqual(["trial", "converted"]);
    expect(() => parseMetrics(multi, "traffic")).toThrow(/traffic/);
    expect(() => parseMetrics({ ...multi, users: { totalUsers: -1 } }, "users")).toThrow(/not a valid count/);
  });
});

describe("fetch", () => {
  it("signs the request, verifies the signed response and maps metrics", async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      const req = new Request(url, init);
      expect(url).toBe("https://app.example.com/api/usertrack/metrics");
      expect(req.headers.get(HEADER_PROJECT)).toBe("j57abc");
      const ok = await verify(cfg.secret, req.headers, { method: "REQUEST", path: METRICS_PATH, body: String(init.body) });
      expect(ok.ok).toBe(true);
      return signedResponse(multi, req);
    });
    vi.stubGlobal("fetch", fetch);
    expect(await native.fetch(prismaCfg, "users")).toMatchObject({ totalUsers: 120, newUsers24h: 3, sourceVersion: "0.1.0", protocolVersion: 1 });
    expect(await native.fetch(prismaCfg, "conversion")).toMatchObject({ convertedUsers: 12 });
  });
  it("rejects a response signed with another secret or bound to a different nonce", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => signedResponse(legacy, new Request(url, init), "wrong")));
    await expect(native.fetch(cfg, "users")).rejects.toThrow(/signature verification/);
    vi.stubGlobal("fetch", vi.fn(async () => {
      const text = JSON.stringify(legacy);
      const h = await signedHeaders(cfg.secret, cfg.projectId, { method: "RESPONSE", path: METRICS_PATH, body: text, nonce: "someone-elses-nonce" });
      return new Response(text, { status: 200, headers: h });
    }));
    await expect(native.fetch(cfg, "users")).rejects.toThrow(/signature verification/);
  });
  it("explains 404 per source, 401 (secret mismatch) as non-retryable, 5xx as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not Found", { status: 404 })));
    await expect(native.fetch(cfg, "users")).rejects.toMatchObject({ retryable: false, message: expect.stringMatching(/No UserTrack plugin found.*@usertrack\/better-auth/) });
    await expect(native.fetch(prismaCfg, "users")).rejects.toMatchObject({ retryable: false, message: expect.stringMatching(/No UserTrack handler found at https:\/\/app.example.com\/api\/usertrack\/metrics.*@usertrack\/node/) });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "USERTRACK_UNAUTHORIZED" }, { status: 401 })));
    await expect(native.fetch(cfg, "users")).rejects.toMatchObject({ retryable: false, message: expect.stringMatching(/USERTRACK_SECRET/) });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "USERTRACK_STALE_REQUEST" }, { status: 401 })));
    await expect(native.fetch(cfg, "users")).rejects.toMatchObject({ retryable: true, message: expect.stringMatching(/clock/) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await expect(native.fetch(cfg, "users")).rejects.toMatchObject({ retryable: true });
    expect(explainStatus(429, undefined, cfg.url).retryable).toBe(true);
    expect(explainStatus(502, undefined, cfg.url)).toMatchObject({ retryable: true, message: expect.stringMatching(/not reachable/) });
  });
  it("treats network failures as retryable and secret-free", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const err = await native.fetch(cfg, "users").catch((e: unknown) => e as ProviderError);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(true);
    expect((err as Error).message).not.toContain("ut_int_secret");
  });
  it("rejects unsupported protocol versions, outdated clients and foreign project ids", async () => {
    respond({ ...legacy, protocolVersion: 2 });
    await expect(native.fetch(cfg, "users")).rejects.toThrow(/protocol version 2/);
    respond({ ...legacy, pluginVersion: "0.0.1" });
    await expect(native.fetch(cfg, "users")).rejects.toThrow(/outdated/);
    respond({ ...multi, clientVersion: "0.0.1" });
    await expect(native.fetch(prismaCfg, "users")).rejects.toThrow(/@usertrack\/node 0.0.1 is outdated/);
    respond({ ...legacy, projectId: "other" });
    await expect(native.fetch(cfg, "users")).rejects.toThrow(/different UserTrack project/);
  });
  it("falls back to Better Auth semantics for rows created before the migration (no source)", async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => { expect(url).toBe("https://app.example.com/api/auth/usertrack/metrics"); return signedResponse(legacy, new Request(url, init)); });
    vi.stubGlobal("fetch", fetch);
    expect(await native.fetch({ ...cfg, source: undefined as never }, "users")).toMatchObject({ totalUsers: 120 });
  });
  it("fetchHistory maps users and activation daily series and skips conversion", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({ protocolVersion: 1, days: 30 });
      return signedResponse(multi, new Request(url, init));
    }));
    expect(await native.fetchHistory!(prismaCfg, "users", 30)).toEqual({ metric: "newUsers", points: [{ day: "2026-08-31", value: 2 }, { day: "2026-09-01", value: 5 }] });
    expect(await native.fetchHistory!(prismaCfg, "activation", 30)).toEqual({ metric: "activatedUsers", points: [{ day: "2026-09-01", value: 1 }] });
    expect(await native.fetchHistory!(prismaCfg, "conversion", 30)).toBeNull();
    respond(legacy);
    expect(await native.fetchHistory!(cfg, "users", 30)).toBeNull();
  });
});

describe("registry", () => {
  it("is registered as a verified multi-role provider; describe() follows the last pull", async () => {
    const { getProvider, providerLabel, verificationLevel } = await import("./index");
    const p = getProvider("native");
    expect(getProvider("better_auth")).toBe(p);
    expect(p.label).toBe("My app (SDK)");
    expect(p.roles).toEqual(["users", "activation", "conversion"]);
    expect(p.describe!(cfg, "users")).toMatchObject({ totalUsers: true, createdUsers: true, historicalUsers: true, retention: false, identity: false });
    expect(p.describe!({ ...cfg, reported: { roles: ["users"], history: false, identity: true, exactCounts: true } }, "users")).toMatchObject({ historicalUsers: false, identity: true });
    expect(p.describe!(cfg, "conversion")).toMatchObject({ trial: true, converted: true });
    expect(verificationLevel("native", "verified", p.describe!(cfg, "users"), "users")).toBe("verified");
    expect(providerLabel("better_auth", cfg)).toBe("Better Auth");
  });
  it(HEADER_SIGNATURE, () => expect(HEADER_SIGNATURE).toBe("x-usertrack-signature"));
});
