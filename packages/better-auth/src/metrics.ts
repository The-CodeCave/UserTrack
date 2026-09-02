import { MAX_HISTORY_DAYS, type MetricsRequest, type MetricsResponse, PROTOCOL_VERSION, PROVIDER_ID } from "./protocol.js";
import { PLUGIN_VERSION } from "./version.js";

type Where = { field: string; operator?: "eq" | "ne" | "lt" | "lte" | "gt" | "gte"; value: string | number | boolean | Date | null };

/** The subset of the Better Auth adapter the plugin reads. Aggregate queries only. */
export type UserStore = {
  count?: (data: { model: string; where?: Where[] }) => Promise<number>;
  findMany: <T>(data: { model: string; where?: Where[]; limit?: number; offset?: number; select?: string[] }) => Promise<T[]>;
};

const DAY_MS = 86_400_000;
const PAGE = 500;
export const SCAN_LIMIT = 50_000;

export class MetricsError extends Error {
  constructor(message: string, readonly code: "bad_request" | "adapter_error") {
    super(message);
  }
}

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

function dayKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function parseIso(value: unknown, name: string): Date {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new MetricsError(`${name} must be an ISO-8601 timestamp`, "bad_request");
  return new Date(value);
}

export type MetricsOptions = { projectId: string; excludeAnonymous: boolean; now?: number };

export async function collectMetrics(store: UserStore, request: MetricsRequest, opts: MetricsOptions): Promise<MetricsResponse> {
  const now = opts.now ?? Date.now();
  const anon: Where[] = opts.excludeAnonymous ? [{ field: "isAnonymous", operator: "eq", value: true }] : [];
  let exact = true;
  const registered = async (where: Where[]) => {
    const all = await countUsers(store, where);
    exact &&= all.exact;
    if (!opts.excludeAnonymous) return all.count;
    const anonymous = await countUsers(store, [...where, ...anon]);
    exact &&= anonymous.exact;
    return Math.max(0, all.count - anonymous.count);
  };
  const since = (ms: number): Where[] => [{ field: "createdAt", operator: "gte", value: new Date(now - ms) }];

  const totalUsers = await registered([]);
  const newUsers = { "24h": await registered(since(DAY_MS)), "7d": await registered(since(7 * DAY_MS)), "30d": await registered(since(30 * DAY_MS)) };

  const out: MetricsResponse = {
    protocolVersion: PROTOCOL_VERSION,
    pluginVersion: PLUGIN_VERSION,
    provider: PROVIDER_ID,
    projectId: opts.projectId,
    generatedAt: new Date(now).toISOString(),
    totalUsers,
    newUsers,
    capabilities: { exactCounts: true, history: true, anonymousExcluded: opts.excludeAnonymous },
  };

  if (request.days !== undefined) {
    const days = Number(request.days);
    if (!Number.isInteger(days) || days < 1 || days > MAX_HISTORY_DAYS) throw new MetricsError(`days must be an integer between 1 and ${MAX_HISTORY_DAYS}`, "bad_request");
    const todayStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
    const daily: { day: string; newUsers: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const start = todayStart - i * DAY_MS;
      const count = await registered([
        { field: "createdAt", operator: "gte", value: new Date(start) },
        { field: "createdAt", operator: "lt", value: new Date(start + DAY_MS) },
      ]);
      daily.push({ day: dayKey(start), newUsers: count });
    }
    out.daily = daily;
  }

  if (request.from !== undefined || request.to !== undefined) {
    const from = parseIso(request.from, "from");
    const to = parseIso(request.to, "to");
    if (to <= from) throw new MetricsError("to must be after from", "bad_request");
    const count = await registered([
      { field: "createdAt", operator: "gte", value: from },
      { field: "createdAt", operator: "lt", value: to },
    ]);
    out.range = { from: from.toISOString(), to: to.toISOString(), count };
  }

  out.capabilities.exactCounts = exact;
  return out;
}
