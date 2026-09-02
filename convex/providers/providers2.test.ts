import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { firebase } from "./firebase";
import { auth0 } from "./auth0";
import { posthog } from "./posthog";
import { plausible } from "./plausible";
import { ga4 } from "./ga4";
import { stripe } from "./stripe";
import { signServiceAccountJwt } from "./google";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const calls = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => String(c[0]));

let serviceAccount = "";
beforeAll(async () => {
  const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  const private_key = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  serviceAccount = JSON.stringify({ client_email: "sa@proj.iam.gserviceaccount.com", private_key, project_id: "proj-1" });
});
afterEach(() => vi.unstubAllGlobals());

describe("validation", () => {
  it("firebase", () => {
    expect(firebase.validate({ serviceAccount: "nope" }, "users").ok).toBe(false);
    expect(firebase.validate({ serviceAccount: JSON.stringify({ client_email: "a@b", private_key: "PRIVATE KEY" }), projectId: "Bad_ID" }, "users").ok).toBe(false);
    const v = firebase.validate({ serviceAccount, projectId: " my-proj " }, "users");
    expect(v.ok && v.config.projectId).toBe("my-proj");
    const v2 = firebase.validate({ serviceAccount }, "users");
    expect(v2.ok && v2.config.projectId).toBe("proj-1");
    expect(firebase.publicConfig({ serviceAccount, projectId: "proj-1" })).toEqual({ project: "proj-1", account: "sa@proj.iam.gserviceaccount.com", signups: "createdAt scan (≤100k accounts)" });
  });
  it("auth0", () => {
    expect(auth0.validate({ domain: "acme.auth0.com", clientId: "abc", clientSecret: "" }, "users").ok).toBe(false);
    expect(auth0.validate({ domain: "bad domain", clientId: "abc", clientSecret: "s" }, "users").ok).toBe(false);
    const v = auth0.validate({ domain: "https://Acme.eu.auth0.com/", clientId: "abcdefgh", clientSecret: "supersecret" }, "users");
    expect(v.ok && v.config.domain).toBe("acme.eu.auth0.com");
    if (!v.ok) return;
    const pub = auth0.publicConfig(v.config);
    expect(pub).toEqual({ domain: "acme.eu.auth0.com", clientId: "abcdef…" });
    expect(JSON.stringify(pub)).not.toContain("supersecret");
  });
  it("posthog", () => {
    expect(posthog.validate({ projectId: "12", apiKey: "phx_1" }, "activation").ok).toBe(false);
    expect(posthog.validate({ projectId: "12", apiKey: "phx_1", activationEvent: "it's" }, "activation").ok).toBe(false);
    expect(posthog.validate({ projectId: "abc", apiKey: "phx_1" }, "traffic").ok).toBe(false);
    expect(posthog.validate({ host: "http://x.com", projectId: "1", apiKey: "phx_1" }, "traffic").ok).toBe(false);
    const v = posthog.validate({ host: "https://eu.posthog.com/", projectId: "12", apiKey: "phx_secret", activationEvent: "signed_up" }, "activation");
    expect(v.ok && v.config.host).toBe("https://eu.posthog.com");
    const t = posthog.validate({ projectId: "12", apiKey: "phx_secret" }, "traffic");
    expect(t.ok && t.config.host).toBe("https://us.posthog.com");
    if (!v.ok) return;
    const pub = posthog.publicConfig(v.config);
    expect(pub).toEqual({ host: "eu.posthog.com", project: "12", event: "signed_up" });
    expect(JSON.stringify(pub)).not.toContain("phx_secret");
  });
  it("plausible", () => {
    expect(plausible.validate({ siteId: "", apiKey: "k" }, "traffic").ok).toBe(false);
    expect(plausible.validate({ siteId: "acme.com", apiKey: "" }, "traffic").ok).toBe(false);
    const v = plausible.validate({ siteId: "https://Acme.com/", apiKey: "secretkey", host: "https://stats.acme.com/" }, "traffic");
    expect(v.ok && v.config).toEqual({ siteId: "acme.com", apiKey: "secretkey", host: "https://stats.acme.com" });
    if (!v.ok) return;
    expect(plausible.publicConfig(v.config)).toEqual({ site: "acme.com" });
  });
  it("ga4", () => {
    expect(ga4.validate({ propertyId: "abc", serviceAccount }, "traffic").ok).toBe(false);
    expect(ga4.validate({ propertyId: "123", serviceAccount: "{}" }, "traffic").ok).toBe(false);
    const v = ga4.validate({ propertyId: "properties/123456", serviceAccount }, "traffic");
    expect(v.ok && v.config.propertyId).toBe("123456");
    if (!v.ok) return;
    const pub = ga4.publicConfig(v.config);
    expect(pub).toEqual({ property: "123456", account: "sa@proj.iam.gserviceaccount.com" });
    expect(JSON.stringify(pub)).not.toContain("PRIVATE KEY");
  });
  it("stripe", () => {
    expect(stripe.validate({ secretKey: "pk_live_x" }, "revenue").ok).toBe(false);
    for (const k of ["sk_live_", "sk_test_", "rk_live_", "rk_test_"]) expect(stripe.validate({ secretKey: `${k}abcdefghijkl` }, "revenue").ok).toBe(true);
    const pub = stripe.publicConfig({ secretKey: "sk_live_abcdefghijklmnop" });
    expect(pub.key).toBe("sk_live_…mnop");
    expect(pub.key).not.toContain("abcdefghijkl");
  });
});

