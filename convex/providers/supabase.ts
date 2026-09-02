import { asCount, hostOf, isoDaysAgo, ProviderError, DAY_MS, dayKey, type Provider, type ProviderMetrics } from "./types";

export interface SupabaseConfig { url: string; serviceKey: string; table?: string; createdAtColumn?: string }

async function tableCount(cfg: SupabaseConfig, filter = "") {
  const headers = { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, Prefer: "count=exact", Range: "0-0" };
  const res = await fetch(`${cfg.url}/rest/v1/${cfg.table}?select=id${filter}`, { method: "HEAD", headers });
  if (!res.ok) throw new ProviderError(`${res.status} from Supabase table ${cfg.table}`, res.status >= 500);
  return asCount(res.headers.get("content-range")?.split("/")[1], "Supabase content-range");
}

async function authCount(cfg: SupabaseConfig) {
  const res = await fetch(`${cfg.url}/auth/v1/admin/users?per_page=1`, { headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` } });
  if (!res.ok) throw new ProviderError(`${res.status} from Supabase auth`, res.status >= 500);
  return asCount(res.headers.get("x-total-count"), "Supabase X-Total-Count");
}

// Counts auth.users via the admin API, or any table via PostgREST exact counts. A created_at column unlocks range metrics + history.
export const supabase: Provider<SupabaseConfig> = {
  kind: "supabase",
  label: "Supabase",
  roles: ["users", "activation"],
  capabilities: ["totalUsers", "usersInRange", "history", "activation"],
  validate(c, role) {
    const cfg = c as Partial<SupabaseConfig>;
    const url = cfg?.url?.trim().replace(/\/$/, "");
    const key = cfg?.serviceKey?.trim();
    const table = cfg?.table?.trim() || undefined;
    const createdAtColumn = cfg?.createdAtColumn?.trim() || undefined;
    if (!url || !hostOf(url)?.endsWith("supabase.co")) return { ok: false, error: "Enter your project URL (https://xxx.supabase.co)" };
    if (!key || key.length < 20) return { ok: false, error: "Enter the service role key" };
    if (table && !/^[a-z_][a-z0-9_]*$/i.test(table)) return { ok: false, error: "Invalid table name" };
    if (createdAtColumn && !/^[a-z_][a-z0-9_]*$/i.test(createdAtColumn)) return { ok: false, error: "Invalid column name" };
    if (role === "activation" && !table) return { ok: false, error: "Activation needs a table that has one row per activated user" };
    return { ok: true, config: { url, serviceKey: key, table, createdAtColumn } };
  },
  trust: () => "verified",
  async fetch(cfg, role): Promise<ProviderMetrics> {
    if (!cfg.table) return { totalUsers: await authCount(cfg) };
    const col = cfg.createdAtColumn;
    const total = await tableCount(cfg);
    if (!col) return role === "activation" ? { activatedUsers: total } : { totalUsers: total };
    const since = (d: number) => `&${col}=gte.${encodeURIComponent(isoDaysAgo(d))}`;
    const [r24, r7, r30] = await Promise.all([tableCount(cfg, since(1)), tableCount(cfg, since(7)), tableCount(cfg, since(30))]);
    return role === "activation"
      ? { activatedUsers: total, activated24h: r24, activated7d: r7, activated30d: r30 }
      : { totalUsers: total, newUsers24h: r24, newUsers7d: r7, newUsers30d: r30 };
  },
  async fetchHistory(cfg, role, days) {
    if (!cfg.table || !cfg.createdAtColumn) return null;
    const now = Date.now();
    const points = [];
    for (let d = days; d >= 1; d--) {
      const end = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) - (d - 1) * DAY_MS;
      points.push({ day: dayKey(end - 1), value: await tableCount(cfg, `&${cfg.createdAtColumn}=lt.${encodeURIComponent(new Date(end).toISOString())}`) });
    }
    return { metric: role === "activation" ? "activatedUsers" : "totalUsers", points };
  },
  publicConfig: ({ url, table }) => ({ project: hostOf(url) ?? url, source: table ?? "auth.users" }),
};
