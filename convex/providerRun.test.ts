import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionCtx } from "./_generated/server";
import { BLOCKED_HOST_ERROR } from "./lib/ssrf";
import { assertPublicHosts, fetchHistory, fetchMetrics } from "./providerRun";

afterEach(() => vi.unstubAllGlobals());

const ctx = {} as ActionCtx;
const endpointCfg = { url: "https://api.acme.com/metrics", token: "t" };

// Routes DoH lookups to a canned answer and everything else to the provider stub.
const stub = (address: string | null, provider: () => Response) => {
  const fetch = vi.fn(async (url: string) => {
    if (url.startsWith("https://cloudflare-dns.com/")) return Response.json({ Answer: address && url.includes("type=A") ? [{ type: 1, data: address }] : [] });
    return provider();
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

describe("fetch-time SSRF guard", () => {
  it("refuses a host that resolves to a private address with one generic, non-retryable error", async () => {
    const fetch = stub("10.0.0.7", () => Response.json({ totalUsers: 5 }));
    await expect(fetchMetrics(ctx, "endpoint", endpointCfg, "users")).rejects.toMatchObject({ message: BLOCKED_HOST_ERROR, retryable: false });
    await expect(fetchMetrics(ctx, "endpoint", endpointCfg, "users")).rejects.toMatchObject({ message: BLOCKED_HOST_ERROR });
    expect(fetch.mock.calls.every(([url]) => String(url).startsWith("https://cloudflare-dns.com/"))).toBe(true);
  });

  it("lets a public host through and calls the provider", async () => {
    stub("93.184.216.34", () => Response.json({ totalUsers: 5 }));
    expect(await fetchMetrics(ctx, "endpoint", endpointCfg, "users")).toMatchObject({ totalUsers: 5 });
  });

  it("blocks stored legacy configs with private literals before any DNS or HTTP request", async () => {
    const fetch = stub("93.184.216.34", () => Response.json({ totalUsers: 5 }));
    await expect(fetchMetrics(ctx, "endpoint", { url: "https://169.254.169.254/latest/meta-data", token: "" }, "users")).rejects.toMatchObject({ message: BLOCKED_HOST_ERROR });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("guards backfills too and treats an unresolvable host as blocked", async () => {
    stub(null, () => Response.json({ results: [] }));
    await expect(fetchHistory(ctx, "plausible", { host: "https://plausible.acme.com", siteId: "acme.com", apiKey: "k" }, "traffic", 30)).rejects.toMatchObject({ message: BLOCKED_HOST_ERROR });
    await expect(assertPublicHosts([])).resolves.toBeUndefined();
  });

  it("does not resolve vendor-only providers (no hosts())", async () => {
    const fetch = stub("10.0.0.1", () => Response.json({}));
    await fetchMetrics(ctx, "manual", { totalUsers: 3 }, "users").catch(() => undefined);
    expect(fetch).not.toHaveBeenCalled();
  });
});
