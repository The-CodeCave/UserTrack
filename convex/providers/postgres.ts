import { hostOf, ProviderError, type PostgresQuery, type Provider, type ProviderCapabilities } from "./types";

// Generic read-only PostgreSQL source. Everything here is pure (validation + SQL building);
// the TCP work happens in convex/node/postgres.ts, which the sync engine reaches through Provider.runtime.
export interface PostgresConfig {
  connectionString: string;
  ssl: "require" | "disable";
  schema: string;
  table: string;
  idColumn?: string;
  createdAtColumn?: string;
  createdAtKind?: "timestamp" | "epoch_ms" | "epoch_s";
  deletedAtColumn?: string;
  statusColumn?: string;
  activeStatus?: string;
  sql?: string;
}

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const isIdent = (s: string) => IDENT.test(s) && s.length <= 63;
export const quoteIdent = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function parseConnectionString(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  const s = raw.trim();
  if (!/^postgres(ql)?:\/\//i.test(s)) return { ok: false, error: "Enter a postgres:// or postgresql:// connection string" };
  try {
    const url = new URL(s);
    if (!url.hostname) return { ok: false, error: "Connection string has no host" };
    if (!url.username) return { ok: false, error: "Connection string has no user" };
    return { ok: true, url };
  } catch {
    return { ok: false, error: "Connection string is not a valid URL (URL-encode special characters in the password)" };
  }
}

const isLocal = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");

export function defaultSsl(host: string, search: URLSearchParams): "require" | "disable" {
  const mode = search.get("sslmode");
  if (mode === "disable") return "disable";
  if (mode) return "require";
  return isLocal(host) ? "disable" : "require";
}

// Custom SQL for activation: one SELECT, no statement separators, `$1` = since-timestamp parameter.
export function validateSql(sql: string): string | null {
  const s = sql.trim();
  if (s.length > 2000) return "Query is too long (max 2000 characters)";
  if (!/^(select|with)\b/i.test(s)) return "Query must start with SELECT (or WITH)";
  if (s.includes(";")) return "Query must be a single statement without semicolons";
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|call|do)\b/i.test(s)) return "Only read-only SELECT queries are allowed";
  if (/\$[2-9]|\$\d\d/.test(s)) return "Only the $1 parameter (since timestamp) is supported";
  return null;
}

// Parse a table reference like "auth.users" or "users" into schema + table.
export function splitTable(ref: string, defaultSchema = "public") {
  const parts = ref.trim().split(".");
  if (parts.length === 1) return { schema: defaultSchema, table: parts[0] };
  if (parts.length === 2) return { schema: parts[0], table: parts[1] };
  return null;
}

