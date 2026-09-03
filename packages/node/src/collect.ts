import { IDENTITY_CAP, MAX_HISTORY_DAYS, type ActivationMetrics, type ConversionMetrics, type Identities, type Identity, type MetricsRequest, type MetricsResponse, type MetricsRole, type NativeSource, PROTOCOL_VERSION, type UsersMetrics } from "@usertrack/protocol";
import type { CountResult, CountSource, CountWhere, Sources } from "./sources.js";

const DAY_MS = 86_400_000;

export class MetricsError extends Error {
  constructor(message: string, readonly code: "bad_request" | "source_error") {
    super(message);
  }
}

export type CollectOptions = { projectId: string; source: NativeSource; clientVersion: string; now?: number; anonymousExcluded?: boolean };

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

function parseIso(value: unknown, name: string): Date {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new MetricsError(`${name} must be an ISO-8601 timestamp`, "bad_request");
  return new Date(value);
}

function normalize(r: CountResult, what: string): { count: number; exact: boolean } {
  const out = typeof r === "number" ? { count: r, exact: true } : { count: Number(r?.count), exact: r?.exact !== false };
  if (!Number.isFinite(out.count) || out.count < 0) throw new MetricsError(`${what} returned an invalid count`, "source_error");
  return { count: Math.floor(out.count), exact: out.exact };
}

function cleanIdentities(raw: Identities | undefined): Identities | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Identities = {};
  for (const stage of ["signedUp", "activated", "trial", "converted"] as const) {
    const list = raw[stage];
    if (!Array.isArray(list)) continue;
    out[stage] = list
      .map((x): Identity | null => {
        const r = x as { id?: unknown; at?: unknown } | null;
        if (!r || typeof r !== "object" || (typeof r.id !== "string" && typeof r.id !== "number")) return null;
        const at = r.at instanceof Date ? r.at.toISOString() : typeof r.at === "string" || typeof r.at === "number" ? r.at : undefined;
        return { id: String(r.id), ...(at !== undefined ? { at } : {}) };
      })
      .filter((x): x is Identity => x !== null && x.id.trim().length > 0 && !x.id.includes("@"))
      .slice(0, IDENTITY_CAP);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Runs the configured sources for one metrics request. Throws MetricsError("bad_request") for invalid parameters. */
export async function collectMetrics(sources: Sources, request: MetricsRequest, opts: CollectOptions): Promise<MetricsResponse> {
  const now = opts.now ?? Date.now();
  let exact = true;
  const read = async (src: CountSource, where: CountWhere, what: string) => {
    const r = normalize(await src.count(where), what);
    exact &&= r.exact;
    return r.count;
  };
  const since = (ms: number): CountWhere => ({ createdAtGte: new Date(now - ms) });
  const windows = async (src: CountSource, what: string) => (src.timeFilter === false ? undefined : { "24h": await read(src, since(DAY_MS), what), "7d": await read(src, since(7 * DAY_MS), what), "30d": await read(src, since(30 * DAY_MS), what) });

  let days: number | undefined;
  if (request.days !== undefined) {
    days = Number(request.days);
    if (!Number.isInteger(days) || days < 1 || days > MAX_HISTORY_DAYS) throw new MetricsError(`days must be an integer between 1 and ${MAX_HISTORY_DAYS}`, "bad_request");
  }
  const todayStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const daily = async <K extends string>(src: CountSource, key: K, what: string) => {
    if (days === undefined || src.timeFilter === false) return undefined;
    const points: ({ day: string } & Record<K, number>)[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const start = todayStart - i * DAY_MS;
      const count = await read(src, { createdAtGte: new Date(start), createdAtLt: new Date(start + DAY_MS) }, what);
      points.push({ day: dayKey(start), [key]: count } as { day: string } & Record<K, number>);
    }
    return points;
  };

  const users: UsersMetrics = { totalUsers: await read(sources.users, {}, "users") };
  const newUsers = await windows(sources.users, "users");
  if (newUsers) users.newUsers = newUsers;
  const usersDaily = await daily(sources.users, "newUsers", "users");
  if (usersDaily) users.daily = usersDaily;
  if (request.from !== undefined || request.to !== undefined) {
    const from = parseIso(request.from, "from");
    const to = parseIso(request.to, "to");
    if (to <= from) throw new MetricsError("to must be after from", "bad_request");
    if (sources.users.timeFilter === false) throw new MetricsError("this source cannot count by date range", "bad_request");
    users.range = { from: from.toISOString(), to: to.toISOString(), count: await read(sources.users, { createdAtGte: from, createdAtLt: to }, "users") };
  }
  const roles: MetricsRole[] = ["users"];

  let activation: ActivationMetrics | undefined;
  if (sources.activation) {
    roles.push("activation");
    activation = { activatedUsers: await read(sources.activation, {}, "activation") };
    const w = await windows(sources.activation, "activation");
    if (w) Object.assign(activation, { activated24h: w["24h"], activated7d: w["7d"], activated30d: w["30d"] });
    const d = await daily(sources.activation, "activatedUsers", "activation");
    if (d) activation.daily = d;
  }

  let conversion: ConversionMetrics | undefined;
  if (sources.conversion) {
    roles.push("conversion");
    const c = sources.conversion;
    conversion = { convertedUsers: await read(c.converted, {}, "conversion.converted"), mode: c.mode ?? "active_paid" };
    const w = await windows(c.converted, "conversion.converted");
    if (w) Object.assign(conversion, { newConverted24h: w["24h"], newConverted7d: w["7d"], newConverted30d: w["30d"] });
    if (c.trial) {
      conversion.trialUsers = await read(c.trial, {}, "conversion.trial");
      const t = await windows(c.trial, "conversion.trial");
      if (t) Object.assign(conversion, { newTrials7d: t["7d"], newTrials30d: t["30d"] });
    }
  }

  const identities = sources.identities ? cleanIdentities(await sources.identities()) : undefined;

  return {
    protocolVersion: PROTOCOL_VERSION,
    clientVersion: opts.clientVersion,
    source: opts.source,
    projectId: opts.projectId,
    generatedAt: new Date(now).toISOString(),
    users,
    ...(activation ? { activation } : {}),
    ...(conversion ? { conversion } : {}),
    ...(identities ? { identities } : {}),
    capabilities: { exactCounts: exact, history: sources.users.timeFilter !== false, ...(opts.anonymousExcluded !== undefined ? { anonymousExcluded: opts.anonymousExcluded } : {}), roles },
  };
}
