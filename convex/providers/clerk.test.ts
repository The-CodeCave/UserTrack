import { afterEach, describe, expect, it, vi } from "vitest";
import { clerk } from "./clerk";
import { ProviderError } from "./types";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const urls = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => new URL(String(c[0])));
const cfg = { secretKey: "sk_live_abcdefghijklmnop" };

afterEach(() => vi.unstubAllGlobals());

describe("clerk", () => {
  it("validates secret keys", () => {
    expect(clerk.validate({}, "users").ok).toBe(false);
    expect(clerk.validate({ secretKey: "pk_live_x" }, "users").ok).toBe(false);
    const v = clerk.validate({ secretKey: " sk_live_x " }, "users");
    expect(v.ok && v.config).toEqual({ secretKey: "sk_live_x" });
    expect(clerk.validate({ secretKey: "sk_test_x" }, "users").ok).toBe(true);
  });

  it("fetch issues five count calls with range filters", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      const q = new URL(url).searchParams;
      return json({ total_count: q.has("last_active_at_since") ? 7 : q.has("created_at_after") ? 3 : 100 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await clerk.fetch(cfg, "users")).toEqual({ totalUsers: 100, newUsers24h: 3, newUsers7d: 3, newUsers30d: 3, activeUsers30d: 7 });
    const u = urls(fetchMock);
    expect(u).toHaveLength(5);
    expect(u.every((x) => x.origin + x.pathname === "https://api.clerk.com/v1/users/count")).toBe(true);
    expect(u.filter((x) => x.searchParams.has("created_at_after"))).toHaveLength(3);
    expect(u.filter((x) => x.searchParams.has("last_active_at_since"))).toHaveLength(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toEqual({ Authorization: `Bearer ${cfg.secretKey}` });
  });

  it("retries once after a 429 honouring Retry-After", async () => {
    let first = true;
    const fetchMock = vi.fn(async () => {
      if (first) {
        first = false;
        return json({ errors: [] }, 429, { "retry-after": "0" });
      }
      return json({ total_count: 1 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await clerk.fetch(cfg, "users")).toMatchObject({ totalUsers: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("401 is a non-retryable ProviderError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 401)));
    const err = await clerk.fetch(cfg, "users").catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("401");
  });

  it("publicConfig masks the key", () => {
    const pub = clerk.publicConfig(cfg);
    expect(pub.key).toBe("sk_live_…mnop");
    expect(JSON.stringify(pub)).not.toContain("abcdefghijkl");
  });

  it("fetchHistory counts users created before each day boundary", async () => {
    const fetchMock = vi.fn(async (url: string) => json({ total_count: Number(new URL(url).searchParams.get("created_at_before")) % 1000 }));
    vi.stubGlobal("fetch", fetchMock);
    const h = await clerk.fetchHistory!(cfg, "users", 3);
    expect(h?.metric).toBe("totalUsers");
    expect(h?.points).toHaveLength(3);
    const u = urls(fetchMock);
    expect(u).toHaveLength(3);
    expect(u.every((x) => x.searchParams.has("created_at_before"))).toBe(true);
    const ends = u.map((x) => Number(x.searchParams.get("created_at_before"))).sort((a, b) => a - b);
    expect(ends[1] - ends[0]).toBe(86_400_000);
    expect(h?.points.map((p) => p.day)).toEqual(ends.map((e) => new Date(e - 1).toISOString().slice(0, 10)));
  });
});
