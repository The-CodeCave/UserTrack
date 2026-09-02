import { asCount, hostOf, isoDaysAgo, ProviderError, DAY_MS, dayKey, type PostgresQuery, type Provider, type ProviderCapabilities, type ProviderMetrics } from "./types";
import { defaultSsl, isIdent, parseConnectionString, projectRefFromHost, splitTable, validateSql } from "./postgres";

// Two modes behind one adapter:
//   api      — project URL + service role key: exact-count HEAD requests (auth.users total, or any table)
//   database — read-only Postgres connection string: auth.users with created_at → signups per window + 30-day history
export interface SupabaseConfig {
  mode: "api" | "database";
  url?: string;
  serviceKey?: string;
  connectionString?: string;
  ssl?: "require" | "disable";
  table?: string;
  createdAtColumn?: string;
  sql?: string;
}

async function tableCount(cfg: SupabaseConfig, filter = "") {
  const headers = { apikey: cfg.serviceKey!, Authorization: `Bearer ${cfg.serviceKey}`, Prefer: "count=exact", Range: "0-0" };
  const res = await fetch(`${cfg.url}/rest/v1/${cfg.table}?select=id${filter}`, { method: "HEAD", headers });
  if (!res.ok) throw new ProviderError(`${res.status} from Supabase table ${cfg.table}`, res.status >= 500);
  return asCount(res.headers.get("content-range")?.split("/")[1], "Supabase content-range");
}

async function authCount(cfg: SupabaseConfig) {
  const res = await fetch(`${cfg.url}/auth/v1/admin/users?per_page=1`, { headers: { apikey: cfg.serviceKey!, Authorization: `Bearer ${cfg.serviceKey}` } });
  if (!res.ok) throw new ProviderError(`${res.status} from Supabase auth`, res.status >= 500);
  return asCount(res.headers.get("x-total-count"), "Supabase X-Total-Count");
}

const isSupabaseHost = (host: string) => /\.supabase\.(co|com)$/i.test(host) || /\.pooler\.supabase\.com$/i.test(host);

export function supabaseProjectRef(cfg: SupabaseConfig) {
  if (cfg.mode === "api") return hostOf(cfg.url ?? "")?.split(".")[0] ?? null;
  try {
    const u = new URL(cfg.connectionString!);
    return projectRefFromHost(u.hostname) ?? u.username.match(/^postgres\.([a-z0-9]{15,})$/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

export const supabase: Provider<SupabaseConfig> = {
  kind: "supabase",
  label: "Supabase",
  roles: ["users", "activation"],
  capabilities: ["totalUsers", "usersInRange", "history", "activation"],
  validate(c, role) {
    const cfg = c as Partial<SupabaseConfig>;
    const table = cfg?.table?.trim() || undefined;
    const createdAtColumn = cfg?.createdAtColumn?.trim() || undefined;
    if (table && !/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(table)) return { ok: false, error: "Invalid table name" };
    if (createdAtColumn && !isIdent(createdAtColumn)) return { ok: false, error: "Invalid column name" };
    const connectionString = cfg?.connectionString?.trim();
    if (connectionString) {
      const conn = parseConnectionString(connectionString);
      if (!conn.ok) return { ok: false, error: conn.error };
      if (!isSupabaseHost(conn.url.hostname)) return { ok: false, error: "This is not a Supabase connection string (expected *.supabase.co or *.pooler.supabase.com)" };
      const sql = cfg.sql?.trim() || undefined;
      if (sql) {
        if (role !== "activation") return { ok: false, error: "Custom SQL is only supported for activation" };
        const err = validateSql(sql);
        if (err) return { ok: false, error: err };
      } else if (role === "activation" && !table) return { ok: false, error: "Activation needs a table that has one row per activated user (or a custom SQL query)" };
      return { ok: true, config: { mode: "database", connectionString: conn.url.toString(), ssl: cfg.ssl === "disable" ? "disable" : defaultSsl(conn.url.hostname, conn.url.searchParams), table, createdAtColumn: sql ? undefined : createdAtColumn ?? (table ? undefined : "created_at"), sql } };
    }
    const url = cfg?.url?.trim().replace(/\/$/, "");
    const key = cfg?.serviceKey?.trim();
    if (!url || !hostOf(url)?.endsWith("supabase.co")) return { ok: false, error: "Enter your project URL (https://xxx.supabase.co) or a read-only database connection string" };
    if (!key || key.length < 20) return { ok: false, error: "Enter the service role key (or use a database connection string instead)" };
    if (table?.includes(".")) return { ok: false, error: "The API mode reads public tables only; use a connection string for other schemas" };
    if (role === "activation" && !table) return { ok: false, error: "Activation needs a table that has one row per activated user" };
    return { ok: true, config: { mode: "api", url, serviceKey: key, table, createdAtColumn } };
  },
  trust: () => "verified",
  runtime: (cfg) => (cfg.mode === "database" ? "node" : "v8"),
  toPostgres(cfg, role): PostgresQuery {
    const base = { connectionString: cfg.connectionString!, ssl: cfg.ssl ?? "require" };
    if (cfg.sql) return { ...base, schema: "public", table: "", sql: cfg.sql };
    if (!cfg.table) return { ...base, schema: "auth", table: "users", createdAtColumn: "created_at", createdAtKind: "timestamp", deletedAtColumn: "deleted_at" };
    const split = splitTable(cfg.table)!;
    void role;
    return { ...base, schema: split.schema, table: split.table, createdAtColumn: cfg.createdAtColumn, createdAtKind: cfg.createdAtColumn ? "timestamp" : undefined };
  },
  describe(cfg, role): ProviderCapabilities {
    const ranged = cfg.mode === "database" ? Boolean(!cfg.table || cfg.createdAtColumn || cfg.sql) : Boolean(cfg.table && cfg.createdAtColumn);
    return { totalUsers: role === "users", createdUsers: role === "users" && ranged, historicalUsers: ranged && !cfg.sql, activationEvents: role === "activation", retention: false, traffic: false, revenue: false };
  },
  async fetch(cfg, role): Promise<ProviderMetrics> {
    if (cfg.mode === "database") throw new ProviderError("Supabase database mode runs in the Node runtime", false);
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
    if (cfg.mode === "database" || !cfg.table || !cfg.createdAtColumn) return null;
    const now = Date.now();
    const points = [];
    for (let d = days; d >= 1; d--) {
      const end = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) - (d - 1) * DAY_MS;
      points.push({ day: dayKey(end - 1), value: await tableCount(cfg, `&${cfg.createdAtColumn}=lt.${encodeURIComponent(new Date(end).toISOString())}`) });
    }
    return { metric: role === "activation" ? "activatedUsers" : "totalUsers", points };
  },
  publicConfig: (cfg) => ({ project: supabaseProjectRef(cfg) ?? "supabase", mode: cfg.mode === "database" ? "read-only database" : "service key", source: cfg.sql ? "custom query" : cfg.table ?? "auth.users" }),
};
