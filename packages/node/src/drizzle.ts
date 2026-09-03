import { and, count, gte, lt, type AnyColumn, type SQL } from "drizzle-orm";
import type { CountSource, CountWhere } from "./sources.js";

/** The subset of a Drizzle database the adapter uses: `db.select({ n: count() }).from(table).where(…)`. */
export type DrizzleDb = { select(fields: { n: SQL<number> }): { from(table: unknown): { where(condition: SQL | undefined): PromiseLike<{ n: number | string }[]> } } };

export type DrizzleUsersOptions = {
  /** Timestamp column, e.g. `users.createdAt`. Omit for totals only. */
  createdAt?: AnyColumn;
  /** Extra condition and-ed into every count, e.g. `isNull(users.deletedAt)`. */
  where?: SQL;
};

/** `drizzleUsers(db, users, { createdAt: users.createdAt })` → `select count(*)` with time filters. Rows are never read. */
export function drizzleUsers(db: DrizzleDb, table: unknown, options: DrizzleUsersOptions = {}): CountSource {
  if (!db || typeof db.select !== "function") throw new Error("@usertrack/node/drizzle: pass your drizzle database instance as the first argument");
  return {
    timeFilter: Boolean(options.createdAt),
    count: async (where: CountWhere) => {
      const conditions: (SQL | undefined)[] = [options.where];
      if (options.createdAt && where.createdAtGte) conditions.push(gte(options.createdAt, where.createdAtGte));
      if (options.createdAt && where.createdAtLt) conditions.push(lt(options.createdAt, where.createdAtLt));
      const present = conditions.filter((c): c is SQL => c !== undefined);
      const rows = await db.select({ n: count() }).from(table).where(present.length ? and(...present) : undefined);
      return Number(rows[0]?.n ?? 0);
    },
  };
}
