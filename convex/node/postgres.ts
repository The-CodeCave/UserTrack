"use node";
// Node runtime: the only place UserTrack opens TCP connections. Read-only session, bounded timeouts, aggregates only.
import { Client, type ClientConfig } from "pg";
import { ConvexError, v } from "convex/values";
import { internalAction } from "../_generated/server";
import { integrationRole } from "../schema";
import { COLUMNS_SQL, TABLES_SQL, countQuery, dailyQuery, rankTables, suggestColumns, type ColumnInfo, type TableInfo } from "../providers/postgres";
import { DAY_MS, dayKey, isoDaysAgo, type History, type PostgresQuery, type ProviderMetrics, type Role } from "../providers/types";

const CONNECT_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 20_000;
const MAX_TABLES = 200;

const pgQueryArg = v.object({
  connectionString: v.string(),
  ssl: v.union(v.literal("require"), v.literal("disable")),
  schema: v.string(),
  table: v.string(),
  createdAtColumn: v.optional(v.string()),
  createdAtKind: v.optional(v.union(v.literal("timestamp"), v.literal("epoch_ms"), v.literal("epoch_s"))),
  deletedAtColumn: v.optional(v.string()),
  statusColumn: v.optional(v.string()),
  activeStatus: v.optional(v.string()),
  sql: v.optional(v.string()),
});

// Actionable, secret-free error messages. `retryable` drives the sync engine's retry policy.
export function explain(e: unknown): { message: string; retryable: boolean } {
  const err = e as NodeJS.ErrnoException & { code?: string; routine?: string };
  const code = err?.code ?? "";
  const msg = String(err?.message ?? e);
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { message: "Host not found — check the hostname in the connection string", retryable: false };
  if (code === "ECONNREFUSED") return { message: "Connection refused — is the database reachable from the internet and the port correct?", retryable: false };
  if (code === "ETIMEDOUT" || /timeout/i.test(msg)) return { message: "Connection timed out — allow inbound connections from the internet (or use your provider's connection pooler)", retryable: true };
  if (code === "28P01" || code === "28000") return { message: "Password authentication failed — check user and password (URL-encode special characters)", retryable: false };
  if (code === "3D000") return { message: "Database does not exist — check the database name at the end of the connection string", retryable: false };
  if (code === "42P01") return { message: "Table not found — check schema and table name", retryable: false };
  if (code === "42703") return { message: `Column not found — ${msg.replace(/^column /, "")}`, retryable: false };
  if (code === "42501") return { message: "Permission denied — grant SELECT on the table to this database user", retryable: false };
  if (code === "57014") return { message: "Query timed out (20s) — add an index on the timestamp column or use a smaller table/view", retryable: true };
  if (code === "25006") return { message: "Query tried to write — only read-only SELECT statements are allowed", retryable: false };
  if (/SSL|TLS|certificate/i.test(msg)) return { message: `SSL problem: ${msg}. Try switching SSL to "${/does not support SSL/i.test(msg) ? "disable" : "require"}"`, retryable: false };
  if (/password must be a string|SASL/i.test(msg)) return { message: "The connection string is missing a password", retryable: false };
  return { message: msg.slice(0, 200), retryable: !/syntax|invalid|does not exist/i.test(msg) };
}

async function withClient<T>(q: PostgresQuery, fn: (c: Client) => Promise<T>): Promise<T> {
  const cfg: ClientConfig = {
    connectionString: q.connectionString,
    ssl: q.ssl === "require" ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    query_timeout: STATEMENT_TIMEOUT_MS,
    application_name: "usertrack",
  };
  const client = new Client(cfg);
  try {
    await client.connect();
    await client.query("SET default_transaction_read_only = on");
    return await fn(client);
  } catch (e) {
    throw new ConvexError(explain(e));
  } finally {
    await client.end().catch(() => {});
  }
}

const num = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new ConvexError({ message: "Query did not return a non-negative count", retryable: false });
  return Math.floor(n);
};

async function count(c: Client, q: PostgresQuery, sinceIso?: string) {
  const { text, values } = countQuery(q, sinceIso);
  const res = await c.query(text, values);
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new ConvexError({ message: "Query returned no rows", retryable: false });
  const val = row.n ?? row.count ?? Object.values(row)[0];
  return num(val);
}

