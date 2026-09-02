import { fetchJson, str, type Provider, type ProviderMetrics, type ConversionMode, CONVERSION_MODE_LABEL } from "./types";
import { aggregateConversion, iso, MAX_PAGES, pageAll, parseMode, subjectFrom, tooMany, type SubRecord, type SubState } from "./conversion";

export interface PaddleConfig { apiKey: string; environment: "live" | "sandbox"; mode: ConversionMode }

interface Subscription {
  id: string;
  status: string;
  customer_id: string;
  custom_data?: Record<string, unknown> | null;
  started_at?: string | null;
  first_billed_at?: string | null;
  canceled_at?: string | null;
}

const STATE: Record<string, SubState> = { trialing: "trial", active: "active", past_due: "past_due", paused: "paused", canceled: "canceled" };

// Paddle Billing subscriptions (read-only API key). Converted = a subscription that was billed at least once
// (`first_billed_at`), so trials and never-billed customers never count. No prices or transactions are read.
export function toRecord(sub: Subscription): SubRecord {
  return {
    subject: subjectFrom(sub.custom_data, sub.customer_id),
    state: STATE[sub.status] ?? "incomplete",
    paidAt: iso(sub.first_billed_at),
    trialAt: sub.status === "trialing" ? iso(sub.started_at) : undefined,
  };
}

export const paddle: Provider<PaddleConfig> = {
  kind: "paddle",
  label: "Paddle",
  roles: ["conversion"],
  capabilities: ["trial", "converted", "identity"],
  validate(c) {
    const apiKey = str(c, "apiKey");
    if (!apiKey || apiKey.length < 20) return { ok: false, error: "Enter a Paddle API key with read-only permission on Subscriptions" };
    const environment = str(c, "environment") === "sandbox" ? "sandbox" : "live";
    const mode = parseMode(c);
    if (!mode) return { ok: false, error: "Invalid conversion mode" };
    return { ok: true, config: { apiKey, environment, mode } };
  },
  trust: () => "verified",
  async fetch({ apiKey, environment, mode }): Promise<ProviderMetrics> {
    const base = environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
    const statuses = mode === "active_paid" ? "active,past_due,trialing" : "active,past_due,trialing,paused,canceled";
    const res = await pageAll<Subscription>(async (cursor) => {
      const json = await fetchJson<{ data?: Subscription[]; meta?: { pagination?: { has_more?: boolean; next?: string } } }>(
        `${base}/subscriptions?status=${statuses}&per_page=200${cursor ? `&after=${cursor}` : ""}`,
        { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
      );
      const items = json.data ?? [];
      return { items, next: json.meta?.pagination?.has_more && items.length ? items[items.length - 1].id : null };
    }, MAX_PAGES);
    if (!res.complete) tooMany("Paddle");
    return aggregateConversion(res.items.map(toRecord), mode);
  },
  publicConfig: ({ environment, mode }) => ({ environment, conversion: CONVERSION_MODE_LABEL[mode] }),
};
