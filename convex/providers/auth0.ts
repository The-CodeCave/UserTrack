import { checkPublicHttpsUrl } from "../lib/ssrf";
import { asCount, fetchJson, isoDaysAgo, BOUNDED_HISTORY, DAY_MS, type Provider, type ProviderMetrics } from "./types";

export interface Auth0Config { domain: string; clientId: string; clientSecret: string }

async function token({ domain, clientId, clientSecret }: Auth0Config) {
  const json = await fetchJson<{ access_token?: string }>(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, audience: `https://${domain}/api/v2/` }),
  });
  if (!json.access_token) throw new Error("Auth0 token response missing access_token");
  return json.access_token;
}

async function total(domain: string, tok: string, q?: string) {
  const qs = new URLSearchParams({ include_totals: "true", per_page: "0", page: "0", search_engine: "v3" });
  if (q) qs.set("q", q);
  const json = await fetchJson(`https://${domain}/api/v2/users?${qs}`, { headers: { Authorization: `Bearer ${tok}` } });
  return asCount(json.total, "Auth0 total");
}

const yyyymmdd = (ts: number) => new Date(ts).toISOString().slice(0, 10).replace(/-/g, "");

// Auth0 Management API (client-credentials M2M app with read:users and read:stats).
export const auth0: Provider<Auth0Config> = {
  kind: "auth0",
  label: "Auth0",
  roles: ["users"],
  capabilities: ["totalUsers", "usersInRange", "activeUsers", "history"],
  validate(c) {
    const cfg = c as Partial<Auth0Config>;
    const domain = (cfg?.domain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
    const clientId = cfg?.clientId?.trim() ?? "";
    const clientSecret = cfg?.clientSecret?.trim() ?? "";
    if (!domain || !/^[a-z0-9.-]+$/.test(domain)) return { ok: false, error: "Enter your Auth0 domain (e.g. acme.eu.auth0.com)" };
    const check = checkPublicHttpsUrl(`https://${domain}`, { what: "The Auth0 domain" });
    if (!check.ok) return { ok: false, error: check.reason };
    if (!clientId) return { ok: false, error: "Enter the client ID" };
    if (!clientSecret) return { ok: false, error: "Enter the client secret" };
    return { ok: true, config: { domain, clientId, clientSecret } };
  },
  trust: () => "verified",
  async fetch(cfg): Promise<ProviderMetrics> {
    const tok = await token(cfg);
    const since = (d: number) => `created_at:[${isoDaysAgo(d)} TO *]`;
    const [totalUsers, newUsers24h, newUsers7d, newUsers30d, active] = await Promise.all([
      total(cfg.domain, tok),
      total(cfg.domain, tok, since(1)),
      total(cfg.domain, tok, since(7)),
      total(cfg.domain, tok, since(30)),
      fetchJson<unknown>(`https://${cfg.domain}/api/v2/stats/active-users`, { headers: { Authorization: `Bearer ${tok}` } }),
    ]);
    return { totalUsers, newUsers24h, newUsers7d, newUsers30d, activeUsers30d: asCount(active, "Auth0 active-users") };
  },
  historyLimit: () => BOUNDED_HISTORY,
  async fetchHistory(cfg, _role, days) {
    const tok = await token(cfg);
    const now = Date.now();
    const rows = await fetchJson<{ date: string; signups: number }[]>(
      `https://${cfg.domain}/api/v2/stats/daily?from=${yyyymmdd(now - days * DAY_MS)}&to=${yyyymmdd(now)}`,
      { headers: { Authorization: `Bearer ${tok}` } },
    );
    const points = rows.map((r) => ({ day: r.date.slice(0, 10), value: asCount(r.signups, "Auth0 signups") })).sort((a, b) => a.day.localeCompare(b.day));
    return { metric: "newUsers", points };
  },
  publicConfig: ({ domain, clientId }) => ({ domain, clientId: `${clientId.slice(0, 6)}…` }),
  hosts: ({ domain }) => [domain],
};
