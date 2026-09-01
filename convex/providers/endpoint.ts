import { asCount, fetchJson, hostOf, sameSite, type Provider } from "./types";

export interface EndpointConfig { url: string; token: string }

// GET {url} with `Authorization: Bearer {token}` → { "totalUsers": number }.
// Verified only when the endpoint lives on the SaaS's own domain.
export const endpoint: Provider<EndpointConfig> = {
  kind: "endpoint",
  label: "JSON endpoint",
  validate(c) {
    const cfg = c as Partial<EndpointConfig>;
    const url = cfg?.url?.trim();
    if (!url || !/^https:\/\//.test(url) || !hostOf(url)) return { ok: false, error: "Enter an https:// endpoint URL" };
    const token = cfg?.token?.trim() ?? "";
    return { ok: true, config: { url, token } };
  },
  trust: ({ url }, site) => (sameSite(url, site) ? "verified" : "unverified"),
  async fetchTotalUsers({ url, token }) {
    const json = await fetchJson(url, {
      headers: token ? { Authorization: `Bearer ${token}`, Accept: "application/json" } : { Accept: "application/json" },
    });
    return asCount(json.totalUsers, "totalUsers");
  },
  publicConfig: ({ url }) => ({ host: hostOf(url) ?? url }),
};
