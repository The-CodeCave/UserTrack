import { asCount, fetchJson, hostOf, DAY_MS, dayKey, type Provider, type ProviderMetrics } from "./types";

export interface PlausibleConfig { siteId: string; apiKey: string; host: string }

const headers = (cfg: PlausibleConfig) => ({ Authorization: `Bearer ${cfg.apiKey}` });

// Plausible Stats API v1 (aggregate + timeseries). Previous-period visitors are derived from the `change` percentage.
export const plausible: Provider<PlausibleConfig> = {
  kind: "plausible",
  label: "Plausible",
  roles: ["traffic"],
  capabilities: ["traffic", "history"],
  validate(c) {
    const cfg = c as Partial<PlausibleConfig>;
    const siteId = cfg?.siteId?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") ?? "";
    const apiKey = cfg?.apiKey?.trim() ?? "";
    const host = (cfg?.host?.trim() || "https://plausible.io").replace(/\/+$/, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(siteId)) return { ok: false, error: "Enter the site domain as shown in Plausible (e.g. acme.com)" };
    if (!apiKey) return { ok: false, error: "Enter an API key" };
    if (!/^https:\/\//.test(host) || !hostOf(host)) return { ok: false, error: "Host must be an https URL" };
    return { ok: true, config: { siteId, apiKey, host } };
  },
  trust: () => "verified",
  async fetch(cfg): Promise<ProviderMetrics> {
    const json = await fetchJson<{ results?: { visitors?: { value?: unknown; change?: unknown }; visits?: { value?: unknown } } }>(
      `${cfg.host}/api/v1/stats/aggregate?site_id=${encodeURIComponent(cfg.siteId)}&period=30d&metrics=visitors,visits&compare=previous_period`,
      { headers: headers(cfg) },
    );
    const visitors30d = asCount(json.results?.visitors?.value, "Plausible visitors");
    const sessions30d = asCount(json.results?.visits?.value, "Plausible visits");
    const change = json.results?.visitors?.change;
    const out: ProviderMetrics = { visitors30d, sessions30d };
    if (typeof change === "number" && Number.isFinite(change) && change !== -100) out.visitorsPrev30d = Math.round(visitors30d / (1 + change / 100));
    return out;
  },
  async fetchHistory(cfg, _role, days) {
    const now = Date.now();
    const json = await fetchJson<{ results?: { date: string; visitors: unknown }[] }>(
      `${cfg.host}/api/v1/stats/timeseries?site_id=${encodeURIComponent(cfg.siteId)}&period=custom&date=${dayKey(now - days * DAY_MS)},${dayKey(now)}&metrics=visitors`,
      { headers: headers(cfg) },
    );
    return { metric: "visitors", points: (json.results ?? []).map((r) => ({ day: r.date.slice(0, 10), value: asCount(r.visitors ?? 0, "Plausible visitors") })) };
  },
  publicConfig: ({ siteId }) => ({ site: siteId }),
};