export const postgres: Provider<PostgresConfig> = {
  kind: "postgres",
  label: "PostgreSQL",
  roles: ["users", "activation"],
  capabilities: ["totalUsers", "usersInRange", "history", "activation"],
  validate(c, role) {
    const cfg = c as Partial<PostgresConfig> & { tableRef?: string };
    const conn = parseConnectionString(cfg?.connectionString ?? "");
    if (!conn.ok) return { ok: false, error: conn.error };
    const ssl = cfg.ssl === "disable" || cfg.ssl === "require" ? cfg.ssl : defaultSsl(conn.url.hostname, conn.url.searchParams);
    const sql = cfg.sql?.trim() || undefined;
    if (sql) {
      if (role !== "activation") return { ok: false, error: "Custom SQL is only supported for activation" };
      const err = validateSql(sql);
      if (err) return { ok: false, error: err };
      return { ok: true, config: { connectionString: conn.url.toString(), ssl, schema: "public", table: "", sql } };
    }
    const ref = cfg.tableRef?.trim() || (cfg.table ? `${cfg.schema ? `${cfg.schema}.` : ""}${cfg.table}` : "");
    const split = ref ? splitTable(ref) : null;
    if (!split || !isIdent(split.schema) || !isIdent(split.table)) return { ok: false, error: "Choose the table that has one row per user (e.g. public.users)" };
    const col = (k: keyof PostgresConfig) => {
      const v = (cfg[k] as string | undefined)?.trim() || undefined;
      if (v && !isIdent(v)) throw new ProviderError(`Invalid column name: ${v}`, false);
      return v;
    };
    try {
      const createdAtColumn = col("createdAtColumn");
      const kind = cfg.createdAtKind === "epoch_ms" || cfg.createdAtKind === "epoch_s" ? cfg.createdAtKind : "timestamp";
      const statusColumn = col("statusColumn");
      const activeStatus = cfg.activeStatus?.trim() || undefined;
      if (statusColumn && !activeStatus) return { ok: false, error: "Enter the status value that means the user is active" };
      if (role === "activation" && !createdAtColumn) return { ok: false, error: "Activation needs a timestamp column (when the user activated) or a custom SQL query" };
      return {
        ok: true,
        config: {
          connectionString: conn.url.toString(),
          ssl,
          schema: split.schema,
          table: split.table,
          idColumn: col("idColumn"),
          createdAtColumn,
          createdAtKind: createdAtColumn ? kind : undefined,
          deletedAtColumn: col("deletedAtColumn"),
          statusColumn,
          activeStatus: statusColumn ? activeStatus : undefined,
        },
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
  trust: () => "verified",
  runtime: () => "node",
  toPostgres: (cfg) => cfg,
  describe(cfg, role): ProviderCapabilities {
    const ranged = Boolean(cfg.createdAtColumn || cfg.sql);
    return { totalUsers: role === "users", createdUsers: role === "users" && ranged, historicalUsers: ranged && !cfg.sql, activationEvents: role === "activation", retention: false, traffic: false, trial: false, converted: false, identity: Boolean(cfg.idColumn) };
  },
  async fetch() {
    throw new ProviderError("PostgreSQL runs in the Node runtime", false);
  },
  publicConfig: (cfg) => {
    const host = (() => { try { return new URL(cfg.connectionString).hostname; } catch { return "db"; } })();
    return { host: host.replace(/^(db\.)?([a-z0-9]{6})[a-z0-9]*(\.)/, "$1$2…$3"), source: cfg.sql ? "custom query" : `${cfg.schema}.${cfg.table}`, ...(cfg.createdAtColumn ? { signups: cfg.createdAtColumn } : {}) };
  },
};

// ---- SQL builders (pure) ------------------------------------------------------------------------------------------------

function sinceExpr(q: PostgresQuery, param: string) {
  const col = quoteIdent(q.createdAtColumn!);
  if (q.createdAtKind === "epoch_ms") return `${col} >= (extract(epoch from ${param}::timestamptz) * 1000)::bigint`;
  if (q.createdAtKind === "epoch_s") return `${col} >= extract(epoch from ${param}::timestamptz)::bigint`;
  return `${col} >= ${param}::timestamptz`;
}

function dayExpr(q: PostgresQuery) {
  const col = quoteIdent(q.createdAtColumn!);
  if (q.createdAtKind === "epoch_ms") return `(to_timestamp(${col} / 1000.0) at time zone 'UTC')::date`;
  if (q.createdAtKind === "epoch_s") return `(to_timestamp(${col}) at time zone 'UTC')::date`;
  return `(${col} at time zone 'UTC')::date`;
}

export function aliveClauses(q: PostgresQuery) {
  const where: string[] = [];
  const values: string[] = [];
  if (q.deletedAtColumn) where.push(`${quoteIdent(q.deletedAtColumn)} IS NULL`);
  if (q.statusColumn && q.activeStatus !== undefined) {
    values.push(q.activeStatus);
    where.push(`${quoteIdent(q.statusColumn)}::text = $${values.length}`);
  }
  return { where, values };
}

export const fromClause = (q: PostgresQuery) => `${quoteIdent(q.schema)}.${quoteIdent(q.table)}`;

// count(*) of alive rows, optionally created since an ISO timestamp.
export function countQuery(q: PostgresQuery, sinceIso?: string) {
  if (q.sql) return { text: q.sql, values: [sinceIso ?? "1970-01-01T00:00:00Z"] };
  const { where, values } = aliveClauses(q);
  if (sinceIso) {
    values.push(sinceIso);
    where.push(sinceExpr(q, `$${values.length}`));
  }
  return { text: `SELECT count(*)::text AS n FROM ${fromClause(q)}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`, values };
}

// Newest ids (+ timestamps) for identity matching. Bounded; the id is hashed by the sync engine before storage.
export function identityQuery(q: PostgresQuery, limit: number) {
  const { where, values } = aliveClauses(q);
  const at = q.createdAtColumn ? `, ${quoteIdent(q.createdAtColumn)}::text AS at` : "";
  const order = q.createdAtColumn ? ` ORDER BY ${quoteIdent(q.createdAtColumn)} DESC` : "";
  return { text: `SELECT ${quoteIdent(q.idColumn!)}::text AS id${at} FROM ${fromClause(q)}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}${order} LIMIT ${Math.floor(limit)}`, values };
}

// Signups per UTC day since an ISO timestamp (for history reconstruction).
export function dailyQuery(q: PostgresQuery, sinceIso: string) {
  const { where, values } = aliveClauses(q);
  values.push(sinceIso);
  where.push(sinceExpr(q, `$${values.length}`));
  return { text: `SELECT ${dayExpr(q)}::text AS day, count(*)::text AS n FROM ${fromClause(q)} WHERE ${where.join(" AND ")} GROUP BY 1 ORDER BY 1`, values };
}

export const TABLES_SQL = `SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind, GREATEST(c.reltuples, 0)::bigint::text AS estimate
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p','v','m') AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast','extensions','graphql','graphql_public','realtime','storage','vault','supabase_functions','net','pgsodium','cron')
  AND has_table_privilege(c.oid, 'SELECT')
ORDER BY 1, 2`;

export const COLUMNS_SQL = `SELECT column_name AS name, data_type AS type, is_nullable = 'YES' AS nullable
FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`;

export interface TableInfo { schema: string; name: string; kind: string; estimate: number }
export interface ColumnInfo { name: string; type: string; nullable: boolean }

const USER_TABLE_HINTS = ["users", "user", "profiles", "profile", "accounts", "account", "members", "customers", "auth_user", "app_user", "app_users"];
const CREATED_HINTS = ["created_at", "createdat", "inserted_at", "signed_up_at", "created", "date_joined", "registered_at", "joined_at"];
const DELETED_HINTS = ["deleted_at", "deletedat", "removed_at", "archived_at"];
const ID_HINTS = ["id", "user_id", "uid", "userid"];

// Rank candidate tables for the wizard: auth.users first, then name hints, then size.
export function rankTables(tables: TableInfo[]) {
  const score = (t: TableInfo) => {
    const n = t.name.toLowerCase();
    let s = 0;
    if (t.schema === "auth" && n === "users") s += 100;
    const idx = USER_TABLE_HINTS.indexOf(n);
    if (idx >= 0) s += 50 - idx;
    else if (USER_TABLE_HINTS.some((h) => n.includes(h))) s += 10;
    if (t.schema === "public") s += 5;
    return s;
  };
  return [...tables].sort((a, b) => score(b) - score(a) || b.estimate - a.estimate);
}

export function createdAtKindFor(type: string): PostgresQuery["createdAtKind"] | null {
  const t = type.toLowerCase();
  if (t.includes("timestamp") || t === "date") return "timestamp";
  if (t === "bigint" || t === "numeric" || t === "double precision" || t === "real") return "epoch_ms";
  if (t === "integer") return "epoch_s";
  return null;
}

export function suggestColumns(columns: ColumnInfo[]) {
  const pick = (hints: string[], filter: (c: ColumnInfo) => boolean = () => true) => {
    for (const h of hints) {
      const hit = columns.find((c) => c.name.toLowerCase() === h && filter(c));
      if (hit) return hit.name;
    }
    return undefined;
  };
  const createdAt = pick(CREATED_HINTS, (c) => createdAtKindFor(c.type) !== null);
  const createdCol = columns.find((c) => c.name === createdAt);
  return {
    idColumn: pick(ID_HINTS),
    createdAtColumn: createdAt,
    createdAtKind: createdCol ? createdAtKindFor(createdCol.type) ?? undefined : undefined,
    deletedAtColumn: pick(DELETED_HINTS, (c) => c.nullable),
  };
}

export const projectRefFromHost = (host: string) => {
  const m = host.match(/^db\.([a-z0-9]{15,})\.supabase\.(co|com)$/i) ?? host.match(/^([a-z0-9]{15,})\.supabase\.(co|com)$/i);
  return m?.[1] ?? null;
};

export { hostOf };
