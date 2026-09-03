export type ProviderKind = "clerk" | "supabase" | "firebase" | "native" | "auth0" | "posthog" | "plausible" | "ga4" | "stripe" | "revenuecat" | "paddle" | "lemonsqueezy" | "chargebee" | "postgres" | "endpoint" | "manual";
// Provider roles = lifecycle sources. users → signed_up, activation → activated, traffic → reached, conversion → trial + converted.
// "revenue" is the legacy name of "conversion" (stored rows are migrated; normalizeRole() maps it for safety).
export type Role = "users" | "activation" | "traffic" | "conversion";
export type StoredRole = Role | "revenue";
export type LifecycleStage = "reached" | "signed_up" | "activated" | "trial" | "converted";
export type ConversionMode = "active_paid" | "ever_paid" | "first_payment";
export type Trust = "verified" | "unverified" | "pending";
export type Capability = "totalUsers" | "usersInRange" | "activeUsers" | "history" | "activation" | "traffic" | "trial" | "converted" | "identity";

export const ROLES: Role[] = ["users", "activation", "traffic", "conversion"];
// "better_auth" is the v0.6 name of the native SDK provider (rows are migrated by migrations:nativeV1; the literal stays for old documents).
export const normalizeProviderKind = (kind: string): ProviderKind => (kind === "better_auth" ? "native" : (kind as ProviderKind));
export const normalizeRole = (r: StoredRole | undefined): Role => (r === "revenue" ? "conversion" : (r ?? "users"));
export const ROLE_STAGE: Record<Role, LifecycleStage> = { users: "signed_up", activation: "activated", traffic: "reached", conversion: "converted" };
export const DEFAULT_CONVERSION_MODE: ConversionMode = "active_paid";
export const CONVERSION_MODES: ConversionMode[] = ["active_paid", "ever_paid", "first_payment"];
export const CONVERSION_MODE_LABEL: Record<ConversionMode, string> = { active_paid: "Active paid", ever_paid: "Ever paid", first_payment: "First successful payment" };

// Pseudonymous identities a provider can report per stage (stable ids only — never emails or names). The sync engine salts
// and hashes them before storage; providers must cap lists (IDENTITY_CAP) and skip anonymous ids.
export interface StageIdentities { stage: LifecycleStage; ids: { id: string; at?: number }[]; complete: boolean }
export const IDENTITY_CAP = 5_000;
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
  // Conversion stages. Counts of unique users only — no amounts, ever.
  trialUsers?: number;
  newTrials7d?: number;
  newTrials30d?: number;
  convertedUsers?: number;
  newConverted24h?: number;
  newConverted7d?: number;
  newConverted30d?: number;
  conversionMode?: ConversionMode;
  identities?: StageIdentities[];
  // Version of the source-side integration (e.g. @usertrack/node) for compatibility diagnostics.
  sourceVersion?: string;
  protocolVersion?: number;
  // What a native client reported in this pull (roles it serves with the same credential, history / identity support).
  reported?: { roles: Role[]; history: boolean; identity: boolean; exactCounts: boolean };
  /** @deprecated v0.4 endpoint field; mapped to convertedUsers by the endpoint provider. */
  payingUsers?: number;
}

export interface HistoryPoint { day: string; value: number }
export type HistoryMetric = "totalUsers" | "newUsers" | "activatedUsers" | "visitors" | "convertedUsers" | "trialUsers";
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
  trial: boolean;             // reliable trial state (only then is the Trial stage shown)
  converted: boolean;
  identity: boolean;          // reports pseudonymous per-stage ids → cohort matching
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
  // Stable id column → pseudonymous identities for cohort matching (hashed before storage, never emails).
  idColumn?: string;
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
  // Display label for one configuration (native sources show the SDK adapter, e.g. "Better Auth").
  labelFor?(config: Config): string;
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
    trial: role === "conversion" && has("trial"),
    converted: role === "conversion" && has("converted"),
    identity: has("identity"),
  };
}

export function describeProvider<C>(p: Provider<C>, config: C, role: Role): ProviderCapabilities {
  return p.describe ? p.describe(config, role) : capabilitiesFromList(p.capabilities, role);
}

// Public wording for one source. Snapshot-based providers are still "verified" for totals; only self-reported sources drop.
export function verificationLevel(kind: string, trust: Trust, caps: ProviderCapabilities, role: Role): VerificationLevel {
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
