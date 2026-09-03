import { afterEach, describe, expect, it, vi } from "vitest";
import { auth0 } from "./auth0";
import { endpoint } from "./endpoint";
import { native } from "./native";
import { plausible } from "./plausible";
import { posthog } from "./posthog";
import { supabase } from "./supabase";
import { FETCH_TIMEOUT_MS, ProviderError, REDIRECT_ERROR, fetchJson } from "./types";

afterEach(() => vi.unstubAllGlobals());

const PRIVATE = ["https://10.0.0.1", "https://127.0.0.1:8443", "https://169.254.169.254", "https://[::1]", "https://localhost", "https://db.internal", "https://2130706433", "https://0x7f000001"];

describe("provider validate refuses private / internal hosts", () => {
  it("endpoint (any port) and native (any port)", () => {
    for (const url of PRIVATE) {
      expect(endpoint.validate({ url: `${url}/metrics`, token: "t" }, "users").ok, url).toBe(false);
      expect(native.validate({ url, source: "prisma", secret: "ut_int_x", projectId: "p" }, "users").ok, url).toBe(false);
    }
    expect(endpoint.validate({ url: "https://api.acme.com:8080/metrics", token: "t" }, "users").ok).toBe(true);
    expect(endpoint.validate({ url: "https://u:p@api.acme.com/metrics", token: "t" }, "users")).toEqual({ ok: false, error: "Credentials in the URL are not allowed" });
    expect(native.validate({ url: "https://app.acme.com:3001", source: "prisma", secret: "ut_int_x", projectId: "p" }, "users").ok).toBe(true);
  });

  it("posthog, plausible, supabase (api) and auth0 — standard ports only", () => {
    for (const host of PRIVATE) {
      expect(posthog.validate({ host, projectId: "1", apiKey: "k" }, "traffic").ok, host).toBe(false);
      expect(plausible.validate({ host, siteId: "acme.com", apiKey: "k" }, "traffic").ok, host).toBe(false);
    }
    expect(posthog.validate({ host: "https://ph.acme.com:8000", projectId: "1", apiKey: "k" }, "traffic")).toEqual({ ok: false, error: "Only ports 443 and 8443 are allowed" });
    expect(posthog.validate({ host: "https://ph.acme.com:8443", projectId: "1", apiKey: "k" }, "traffic").ok).toBe(true);
    expect(plausible.validate({ host: "https://plausible.acme.com", siteId: "acme.com", apiKey: "k" }, "traffic").ok).toBe(true);
    expect(supabase.validate({ url: "https://x.supabase.co:5432", serviceKey: "k".repeat(30) }, "users")).toEqual({ ok: false, error: "Only ports 443 and 8443 are allowed" });
    expect(auth0.validate({ domain: "10.0.0.1", clientId: "abc", clientSecret: "s" }, "users").ok).toBe(false);
    expect(auth0.validate({ domain: "login.internal", clientId: "abc", clientSecret: "s" }, "users").ok).toBe(false);
    expect(auth0.validate({ domain: "login.acme.com", clientId: "abc", clientSecret: "s" }, "users").ok).toBe(true);
  });

  it("exposes the founder-supplied hosts for the fetch-time DNS check", () => {
    expect(endpoint.hosts!({ url: "https://api.acme.com:8080/metrics", token: "" })).toEqual(["api.acme.com"]);
    expect(posthog.hosts!({ host: "https://eu.posthog.com", projectId: "1", apiKey: "k" })).toEqual(["eu.posthog.com"]);
    expect(plausible.hosts!({ host: "https://plausible.io", siteId: "acme.com", apiKey: "k" })).toEqual(["plausible.io"]);
    expect(supabase.hosts!({ mode: "api", url: "https://x.supabase.co" })).toEqual(["x.supabase.co"]);
    expect(supabase.hosts!({ mode: "database", connectionString: "postgresql://a:b@db.x.supabase.co/postgres" })).toEqual([]);
    expect(auth0.hosts!({ domain: "login.acme.com", clientId: "a", clientSecret: "b" })).toEqual(["login.acme.com"]);
    expect(native.hosts!({ url: "https://app.acme.com/api/auth", source: "better-auth", secret: "", secretHash: "", secretPrefix: "", createdAt: 0, projectId: "p" })).toEqual(["app.acme.com"]);
  });
});

describe("fetchJson", () => {
  it("never follows redirects, bounds every request and reports 3xx as a configuration error", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://10.0.0.1/" } }));
    vi.stubGlobal("fetch", fetch);
    const err = await fetchJson("https://api.acme.com/x").catch((e: unknown) => e as ProviderError);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ message: REDIRECT_ERROR, retryable: false });
    const init = fetch.mock.calls[0][1 as never] as RequestInit;
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(FETCH_TIMEOUT_MS).toBe(15_000);
  });

  it("keeps caller headers while adding the defaults", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: 1 }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchJson("https://api.acme.com/x", { headers: { Authorization: "Bearer t" } })).toEqual({ ok: 1 });
    expect(fetch.mock.calls[0][1 as never]).toMatchObject({ redirect: "manual", headers: { Authorization: "Bearer t" } });
  });
});
