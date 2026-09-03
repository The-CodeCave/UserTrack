import type { CountSource, CountWhere } from "@usertrack/node";

type Where = { field: string; operator?: "eq" | "ne" | "lt" | "lte" | "gt" | "gte"; value: string | number | boolean | Date | null };

/** The subset of the Better Auth adapter the plugin reads. Aggregate queries only. */
export type UserStore = {
  count?: (data: { model: string; where?: Where[] }) => Promise<number>;
  findMany: <T>(data: { model: string; where?: Where[]; limit?: number; offset?: number; select?: string[] }) => Promise<T[]>;
};

const PAGE = 500;
export const SCAN_LIMIT = 50_000;

export type CountResult = { count: number; exact: boolean };

/** `count` when the adapter supports it, otherwise a bounded id-only scan. */
export async function countUsers(store: UserStore, where: Where[]): Promise<CountResult> {
  if (typeof store.count === "function") {
    const n = await store.count({ model: "user", where });
    if (Number.isFinite(n) && n >= 0) return { count: n, exact: true };
  }
  let count = 0;
  for (let offset = 0; offset < SCAN_LIMIT; offset += PAGE) {
    const rows = await store.findMany<{ id: string }>({ model: "user", where, limit: PAGE, offset, select: ["id"] });
    count += rows.length;
    if (rows.length < PAGE) return { count, exact: true };
  }
  return { count, exact: false };
}

/** Registered users of the Better Auth `user` model as a UserTrack count source (anonymous-plugin users excluded on request). */
export function betterAuthUsers(store: UserStore, opts: { excludeAnonymous: boolean }): CountSource {
  const anon: Where[] = opts.excludeAnonymous ? [{ field: "isAnonymous", operator: "eq", value: true }] : [];
  return {
    timeFilter: true,
    count: async (w: CountWhere) => {
      const where: Where[] = [];
      if (w.createdAtGte) where.push({ field: "createdAt", operator: "gte", value: w.createdAtGte });
      if (w.createdAtLt) where.push({ field: "createdAt", operator: "lt", value: w.createdAtLt });
      const all = await countUsers(store, where);
      if (!opts.excludeAnonymous) return all;
      const anonymous = await countUsers(store, [...where, ...anon]);
      return { count: Math.max(0, all.count - anonymous.count), exact: all.exact && anonymous.exact };
    },
  };
}
