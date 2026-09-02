import { asCount, fetchJson, hostOf, sameSite, type Provider, type ProviderMetrics, type Role } from "./types";

export interface EndpointConfig { url: string; token: string }

const FIELDS: Record<Role, (keyof ProviderMetrics)[]> = {
  users: ["totalUsers", "newUsers24h", "newUsers7d", "newUsers30d", "activeUsers30d"],
  activation: ["activatedUsers", "activated24h", "activated7d", "activated30d"],
  traffic: ["visitors30d", "sessions30d", "visitorsPrev30d"],
  revenue: ["payingUsers", "mrr"],
};
const REQUIRED: Record<Role, keyof ProviderMetrics> = { users: "totalUsers", activation: "activatedUsers", traffic: "visitors30d", revenue: "payingUsers" };

// GET {url} with `Authorization: Bearer {token}` → JSON. Required key depends on role, e.g. { "totalUsers": 1234 }.
// Verified only when the endpoint lives on the SaaS's own domain.
export const endpoint: Provider<EndpointConfig> = {
  kind: "endpoint",
  label: "JSON endpoint",
  roles: ["users", "activation", "traffic", "revenue"],
  capabilities: ["totalUsers", "usersInRange", "activeUsers", "activation", "traffic", "revenue"],
  validate(c) {
    const cfg = c as Partial<EndpointConfig>;
    const url = cfg?.url?.trim();
    if (!url || !/^https:\/\//.test(url) || !hostOf(url)) return { ok: false, error: "Enter an https:// endpoint URL" };
    const token = cfg?.token?.trim() ?? "";
    return { ok: true, config: { url, token } };
  },
  trust: ({ url }, site) => (sameSite(url, site) ? "verified" : "unverified"),
  async fetch({ url, token }, role): Promise<ProviderMetrics> {
    const json = await fetchJson(url, {
      headers: token ? { Authorization: `Bearer ${token}`, Accept: "application/json" } : { Accept: "application/json" },
    });
    const out: ProviderMetrics = {};
    for (const key of FIELDS[role]) {
      if (json[key] !== undefined) (out as Record<string, unknown>)[key] = asCount(json[key], key);
    }
    if (out[REQUIRED[role]] === undefined) asCount(json[REQUIRED[role]], REQUIRED[role]);
    if (typeof json.currency === "string") out.currency = json.currency.slice(0, 3).toUpperCase();
    return out;
  },
  publicConfig: ({ url }) => ({ host: hostOf(url) ?? url }),
};
