export type ProviderKind = "clerk" | "supabase" | "firebase" | "auth0" | "posthog" | "plausible" | "ga4" | "stripe" | "postgres" | "endpoint" | "manual";
export type Role = "users" | "activation" | "traffic" | "revenue";
export type Trust = "verified" | "unverified" | "pending";
export type Capability = "totalUsers" | "usersInRange" | "activeUsers" | "history" | "activation" | "traffic" | "revenue";
// Public verification wording per source. `partially_verified` = verified provider whose range metrics are derived, not read.
export type VerificationLevel = "verified" | "partially_verified" | "self_reported";
export type Runtime = "v8" | "node";

// Everything a provider can report in one fetch. All fields optional; the sync engine records what is present.
export interface ProviderMetrics {
  totalUsers?: number;
  newUsers24h?: number;
  newUsers7d?: number;
  newUsers30d?: number;
  activeUsers30d?: number;
  activatedUsers?: number;
  activated24h?: number;
  activated7d?: number;
  activated30d?: number;
  visitors30d?: number;
  sessions30d?: number;
  visitorsPrev30d?: number;
  payingUsers?: number;
  mrr?: number;
  currency?: string;
}

export interface HistoryPoint { day: string; value: number }
export type HistoryMetric = "totalUsers" | "newUsers" | "activatedUsers" | "visitors";
export interface History { metric: HistoryMetric; points: HistoryPoint[] }

export type Validation<Config> = { ok: true; config: Config } | { ok: false; error: string };

// Capability model: what a configured source can actually deliver. Shown to founders, agents and the public provenance panel.
export interface ProviderCapabilities {
  totalUsers: boolean;
  createdUsers: boolean;      // 24h / 7d / 30d read from the source (otherwise derived from snapshot deltas)
  historicalUsers: boolean;   // backfill of daily history on connect
  activationEvents: boolean;
  retention: boolean;         // active users → estimated retention
  traffic: boolean;
  revenue: boolean;
}

// Aggregate SQL description consumed by the Node runtime (convex/node/postgres.ts). Built by postgres + supabase adapters.
export interface PostgresQuery {
  connectionString: string;
  ssl: "require" | "disable";
  schema: string;
  table: string;
  createdAtColumn?: string;
  createdAtKind?: "timestamp" | "epoch_ms" | "epoch_s";
  deletedAtColumn?: string;
  statusColumn?: string;
  activeStatus?: string;
  // Custom aggregate: a single SELECT returning one row; `$1` is the "since" timestamp. Activation role only.
  sql?: string;
}

export interface Provider<Config> {
  kind: ProviderKind;
  label: string;
  roles: Role[];
  capabilities: Capability[];
  validate(config: unknown, role: Role): Validation<Config>;
  // Trust the provider grants once a fetch succeeds.
  trust(config: Config, saasWebsiteUrl: string): Trust;
  fetch(config: Config, role: Role): Promise<ProviderMetrics>;
  // Optional one-time backfill on connect. Returns daily points (UTC day keys), oldest first.
  fetchHistory?(config: Config, role: Role, days: number): Promise<History | null>;
  // Secret-free view of the config for the UI.
  publicConfig(config: Config): Record<string, string>;
  // Capabilities for one concrete configuration (defaults to the static list).
  describe?(config: Config, role: Role): ProviderCapabilities;
  // "node" = needs a TCP database connection; the engine dispatches to internal.node.postgres with `toPostgres(config)`.
  runtime?(config: Config): Runtime;
  toPostgres?(config: Config, role: Role): PostgresQuery;
}

export function capabilitiesFromList(list: Capability[], role: Role): ProviderCapabilities {
  const has = (c: Capability) => list.includes(c);
  return {
    totalUsers: role === "users" && has("totalUsers"),
    createdUsers: role === "users" && has("usersInRange"),
    historicalUsers: (role === "users" || role === "activation") && has("history"),
    activationEvents: role === "activation" && has("activation"),
    retention: role === "users" && has("activeUsers"),
    traffic: role === "traffic" && has("traffic"),
    revenue: role === "revenue" && has("revenue"),
  };
}

export function describeProvider<C>(p: Provider<C>, config: C, role: Role): ProviderCapabilities {
  return p.describe ? p.describe(config, role) : capabilitiesFromList(p.capabilities, role);
}

// Public wording for one source. Snapshot-based providers are still "verified" for totals; only self-reported sources drop.
export function verificationLevel(kind: ProviderKind, trust: Trust, caps: ProviderCapabilities, role: Role): VerificationLevel {
  if (trust !== "verified") return "self_reported";
  if (kind === "manual") return "self_reported";
  if (role === "users" && !caps.createdUsers && !caps.totalUsers) return "partially_verified";
  return "verified";
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function sameSite(a: string, b: string) {
  const ha = hostOf(a);
  const hb = hostOf(b);
  if (!ha || !hb) return false;
  return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
}

export class ProviderError extends Error {
  constructor(message: string, public readonly retryable = true) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_BACKOFF_MS = 5_000;

// fetch + JSON with one bounded retry on 429 / 503 (honours Retry-After up to 5s) so provider rate limits fail soft.
export async function fetchJson<T = Record<string, unknown>>(url: string, init?: RequestInit, attempt = 0): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    if ((res.status === 429 || res.status === 503) && attempt < 2) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "1");
      await sleep(Math.min(MAX_BACKOFF_MS, (Number.isFinite(retryAfter) ? retryAfter : 1) * 1000 * (attempt + 1)));
      return fetchJson<T>(url, init, attempt + 1);
    }
    const retryable = res.status === 429 || res.status >= 500;
    throw new ProviderError(`${res.status} ${res.statusText} from ${hostOf(url) ?? url}`, retryable);
  }
  return res.json() as Promise<T>;
}

export function asCount(v: unknown, what: string) {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) throw new ProviderError(`${what} is not a valid count`, false);
  return Math.floor(n);
}

export function str(c: unknown, key: string) {
  const v = (c as Record<string, unknown> | null | undefined)?.[key];
  return typeof v === "string" ? v.trim() : "";
}

export const DAY_MS = 86_400_000;
export const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);
export const isoDaysAgo = (days: number, now = Date.now()) => new Date(now - days * DAY_MS).toISOString();

// Run `fn` over `items` with at most `limit` in flight. Used for provider history backfills.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
