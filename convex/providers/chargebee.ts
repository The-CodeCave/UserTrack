import { fetchJson, str, type Provider, type ProviderMetrics, type ConversionMode, CONVERSION_MODE_LABEL } from "./types";
import { aggregateConversion, MAX_PAGES, pageAll, parseMode, sec, subjectFrom, tooMany, type SubRecord, type SubState } from "./conversion";

export interface ChargebeeConfig { site: string; apiKey: string; mode: ConversionMode }

interface Subscription { id: string; customer_id: string; status: string; trial_start?: number; trial_end?: number; activated_at?: number; started_at?: number; created_at?: number; meta_data?: Record<string, unknown> }

const STATE: Record<string, SubState> = { in_trial: "trial", future: "incomplete", active: "active", non_renewing: "active", paused: "paused", cancelled: "canceled", transferred: "expired" };

// Chargebee subscriptions (read-only API key). `activated_at` is set when a subscription becomes paid (after the trial or
// immediately), which is exactly the conversion event. Customers without an activated subscription never count.
export function toRecord(sub: Subscription): SubRecord {
  const state = STATE[sub.status] ?? "incomplete";
  return { subject: subjectFrom(sub.meta_data, sub.customer_id), state, paidAt: sec(sub.activated_at), trialAt: sec(sub.trial_start) };
}

export const chargebee: Provider<ChargebeeConfig> = {
  kind: "chargebee",
  label: "Chargebee",
  roles: ["conversion"],
  capabilities: ["trial", "converted", "identity"],
  validate(c) {
    const site = str(c, "site").replace(/^https?:\/\//, "").replace(/\.chargebee\.com.*$/, "");
    const apiKey = str(c, "apiKey");
    if (!site || !/^[a-z0-9-]{2,64}$/.test(site)) return { ok: false, error: "Enter your Chargebee site name (the part before .chargebee.com)" };
    if (!apiKey || apiKey.length < 16) return { ok: false, error: "Enter a read-only Chargebee API key" };
    const mode = parseMode(c);
    if (!mode) return { ok: false, error: "Invalid conversion mode" };
    return { ok: true, config: { site, apiKey, mode } };
  },
  trust: () => "verified",
  async fetch({ site, apiKey, mode }): Promise<ProviderMetrics> {
    const statuses = mode === "active_paid" ? ["in_trial", "active", "non_renewing"] : ["in_trial", "active", "non_renewing", "paused", "cancelled"];
    const auth = `Basic ${btoa(`${apiKey}:`)}`;
    const res = await pageAll<Subscription>(async (cursor) => {
      const json = await fetchJson<{ list?: { subscription: Subscription }[]; next_offset?: string }>(
        `https://${site}.chargebee.com/api/v2/subscriptions?limit=100&status[in]=${encodeURIComponent(JSON.stringify(statuses))}${cursor ? `&offset=${encodeURIComponent(cursor)}` : ""}`,
        { headers: { Authorization: auth, Accept: "application/json" } },
      );
      return { items: (json.list ?? []).map((x) => x.subscription), next: json.next_offset ?? null };
    }, MAX_PAGES);
    if (!res.complete) tooMany("Chargebee");
    return aggregateConversion(res.items.map(toRecord), mode);
  },
  publicConfig: ({ site, mode }) => ({ site, conversion: CONVERSION_MODE_LABEL[mode] }),
};
