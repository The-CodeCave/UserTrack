import { describe, expect, it, vi } from "vitest";
import { analyticsConfig, trackEvent } from "./analytics";

describe("analyticsConfig", () => {
  it("is disabled until RYBBIT_SITE_ID is set on the deployment", () => {
    expect(analyticsConfig({})).toBeNull();
    expect(analyticsConfig({ RYBBIT_SITE_ID: "" })).toBeNull();
  });

  it("derives host, hostname and key from the deployment env", () => {
    expect(analyticsConfig({ RYBBIT_SITE_ID: "abc", SITE_URL: "https://usertrack.dev", RYBBIT_API_KEY: "k" })).toEqual({ host: "https://rybbit.internal.thecodecave.de", siteId: "abc", apiKey: "k", hostname: "usertrack.dev" });
    expect(analyticsConfig({ RYBBIT_SITE_ID: "abc", RYBBIT_HOST: "https://r.example/" })).toMatchObject({ host: "https://r.example", apiKey: undefined, hostname: "usertrack.dev" });
  });
});

describe("trackEvent", () => {
  it("does nothing when disabled", async () => {
    const f = vi.fn();
    await trackEvent("webhook_delivered", { ok: true, attempt: 1 }, {}, f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });

  it("posts a custom_event with stringified properties", async () => {
    const f = vi.fn(async () => new Response(null));
    await trackEvent("sync_completed", { provider: "clerk", role: "users", ok: false }, { RYBBIT_SITE_ID: "abc", SITE_URL: "https://usertrack.dev" }, f);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://rybbit.internal.thecodecave.de/api/track");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ site_id: "abc", type: "custom_event", event_name: "sync_completed", hostname: "usertrack.dev", pathname: "/_convex" });
    expect(JSON.parse(body.properties)).toEqual({ provider: "clerk", role: "users", ok: "false" });
  });

  it("never throws", async () => {
    const f = vi.fn(async () => { throw new Error("down"); });
    await expect(trackEvent("webhook_delivered", { ok: false, attempt: 3 }, { RYBBIT_SITE_ID: "abc" }, f)).resolves.toBeUndefined();
  });
});
