import { afterEach, describe, expect, it, vi } from "vitest";
import { betterAuth, explainStatus, normalizeBaseUrl, type BetterAuthStoredConfig } from "./betterAuth";
import { HEADER_NONCE, HEADER_PROJECT, HEADER_SIGNATURE, METRICS_PATH, signedHeaders, verify } from "../lib/betterAuthProtocol";
import { ProviderError } from "./types";

const cfg: BetterAuthStoredConfig = { url: "https://app.example.com/api/auth", secret: "ut_int_secret", secretHash: "h", secretPrefix: "ut_int_secr", projectId: "j57abc", createdAt: 1 };
const metrics = { protocolVersion: 1, pluginVersion: "0.1.0", provider: "better-auth", projectId: "j57abc", generatedAt: "2026-09-01T00:00:00Z", totalUsers: 120, newUsers: { "24h": 3, "7d": 10, "30d": 40 }, capabilities: { exactCounts: true, history: true, anonymousExcluded: false } };

async function signedResponse(body: unknown, req: Request, secret = cfg.secret, status = 200) {
  const text = JSON.stringify(body);
  const h = await signedHeaders(secret, cfg.projectId, { method: "RESPONSE", path: METRICS_PATH, body: text, nonce: req.headers.get(HEADER_NONCE)! });
  return new Response(text, { status, headers: { "content-type": "application/json", ...h } });
}

afterEach(() => vi.unstubAllGlobals());

describe("validate / normalizeBaseUrl", () => {
  it("requires https except for localhost and defaults the path to /api/auth", () => {
    expect(normalizeBaseUrl("https://app.example.com")).toEqual({ ok: true, url: "https://app.example.com/api/auth" });
    expect(normalizeBaseUrl("https://app.example.com/auth/")).toEqual({ ok: true, url: "https://app.example.com/auth" });
    expect(normalizeBaseUrl("http://localhost:3000")).toEqual({ ok: true, url: "http://localhost:3000/api/auth" });
    expect(normalizeBaseUrl("http://app.example.com").ok).toBe(false);
    expect(normalizeBaseUrl("not a url").ok).toBe(false);
    expect(normalizeBaseUrl("https://app.example.com/api/auth?x=1").ok).toBe(false);
  });
  it("rejects configs without a generated secret", () => {
    expect(betterAuth.validate({ url: "https://app.example.com" }, "users")).toMatchObject({ ok: false });
    expect(betterAuth.validate({ ...cfg }, "users")).toMatchObject({ ok: true, config: { url: cfg.url, projectId: "j57abc" } });
  });
  it("is verified and masks the secret in publicConfig", () => {
    expect(betterAuth.trust(cfg, "https://other.com")).toBe("verified");
    const pub = betterAuth.publicConfig(cfg);
    expect(JSON.stringify(pub)).not.toContain("ut_int_secret");
    expect(pub.secret).toBe("ut_int_secr…");
  });
});

describe("fetch", () => {
  it("signs the request, verifies the signed response and maps metrics", async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      const req = new Request(url, init);
      expect(url).toBe("https://app.example.com/api/auth/usertrack/metrics");
      expect(req.headers.get(HEADER_PROJECT)).toBe("j57abc");
      const ok = await verify(cfg.secret, req.headers, { method: "REQUEST", path: METRICS_PATH, body: String(init.body) });
      expect(ok.ok).toBe(true);
      return signedResponse(metrics, req);
    });
    vi.stubGlobal("fetch", fetch);
    const m = await betterAuth.fetch(cfg, "users");
    expect(m).toMatchObject({ totalUsers: 120, newUsers24h: 3, newUsers7d: 10, newUsers30d: 40, sourceVersion: "0.1.0", protocolVersion: 1 });
  });
  it("rejects a response signed with another secret", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => signedResponse(metrics, new Request(url, init), "wrong")));
    await expect(betterAuth.fetch(cfg, "users")).rejects.toThrow(/signature verification/);
  });
  it("rejects a response bound to a different nonce (replay)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const text = JSON.stringify(metrics);
      const h = await signedHeaders(cfg.secret, cfg.projectId, { method: "RESPONSE", path: METRICS_PATH, body: text, nonce: "someone-elses-nonce" });
      return new Response(text, { status: 200, headers: h });
    }));
    await expect(betterAuth.fetch(cfg, "users")).rejects.toThrow(/signature verification/);
  });
  it("explains 404 (plugin missing) and 401 (secret mismatch) as non-retryable, 5xx as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not Found", { status: 404 })));
    await expect(betterAuth.fetch(cfg, "users")).rejects.toMatchObject({ retryable: false, message: expect.stringMatching(/No UserTrack plugin found/) });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "USERTRACK_UNAUTHORIZED" }, { status: 401 })));
    await expect(betterAuth.fetch(cfg, "users")).rejects.toMatchObject({ retryable: false, message: expect.stringMatching(/USERTRACK_SECRET/) });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "USERTRACK_STALE_REQUEST" }, { status: 401 })));
    await expect(betterAuth.fetch(cfg, "users")).rejects.toMatchObject({ retryable: true, message: expect.stringMatching(/clock/) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await expect(betterAuth.fetch(cfg, "users")).rejects.toMatchObject({ retryable: true });
    expect(explainStatus(429, undefined, cfg.url).retryable).toBe(true);
  });
  it("treats network failures as retryable and secret-free", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const err = await betterAuth.fetch(cfg, "users").catch((e) => e as ProviderError);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(true);
    expect((err as Error).message).not.toContain("ut_int_secret");
  });
  it("rejects unsupported protocol versions, outdated plugins and foreign project ids", async () => {
    const respond = (body: unknown) => vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => signedResponse(body, new Request(url, init))));
    respond({ ...metrics, protocolVersion: 2 });
    await expect(betterAuth.fetch(cfg, "users")).rejects.toThrow(/protocol version 2/);
    respond({ ...metrics, pluginVersion: "0.0.1" });
    await expect(betterAuth.fetch(cfg, "users")).rejects.toThrow(/outdated/);
    respond({ ...metrics, projectId: "other" });
    await expect(betterAuth.fetch(cfg, "users")).rejects.toThrow(/different UserTrack project/);
    respond({ ...metrics, totalUsers: -1 });
    await expect(betterAuth.fetch(cfg, "users")).rejects.toThrow(/not a valid count/);
  });
  it("fetchHistory requests a daily series and maps it to newUsers points", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({ protocolVersion: 1, days: 30 });
      return signedResponse({ ...metrics, daily: [{ day: "2026-08-31", newUsers: 2 }, { day: "2026-09-01", newUsers: 5 }] }, new Request(url, init));
    }));
    expect(await betterAuth.fetchHistory!(cfg, "users", 30)).toEqual({ metric: "newUsers", points: [{ day: "2026-08-31", value: 2 }, { day: "2026-09-01", value: 5 }] });
  });
});

describe("registry", () => {
  it("is registered as a verified users provider with range + history capabilities", async () => {
    const { getProvider, capabilitiesFromList, verificationLevel } = await import("./index");
    const p = getProvider("better_auth");
    expect(p.label).toBe("Better Auth");
    const caps = capabilitiesFromList(p.capabilities, "users");
    expect(caps).toMatchObject({ totalUsers: true, createdUsers: true, historicalUsers: true, retention: false, identity: false });
    expect(verificationLevel("better_auth", "verified", caps, "users")).toBe("verified");
  });
  it(HEADER_SIGNATURE, () => expect(HEADER_SIGNATURE).toBe("x-usertrack-signature"));
});
