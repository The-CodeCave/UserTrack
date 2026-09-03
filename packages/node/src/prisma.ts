import type { CountSource, CountWhere } from "./sources.js";
import { createTracker, type TrackerOptions } from "./track.js";

/** The subset of a Prisma model delegate the adapter uses (`prisma.user.count`). */
export type PrismaCountDelegate = { count(args?: { where?: Record<string, unknown> }): Promise<number> };

export type PrismaUsersOptions = {
  /** Timestamp column used for windows/history. Default "createdAt"; `null` if the model has none (totals only). */
  createdAtField?: string | null;
  /** Extra filter merged into every count, e.g. `{ deletedAt: null }` or `{ role: "customer" }`. */
  where?: Record<string, unknown>;
};

/** `prismaUsers(prisma.user)` → aggregate counts only; no rows are ever read. Works for any model with a timestamp. */
export function prismaUsers(model: PrismaCountDelegate, options: PrismaUsersOptions = {}): CountSource {
  const field = options.createdAtField === undefined ? "createdAt" : options.createdAtField;
  if (!model || typeof model.count !== "function") throw new Error('@usertrack/node/prisma: pass a model delegate with a count() method, e.g. prismaUsers(prisma.user)');
  return {
    timeFilter: field !== null,
    count: (where: CountWhere) => {
      const range: Record<string, Date> = {};
      if (where.createdAtGte) range.gte = where.createdAtGte;
      if (where.createdAtLt) range.lt = where.createdAtLt;
      const filter = { ...(options.where ?? {}), ...(field && Object.keys(range).length ? { [field]: range } : {}) };
      return model.count(Object.keys(filter).length ? { where: filter } : undefined);
    },
  };
}

export type PrismaExtensionOptions = TrackerOptions & {
  /** Model name in the `query` extension, lowercased as Prisma exposes it. Default "user". */
  model?: string;
  idField?: string;
  createdAtField?: string;
};

type QueryHook = (params: { args: unknown; query: (args: unknown) => Promise<unknown> }) => Promise<unknown>;

/**
 * Prisma client extension pushing `user.created` / `user.deleted` after the write succeeded:
 * `new PrismaClient().$extends(userTrackPrismaExtension({ projectId, secret }))`. `createMany` is not hooked (no rows returned).
 */
export function userTrackPrismaExtension(options: PrismaExtensionOptions) {
  const { model = "user", idField = "id", createdAtField = "createdAt", ...trackerOptions } = options;
  const tracker = createTracker({ source: "prisma", ...trackerOptions });
  const row = (r: unknown) => (r && typeof r === "object" ? (r as Record<string, unknown>) : null);
  const create: QueryHook = async ({ args, query }) => {
    const result = await query(args);
    const r = row(result);
    if (r && r[idField] !== undefined) tracker.track("user.created", { id: String(r[idField]), ...(r[createdAtField] instanceof Date ? { at: r[createdAtField] as Date } : {}) });
    return result;
  };
  const del: QueryHook = async ({ args, query }) => {
    const result = await query(args);
    const r = row(result);
    if (r && r[idField] !== undefined) tracker.track("user.deleted", { id: String(r[idField]) });
    return result;
  };
  return { name: "usertrack", query: { [model]: { create, delete: del } } };
}
