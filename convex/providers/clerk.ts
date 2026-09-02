import { asCount, fetchJson, mapLimit, DAY_MS, dayKey, type Provider, type ProviderMetrics } from "./types";

export interface ClerkConfig { secretKey: string }

const API = "https://api.clerk.com/v1";

async function count(secretKey: string, params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const json = await fetchJson(`${API}/users/count${qs.size ? `?${qs}` : ""}`, { headers: { Authorization: `Bearer ${secretKey}` } });
  return asCount(json.total_count, "Clerk total_count");
}

// Clerk Backend API. Only GET /v1/users/count is used (with created_at / last_active_at filters). 429s back off via fetchJson.
export const clerk: Provider<ClerkConfig> = {
  kind: "clerk",
  label: "Clerk",
  roles: ["users"],
  capabilities: ["totalUsers", "usersInRange", "activeUsers", "history"],
  validate(c) {
    const key = (c as Partial<ClerkConfig>)?.secretKey?.trim();
    if (!key || !/^sk_(live|test)_/.test(key)) return { ok: false, error: "Enter a Clerk secret key (sk_live_… or sk_test_…)" };
    return { ok: true, config: { secretKey: key } };
  },
  trust: () => "verified",
  async fetch({ secretKey }): Promise<ProviderMetrics> {
    const now = Date.now();
    const [totalUsers, new24h, new7d, new30d, active30d] = await Promise.all([
      count(secretKey),
      count(secretKey, { created_at_after: now - DAY_MS }),
      count(secretKey, { created_at_after: now - 7 * DAY_MS }),
      count(secretKey, { created_at_after: now - 30 * DAY_MS }),
      count(secretKey, { last_active_at_since: now - 30 * DAY_MS }),
    ]);
    return { totalUsers, newUsers24h: new24h, newUsers7d: new7d, newUsers30d: new30d, activeUsers30d: active30d };
  },
  // One count call per day, at most 4 in flight so Clerk's rate limit (and its Retry-After backoff in fetchJson) is respected.
  async fetchHistory({ secretKey }, _role, days) {
    const now = Date.now();
    const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
    const ends = Array.from({ length: days }, (_, i) => today - (days - 1 - i) * DAY_MS);
    const points = await mapLimit(ends, 4, async (end) => ({ day: dayKey(end - 1), value: await count(secretKey, { created_at_before: end }) }));
    return { metric: "totalUsers", points };
  },
  publicConfig: ({ secretKey }) => ({ key: `${secretKey.slice(0, 8)}…${secretKey.slice(-4)}` }),
};
