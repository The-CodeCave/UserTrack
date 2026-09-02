import { fetchJson, type Provider, type ProviderMetrics, type ConversionMode, CONVERSION_MODES, CONVERSION_MODE_LABEL } from "./types";
import { aggregateConversion, MAX_PAGES, pageAll, parseMode, sec, subjectFrom, tooMany, type SubRecord, type SubState } from "./conversion";

export interface StripeConfig { secretKey: string; mode: ConversionMode }

interface Subscription {
  id: string;
  status: string;
  customer: string | { id: string };
  created?: number;
  start_date?: number;
  trial_start?: number | null;
  trial_end?: number | null;
  ended_at?: number | null;
  canceled_at?: number | null;
  metadata?: Record<string, unknown>;
}

const STATE: Record<string, SubState> = { trialing: "trial", active: "active", past_due: "past_due", paused: "paused", canceled: "canceled", unpaid: "expired", incomplete: "incomplete", incomplete_expired: "incomplete" };

// Stripe is a conversion-status source: a customer is only "converted" through a paid subscription state. No amounts,
// prices or invoices are requested — only GET /v1/subscriptions with a restricted read-only key.
// A Stripe customer that never paid is never a converted user. One-time payments are not covered (see docs/PROVIDERS.md).
export function toRecord(sub: Subscription, now = Date.now()): SubRecord {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? "";
  const state = STATE[sub.status] ?? "incomplete";
  const trialEnd = sec(sub.trial_end ?? undefined);
  const start = sec(sub.start_date ?? sub.created);
  const ended = sec(sub.ended_at ?? undefined) ?? now;
  // Paid once the subscription ran past its trial (or had none) in a paid-capable state.
  const paidCapable = ["active", "past_due", "paused", "canceled", "expired"].includes(state);
  const paidAt = paidCapable && (trialEnd === undefined || ended > trialEnd) ? (trialEnd !== undefined && start !== undefined && trialEnd > start ? trialEnd : start) : undefined;
  return { subject: subjectFrom(sub.metadata, customer), state, paidAt, trialAt: sec(sub.trial_start ?? undefined) };
}

async function list(secretKey: string, status: string) {
  const res = await pageAll<Subscription>(async (cursor) => {
    const json = await fetchJson<{ data?: Subscription[]; has_more?: boolean }>(
      `https://api.stripe.com/v1/subscriptions?status=${status}&limit=100${cursor ? `&starting_after=${cursor}` : ""}`,
      { headers: { Authorization: `Bearer ${secretKey}` } },
    );
    const items = json.data ?? [];
    return { items, next: json.has_more && items.length ? items[items.length - 1].id : null };
  }, MAX_PAGES);
  if (!res.complete) tooMany("Stripe");
  return res.items;
}

export const stripe: Provider<StripeConfig> = {
  kind: "stripe",
  label: "Stripe",
  roles: ["conversion"],
  capabilities: ["trial", "converted", "identity"],
  validate(c) {
    const key = (c as Partial<StripeConfig>)?.secretKey?.trim();
    if (!key || !/^(sk|rk)_(live|test)_/.test(key)) return { ok: false, error: "Enter a Stripe restricted key (rk_…) with read access to Subscriptions" };
    const mode = parseMode(c);
    if (!mode) return { ok: false, error: `Conversion mode must be one of ${CONVERSION_MODES.join(", ")}` };
    return { ok: true, config: { secretKey: key, mode } };
  },
  trust: () => "verified",
  async fetch({ secretKey, mode }): Promise<ProviderMetrics> {
    const now = Date.now();
    const statuses = mode === "active_paid" ? ["active", "past_due", "trialing"] : ["active", "past_due", "trialing", "canceled", "unpaid", "paused"];
    const subs = (await Promise.all(statuses.map((s) => list(secretKey, s)))).flat();
    return aggregateConversion(subs.map((s) => toRecord(s, now)), mode, now);
  },
  publicConfig: ({ secretKey, mode }) => ({ key: `${secretKey.slice(0, 8)}…${secretKey.slice(-4)}`, conversion: CONVERSION_MODE_LABEL[mode] }),
};
