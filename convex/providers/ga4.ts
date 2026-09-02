import { asCount, fetchJson, type Provider, type ProviderMetrics } from "./types";
import { googleAccessToken, parseServiceAccount } from "./google";

export interface Ga4Config { propertyId: string; serviceAccount: string }

interface Row { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }

async function runReport(cfg: Ga4Config, body: Record<string, unknown>) {
  const token = await googleAccessToken(parseServiceAccount(cfg.serviceAccount), "https://www.googleapis.com/auth/analytics.readonly");
  const json = await fetchJson<{ rows?: Row[] }>(`https://analyticsdata.googleapis.com/v1beta/properties/${cfg.propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return json.rows ?? [];
}

const metric = (row: Row | undefined, i: number, what: string) => asCount(row?.metricValues?.[i]?.value ?? 0, what);

// GA4 Data API runReport; the service account needs Viewer access on the property.
export const ga4: Provider<Ga4Config> = {
  kind: "ga4",
  label: "Google Analytics 4",
  roles: ["traffic"],
  capabilities: ["traffic", "history"],
  validate(c) {
    const cfg = c as Partial<Ga4Config>;
    const propertyId = (cfg?.propertyId ?? "").trim().replace(/^properties\//, "");
    const serviceAccount = cfg?.serviceAccount?.trim() ?? "";
    if (!/^\d+$/.test(propertyId)) return { ok: false, error: "Enter the numeric GA4 property ID" };
    try {
      parseServiceAccount(serviceAccount);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    return { ok: true, config: { propertyId, serviceAccount } };
  },
  trust: () => "verified",
  async fetch(cfg): Promise<ProviderMetrics> {
    const rows = await runReport(cfg, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }, { startDate: "60daysAgo", endDate: "31daysAgo" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
    });
    const cur = rows.find((r) => r.dimensionValues?.[0]?.value === "date_range_0");
    const prev = rows.find((r) => r.dimensionValues?.[0]?.value === "date_range_1");
    return { visitors30d: metric(cur, 0, "GA4 activeUsers"), sessions30d: metric(cur, 1, "GA4 sessions"), visitorsPrev30d: metric(prev, 0, "GA4 activeUsers") };
  },
  async fetchHistory(cfg, _role, days) {
    const rows = await runReport(cfg, { dimensions: [{ name: "date" }], dateRanges: [{ startDate: `${Math.floor(days)}daysAgo`, endDate: "today" }], metrics: [{ name: "activeUsers" }] });
    const points = rows
      .map((r) => ({ day: (r.dimensionValues?.[0]?.value ?? "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"), value: metric(r, 0, "GA4 activeUsers") }))
      .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.day))
      .sort((a, b) => a.day.localeCompare(b.day));
    return { metric: "visitors", points };
  },
  publicConfig: (cfg) => ({ property: cfg.propertyId, account: parseServiceAccount(cfg.serviceAccount).client_email }),
};
