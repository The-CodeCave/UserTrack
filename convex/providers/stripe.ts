import { asCount, fetchJson, ProviderError, type Provider, type ProviderMetrics } from "./types";

export interface StripeConfig { secretKey: string }

interface Price { unit_amount?: number | null; currency?: string; recurring?: { interval?: string; interval_count?: number } | null }
interface Subscription { id: string; customer: string | { id: string }; items?: { data?: { price?: Price; quantity?: number }[] } }

const PER_MONTH: Record<string, number> = { month: 1, year: 1 / 12, week: 52 / 12, day: 365 / 12 };

// MRR from active subscriptions, normalized to monthly cents. Discounts, trials and taxes are ignored in v1.
export const stripe: Provider<StripeConfig> = {
  kind: "stripe",
  label: "Stripe",
  roles: ["revenue"],
  capabilities: ["revenue"],
  validate(c) {
    const key = (c as Partial<StripeConfig>)?.secretKey?.trim();
    if (!key || !/^(sk|rk)_(live|test)_/.test(key)) return { ok: false, error: "Enter a Stripe secret or restricted key (sk_… or rk_…)" };
    return { ok: true, config: { secretKey: key } };
  },
  trust: () => "verified",
  async fetch({ secretKey }): Promise<ProviderMetrics> {
    const customers = new Set<string>();
    const currencies = new Map<string, number>();
    let mrr = 0;
    let after = "";
    for (let page = 0; page < 25; page++) {
      const json = await fetchJson<{ data?: Subscription[]; has_more?: boolean }>(
        `https://api.stripe.com/v1/subscriptions?status=active&limit=100&expand[]=data.items.data.price${after && `&starting_after=${after}`}`,
        { headers: { Authorization: `Bearer ${secretKey}` } },
      );
      const subs = json.data ?? [];
      for (const sub of subs) {
        customers.add(typeof sub.customer === "string" ? sub.customer : sub.customer?.id);
        for (const item of sub.items?.data ?? []) {
          const price = item.price;
          const factor = PER_MONTH[price?.recurring?.interval ?? ""];
          if (price?.unit_amount == null || !factor) continue;
          mrr += (price.unit_amount * (item.quantity ?? 1) * factor) / (price.recurring?.interval_count || 1);
          const cur = (price.currency ?? "usd").toUpperCase();
          currencies.set(cur, (currencies.get(cur) ?? 0) + 1);
        }
      }
      if (!json.has_more || !subs.length) break;
      after = subs[subs.length - 1].id;
      if (page === 24) throw new ProviderError("Too many Stripe subscriptions to paginate", false);
    }
    const currency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
    return { payingUsers: asCount(customers.size, "Stripe customers"), mrr: asCount(Math.round(mrr), "Stripe MRR"), currency };
  },
  publicConfig: ({ secretKey }) => ({ key: `${secretKey.slice(0, 8)}…${secretKey.slice(-4)}` }),
};
