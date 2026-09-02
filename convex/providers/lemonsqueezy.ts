import { fetchJson, str, type Provider, type ProviderMetrics, type ConversionMode, CONVERSION_MODE_LABEL } from "./types";
import { aggregateConversion, iso, MAX_PAGES, pageAll, parseMode, tooMany, type SubRecord, type SubState } from "./conversion";

export interface LemonSqueezyConfig { apiKey: string; storeId?: string; mode: ConversionMode }

interface Sub { id: string; attributes: { customer_id: number | string; status: string; trial_ends_at?: string | null; created_at?: string; ends_at?: string | null } }
interface Order { id: string; attributes: { customer_id: number | string; status: string; created_at?: string } }

const STATE: Record<string, SubState> = { on_trial: "trial", active: "active", past_due: "past_due", unpaid: "expired", paused: "paused", cancelled: "canceled", expired: "expired" };

// Lemon Squeezy subscriptions + (for ever-paid modes) paid one-time orders. Converted = paid at least once; a customer or
// an unpaid trial never counts. The JSON:API responses carry prices and emails — both are dropped at parse time.
export function subRecord(s: Sub, now = Date.now()): SubRecord {
  const a = s.attributes;
  const state = STATE[a.status] ?? "incomplete";
  const trialEnd = iso(a.trial_ends_at);
  const created = iso(a.created_at);
  const ended = iso(a.ends_at) ?? now;
  const paidCapable = state !== "trial" && state !== "incomplete";
  const paidAt = paidCapable && (trialEnd === undefined || ended > trialEnd) ? (trialEnd !== undefined && created !== undefined && trialEnd > created ? trialEnd : created) : undefined;
  return { subject: String(a.customer_id), state, paidAt, trialAt: state === "trial" ? created : undefined };
}

export function orderRecord(o: Order): SubRecord | null {
  if (o.attributes.status !== "paid") return null;
  return { subject: String(o.attributes.customer_id), state: "expired", paidAt: iso(o.attributes.created_at) };
}

async function listAll<T>(apiKey: string, path: string, storeId?: string) {
  const res = await pageAll<T>(async (cursor) => {
    const page = cursor ? Number(cursor) : 1;
    const json = await fetchJson<{ data?: T[]; meta?: { page?: { lastPage?: number; currentPage?: number } } }>(
      `https://api.lemonsqueezy.com/v1/${path}?page[size]=100&page[number]=${page}${storeId ? `&filter[store_id]=${encodeURIComponent(storeId)}` : ""}`,
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json" } },
    );
    const items = json.data ?? [];
    const last = json.meta?.page?.lastPage ?? page;
    return { items, next: page < last ? String(page + 1) : null };
  }, MAX_PAGES);
  if (!res.complete) tooMany("Lemon Squeezy");
  return res.items;
}

export const lemonsqueezy: Provider<LemonSqueezyConfig> = {
  kind: "lemonsqueezy",
  label: "Lemon Squeezy",
  roles: ["conversion"],
  capabilities: ["trial", "converted", "identity"],
  validate(c) {
    const apiKey = str(c, "apiKey");
    if (!apiKey || apiKey.length < 20) return { ok: false, error: "Enter a Lemon Squeezy API key (Settings → API)" };
    const storeId = str(c, "storeId") || undefined;
    if (storeId && !/^\d+$/.test(storeId)) return { ok: false, error: "Store ID must be numeric" };
    const mode = parseMode(c);
    if (!mode) return { ok: false, error: "Invalid conversion mode" };
    return { ok: true, config: { apiKey, storeId, mode } };
  },
  trust: () => "verified",
  async fetch({ apiKey, storeId, mode }): Promise<ProviderMetrics> {
    const now = Date.now();
    const subs = (await listAll<Sub>(apiKey, "subscriptions", storeId)).map((s) => subRecord(s, now));
    const orders = mode === "active_paid" ? [] : (await listAll<Order>(apiKey, "orders", storeId)).map(orderRecord).filter((r): r is SubRecord => r !== null);
    return aggregateConversion([...subs, ...orders], mode, now);
  },
  publicConfig: ({ storeId, mode }) => ({ store: storeId ?? "all", conversion: CONVERSION_MODE_LABEL[mode] }),
};