describe("fetch parsing", () => {
  it("auth0 totals, ranges, active users and history", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/oauth/token")) return json({ access_token: "tok" });
      if (url.includes("/api/v2/stats/active-users")) return json(42);
      if (url.includes("/api/v2/stats/daily")) return json([{ date: "2024-01-02T00:00:00.000Z", signups: 3, logins: 9 }, { date: "2024-01-01T00:00:00.000Z", signups: 1, logins: 5 }]);
      const q = new URL(url).searchParams.get("q");
      return json({ total: q ? 10 : 100 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const cfg = { domain: "acme.auth0.com", clientId: "id", clientSecret: "sec" };
    expect(await auth0.fetch(cfg, "users")).toEqual({ totalUsers: 100, newUsers24h: 10, newUsers7d: 10, newUsers30d: 10, activeUsers30d: 42 });
    expect(calls(fetchMock).filter((u) => u.includes("q=created_at")).length).toBe(3);
    expect(await auth0.fetchHistory!(cfg, "users", 30)).toEqual({ metric: "newUsers", points: [{ day: "2024-01-01", value: 1 }, { day: "2024-01-02", value: 3 }] });
  });
  it("posthog activation + cumulative history", async () => {
    const queries: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const q = (JSON.parse(String(init?.body)) as { query: { query: string } }).query.query;
      queries.push(q);
      if (q.includes("toDate")) return json({ results: [["2024-01-01", 2], ["2024-01-02", 3]] });
      if (q.includes("interval 1 day")) return json({ results: [[1]] });
      if (q.includes("interval 7 day")) return json({ results: [[7]] });
      if (q.includes("interval 30 day")) return json({ results: [[30]] });
      return json({ results: [[500]] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const cfg = { host: "https://us.posthog.com", projectId: "1", apiKey: "phx_k", activationEvent: "signed_up" };
    expect(await posthog.fetch(cfg, "activation")).toEqual({ activatedUsers: 500, activated24h: 1, activated7d: 7, activated30d: 30 });
    expect(queries.every((q) => q.includes("event = 'signed_up'"))).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("https://us.posthog.com/api/projects/1/query");
    expect(await posthog.fetchHistory!(cfg, "activation", 30)).toEqual({ metric: "activatedUsers", points: [{ day: "2024-01-01", value: 497 }, { day: "2024-01-02", value: 500 }] });
  });
  it("posthog traffic", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => (String(init?.body).includes("interval 60 day") ? json({ results: [[80]] }) : json({ results: [[120, 300]] }))));
    expect(await posthog.fetch({ host: "https://us.posthog.com", projectId: "1", apiKey: "k" }, "traffic")).toEqual({ visitors30d: 120, sessions30d: 300, visitorsPrev30d: 80 });
  });
  it("plausible aggregate derives visitorsPrev30d from change", async () => {
    const fetchMock = vi.fn(async () => json({ results: { visitors: { value: 150, change: 50 }, visits: { value: 200, change: 10 } } }));
    vi.stubGlobal("fetch", fetchMock);
    const cfg = { siteId: "acme.com", apiKey: "k", host: "https://plausible.io" };
    expect(await plausible.fetch(cfg, "traffic")).toEqual({ visitors30d: 150, sessions30d: 200, visitorsPrev30d: 100 });
    expect(calls(fetchMock)[0]).toContain("https://plausible.io/api/v1/stats/aggregate?site_id=acme.com");
    vi.stubGlobal("fetch", vi.fn(async () => json({ results: { visitors: { value: 5 }, visits: { value: 6 } } })));
    expect(await plausible.fetch(cfg, "traffic")).toEqual({ visitors30d: 5, sessions30d: 6 });
    vi.stubGlobal("fetch", vi.fn(async () => json({ results: [{ date: "2024-01-01", visitors: 4 }] })));
    expect(await plausible.fetchHistory!(cfg, "traffic", 7)).toEqual({ metric: "visitors", points: [{ day: "2024-01-01", value: 4 }] });
  });
  it("stripe MRR normalization + pagination", async () => {
    const price = (unit_amount: number | null, interval: string, interval_count = 1, currency = "usd") => ({ unit_amount, currency, recurring: { interval, interval_count } });
    const page1 = {
      has_more: true,
      data: [
        { id: "sub_1", customer: "cus_a", items: { data: [{ price: price(1000, "month"), quantity: 2 }] } },
        { id: "sub_2", customer: "cus_b", items: { data: [{ price: price(12000, "year") }, { price: price(null, "month") }] } },
      ],
    };
    const page2 = { has_more: false, data: [{ id: "sub_3", customer: "cus_a", items: { data: [{ price: price(3000, "month", 3), quantity: 1 }] } }] };
    const fetchMock = vi.fn(async (url: string) => json(url.includes("starting_after=sub_2") ? page2 : page1));
    vi.stubGlobal("fetch", fetchMock);
    expect(await stripe.fetch({ secretKey: "sk_test_x" }, "revenue")).toEqual({ payingUsers: 2, mrr: 4000, currency: "USD" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls(fetchMock)[0]).toBe("https://api.stripe.com/v1/subscriptions?status=active&limit=100&expand[]=data.items.data.price");
  });
  it("ga4 row mapping", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "t" });
      const body = JSON.parse(String(init?.body)) as { dimensions?: unknown };
      if (body.dimensions) return json({ rows: [{ dimensionValues: [{ value: "20240102" }], metricValues: [{ value: "7" }] }, { dimensionValues: [{ value: "20240101" }], metricValues: [{ value: "5" }] }] });
      return json({
        rows: [
          { dimensionValues: [{ value: "date_range_1" }], metricValues: [{ value: "80" }, { value: "90" }] },
          { dimensionValues: [{ value: "date_range_0" }], metricValues: [{ value: "100" }, { value: "150" }] },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const cfg = { propertyId: "123", serviceAccount };
    expect(await ga4.fetch(cfg, "traffic")).toEqual({ visitors30d: 100, sessions30d: 150, visitorsPrev30d: 80 });
    expect(calls(fetchMock)[1]).toBe("https://analyticsdata.googleapis.com/v1beta/properties/123:runReport");
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer t" });
    expect(await ga4.fetchHistory!(cfg, "traffic", 30)).toEqual({ metric: "visitors", points: [{ day: "2024-01-01", value: 5 }, { day: "2024-01-02", value: 7 }] });
  });
  it("firebase accounts:query + createdAt scan", async () => {
    const now = Date.now();
    const users = [{ localId: "a", email: "a@x.com", createdAt: String(now - 3_600_000) }, { localId: "b", createdAt: String(now - 3 * 86_400_000) }, { localId: "c", createdAt: String(now - 40 * 86_400_000) }];
    const fetchMock = vi.fn(async (url: string) => (url.includes("oauth2") ? json({ access_token: "t" }) : url.includes("batchGet") ? json(url.includes("nextPageToken=p2") ? { users: [users[2]] } : { users: users.slice(0, 2), nextPageToken: "p2" }) : json({ recordsCount: "123" })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await firebase.fetch({ serviceAccount, projectId: "proj-1" }, "users")).toEqual({ totalUsers: 123, newUsers24h: 1, newUsers7d: 2, newUsers30d: 2 });
    expect(calls(fetchMock)[1]).toBe("https://identitytoolkit.googleapis.com/v1/projects/proj-1/accounts:query");
    expect(calls(fetchMock)[2]).toContain("accounts:batchGet?maxResults=1000");
    expect(await firebase.fetch({ serviceAccount, projectId: "proj-1", scanSignups: false }, "users")).toEqual({ totalUsers: 123 });
    const h = await firebase.fetchHistory!({ serviceAccount, projectId: "proj-1" }, "users", 7);
    expect(h?.metric).toBe("newUsers");
    expect(h?.points.reduce((a, p) => a + p.value, 0)).toBe(2);
  });
  it("signServiceAccountJwt produces an RS256 JWT", async () => {
    const jwt = await signServiceAccountJwt(JSON.parse(serviceAccount), "scope");
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    const header = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
  });
});
