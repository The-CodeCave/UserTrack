export type ProviderKind = "clerk" | "supabase" | "firebase" | "auth0" | "posthog" | "plausible" | "ga4" | "stripe" | "endpoint" | "manual";
export type Role = "users" | "activation" | "traffic" | "revenue";
export type Trust = "verified" | "unverified" | "pending";
export type Capability = "totalUsers" | "usersInRange" | "activeUsers" | "history" | "activation" | "traffic" | "revenue";

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

export async function fetchJson<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
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