async function metrics(c: Client, q: PostgresQuery, role: Role): Promise<ProviderMetrics> {
  const ranged = Boolean(q.createdAtColumn || q.sql);
  const total = await count(c, q);
  if (!ranged) return role === "activation" ? { activatedUsers: total } : { totalUsers: total };
  const [r24, r7, r30] = await Promise.all([count(c, q, isoDaysAgo(1)), count(c, q, isoDaysAgo(7)), count(c, q, isoDaysAgo(30))]);
  return role === "activation"
    ? { activatedUsers: total, activated24h: r24, activated7d: r7, activated30d: r30 }
    : { totalUsers: total, newUsers24h: r24, newUsers7d: r7, newUsers30d: r30 };
}

export const fetch = internalAction({
  args: { pg: pgQueryArg, role: integrationRole },
  handler: async (_ctx, { pg, role }): Promise<ProviderMetrics> => withClient(pg, (c) => metrics(c, pg, role)),
});

// Daily signups → the engine reconstructs totals backwards from the current total (users) or forwards (activation).
export const fetchHistory = internalAction({
  args: { pg: pgQueryArg, role: integrationRole, days: v.number() },
  handler: async (_ctx, { pg, role, days }): Promise<History | null> => {
    if (!pg.createdAtColumn || pg.sql) return null;
    return withClient(pg, async (c) => {
      const since = isoDaysAgo(days);
      const { text, values } = dailyQuery(pg, since);
      const res = await c.query(text, values);
      const perDay = new Map<string, number>();
      for (const r of res.rows as { day: string; n: string }[]) perDay.set(String(r.day).slice(0, 10), num(r.n));
      const start = Date.now() - days * DAY_MS;
      const points: { day: string; value: number }[] = [];
      for (let i = 0; i <= days; i++) {
        const day = dayKey(start + i * DAY_MS);
        points.push({ day, value: perDay.get(day) ?? 0 });
      }
      if (role !== "activation") return { metric: "newUsers", points };
      const total = await count(c, pg);
      let running = Math.max(0, total - points.reduce((s, p) => s + p.value, 0));
      return { metric: "activatedUsers", points: points.map((p) => ({ day: p.day, value: (running += p.value) })) };
    });
  },
});

// Wizard support: tables (with row estimates) or the columns of one table plus a suggested mapping + preview count.
type Introspection =
  | { server: string; tables: TableInfo[] }
  | { server: string; columns: ColumnInfo[]; suggested: ReturnType<typeof suggestColumns>; total: number };

export const introspect = internalAction({
  args: { connectionString: v.string(), ssl: v.union(v.literal("require"), v.literal("disable")), schema: v.optional(v.string()), table: v.optional(v.string()) },
  handler: async (_ctx, { connectionString, ssl, schema, table }): Promise<Introspection> => {
    const base: PostgresQuery = { connectionString, ssl, schema: schema ?? "public", table: table ?? "" };
    return withClient(base, async (c) => {
      const version = (await c.query("SELECT version()")).rows[0]?.version as string | undefined;
      const server = version?.match(/PostgreSQL [\d.]+/)?.[0] ?? "PostgreSQL";
      if (!table) {
        const rows = (await c.query(TABLES_SQL)).rows as { schema: string; name: string; kind: string; estimate: string }[];
        const tables: TableInfo[] = rows.slice(0, MAX_TABLES).map((r) => ({ schema: r.schema, name: r.name, kind: r.kind === "v" || r.kind === "m" ? "view" : "table", estimate: Number(r.estimate) }));
        return { server, tables: rankTables(tables) };
      }
      const cols = (await c.query(COLUMNS_SQL, [base.schema, table])).rows as ColumnInfo[];
      if (!cols.length) throw new ConvexError({ message: `Table ${base.schema}.${table} not found or not readable`, retryable: false });
      const columns = cols.map((x) => ({ name: x.name, type: x.type, nullable: Boolean(x.nullable) }));
      const suggested = suggestColumns(columns);
      const total = await count(c, base);
      return { server, columns, suggested, total };
    });
  },
});
