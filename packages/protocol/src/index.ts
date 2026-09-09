/**
 * UserTrack native integration wire protocol (v1).
 * Both directions (UserTrack → client metrics pull, client → UserTrack lifecycle events)
 * are authenticated with HMAC-SHA256 over a canonical string. Runs on WebCrypto only.
 */
export const PROTOCOL_VERSION = 1 as const;

export const NATIVE_SOURCES = ["better-auth", "prisma", "drizzle", "convex", "authjs", "custom"] as const;
export type NativeSource = (typeof NATIVE_SOURCES)[number];

export const METRICS_PATH = "/usertrack/metrics" as const;
export const EVENTS_PATH = "/api/integrations/native/events" as const;
/** Path the 0.1.x Better Auth plugin signs events with; UserTrack keeps accepting it. */
export const LEGACY_EVENTS_PATH = "/api/integrations/better-auth/events" as const;
export const DEFAULT_ENDPOINT = "https://usertrack.dev" as const;

export const HEADER_PROJECT = "x-usertrack-project" as const;
export const HEADER_TIMESTAMP = "x-usertrack-timestamp" as const;
export const HEADER_NONCE = "x-usertrack-nonce" as const;
export const HEADER_SIGNATURE = "x-usertrack-signature" as const;

export const TIMESTAMP_TOLERANCE_MS = 5 * 60_000;
export const MAX_HISTORY_DAYS = 90;
export const IDENTITY_CAP = 5000;

export const ERROR_CODES = {
  USERTRACK_UNAUTHORIZED: "UserTrack signature invalid",
  USERTRACK_STALE_REQUEST: "UserTrack request timestamp outside the accepted window",
  USERTRACK_REPLAY: "UserTrack request nonce already used",
  USERTRACK_BAD_REQUEST: "UserTrack metrics request is malformed",
  USERTRACK_SOURCE_ERROR: "UserTrack could not count users with the configured data source",
} as const;
export type ErrorCode = keyof typeof ERROR_CODES;

export type SignatureInput = {
  method: "REQUEST" | "RESPONSE";
  path: string;
  timestamp: number;
  nonce: string;
  body: string;
};

export type MetricsRole = "users" | "activation" | "conversion";
export type ConversionMode = "active_paid" | "ever_paid" | "first_payment";

export type MetricsRequest = {
  protocolVersion: typeof PROTOCOL_VERSION;
  /** Daily series for the trailing N days (1–90). */
  days?: number;
  /** Count users created in [from, to) — ISO timestamps. */
  from?: string;
  to?: string;
};

export type DailyPoint = { day: string; newUsers: number };

export type UsersMetrics = {
  totalUsers: number;
  newUsers?: { "24h": number; "7d": number; "30d": number };
  daily?: DailyPoint[];
  range?: { from: string; to: string; count: number };
};

export type ActivationMetrics = {
  activatedUsers: number;
  activated24h?: number;
  activated7d?: number;
  activated30d?: number;
  daily?: { day: string; activatedUsers: number }[];
};

export type ConversionMetrics = {
  convertedUsers: number;
  newConverted24h?: number;
  newConverted7d?: number;
  newConverted30d?: number;
  trialUsers?: number;
  newTrials7d?: number;
  newTrials30d?: number;
  mode?: ConversionMode;
};

/** Stable ids only (never emails); `at` is an ISO timestamp or epoch milliseconds. */
export type Identity = { id: string; at?: string | number };
export type Identities = { signedUp?: Identity[]; activated?: Identity[]; trial?: Identity[]; converted?: Identity[] };

export type MetricsCapabilities = {
  exactCounts: boolean;
  history: boolean;
  anonymousExcluded?: boolean;
  /** Roles present in this response. Absent = users only (0.1.x Better Auth plugin). */
  roles?: MetricsRole[];
};

/**
 * v1 response. The users-only shape of the 0.1.x Better Auth plugin (top-level `totalUsers`, `newUsers`, `daily`,
 * `pluginVersion`, `provider`) stays valid; newer clients add `source`, `clientVersion` and the role blocks.
 */
export type MetricsResponse = {
  protocolVersion: typeof PROTOCOL_VERSION;
  clientVersion?: string;
  /** @deprecated alias of clientVersion kept for the 0.1.x Better Auth plugin. */
  pluginVersion?: string;
  source?: NativeSource;
  /** @deprecated 0.1.x name of `source`. */
  provider?: string;
  projectId: string;
  generatedAt: string;
  users?: UsersMetrics;
  activation?: ActivationMetrics;
  conversion?: ConversionMetrics;
  identities?: Identities;
  capabilities: MetricsCapabilities;
} & Partial<UsersMetrics>;

export const LIFECYCLE_EVENT_TYPES = ["user.created", "user.deleted", "user.activated", "trial.started", "user.converted"] as const;
export type LifecycleEventType = (typeof LIFECYCLE_EVENT_TYPES)[number];

export type LifecycleEvent = {
  protocolVersion: typeof PROTOCOL_VERSION;
  clientVersion?: string;
  /** @deprecated alias of clientVersion. */
  pluginVersion?: string;
  source?: NativeSource;
  /** @deprecated 0.1.x name of `source`. */
  provider?: string;
  projectId: string;
  eventId: string;
  type: LifecycleEventType;
  /** HMAC-derived pseudonymous subject, never the raw user id. */
  subject: string;
  occurredAt: string;
};

export type VerifyResult = { ok: true; timestamp: number; nonce: string } | { ok: false; reason: "missing_headers" | "bad_timestamp" | "stale" | "bad_signature"; timestamp?: number; nonce?: string };

const enc = new TextEncoder();

// No `node:crypto` fallback on purpose: a static `import("node:crypto")` makes bundlers for isolate
// runtimes (Convex, Workers, Deno, Edge) fail to build even though the branch never runs there.
async function subtle(): Promise<SubtleCrypto> {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.subtle) return c.subtle;
  throw new Error("UserTrack requires the Web Crypto API (globalThis.crypto.subtle), available in Node 19+, Convex, Deno, Bun, Cloudflare Workers and Edge runtimes.");
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  return hex(await (await subtle()).digest("SHA-256", enc.encode(input)));
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const s = await subtle();
  const key = await s.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await s.sign("HMAC", key, enc.encode(message)));
}

export function canonicalString(input: SignatureInput, bodyHash: string): string {
  return ["v1", input.method, input.path, String(input.timestamp), input.nonce, bodyHash].join("\n");
}

export async function sign(secret: string, input: SignatureInput): Promise<string> {
  return `v1=${await hmacHex(secret, canonicalString(input, await sha256Hex(input.body)))}`;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export type SignedHeaders = Record<typeof HEADER_PROJECT | typeof HEADER_TIMESTAMP | typeof HEADER_NONCE | typeof HEADER_SIGNATURE, string>;

export function randomNonce(): string {
  const bytes = new Uint8Array(16);
  (globalThis as { crypto?: Crypto }).crypto?.getRandomValues(bytes);
  return hex(bytes.buffer);
}

export function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return randomNonce();
}

export async function signedHeaders(secret: string, projectId: string, input: Omit<SignatureInput, "timestamp" | "nonce"> & { timestamp?: number; nonce?: string }): Promise<SignedHeaders> {
  const timestamp = input.timestamp ?? Date.now();
  const nonce = input.nonce ?? randomNonce();
  const signature = await sign(secret, { ...input, timestamp, nonce });
  return { [HEADER_PROJECT]: projectId, [HEADER_TIMESTAMP]: String(timestamp), [HEADER_NONCE]: nonce, [HEADER_SIGNATURE]: signature };
}

export type HeaderReader = { get(name: string): string | null | undefined } | Record<string, string | string[] | undefined>;

export function readHeader(h: HeaderReader, name: string): string | undefined {
  if (typeof (h as { get?: unknown }).get === "function") return (h as { get(n: string): string | null | undefined }).get(name) ?? undefined;
  const v = (h as Record<string, string | string[] | undefined>)[name] ?? (h as Record<string, string | string[] | undefined>)[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

export type VerifyOptions = { now?: number; toleranceMs?: number; expectedNonce?: string };

/** Verify a signed request or response. `expectedNonce` binds a response to the request that produced it. */
export async function verify(secret: string, headers: HeaderReader, input: Omit<SignatureInput, "timestamp" | "nonce">, opts: VerifyOptions = {}): Promise<VerifyResult> {
  const ts = readHeader(headers, HEADER_TIMESTAMP);
  const nonce = readHeader(headers, HEADER_NONCE);
  const signature = readHeader(headers, HEADER_SIGNATURE);
  if (!ts || !nonce || !signature) return { ok: false, reason: "missing_headers" };
  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "bad_timestamp" };
  if (Math.abs((opts.now ?? Date.now()) - timestamp) > (opts.toleranceMs ?? TIMESTAMP_TOLERANCE_MS)) return { ok: false, reason: "stale", timestamp, nonce };
  if (opts.expectedNonce !== undefined && !timingSafeEqual(opts.expectedNonce, nonce)) return { ok: false, reason: "bad_signature", timestamp, nonce };
  const expected = await sign(secret, { ...input, timestamp, nonce });
  if (!timingSafeEqual(expected, signature)) return { ok: false, reason: "bad_signature", timestamp, nonce };
  return { ok: true, timestamp, nonce };
}

/** Stable pseudonymous subject for a user id: HMAC keyed with the integration secret, truncated. */
export async function pseudonymize(secret: string, userId: string): Promise<string> {
  return (await hmacHex(`${secret}:subject`, userId)).slice(0, 32);
}

/** Bounded in-memory nonce cache for best-effort replay protection within the tolerance window. */
export class NonceCache {
  private seen = new Map<string, number>();
  constructor(private readonly ttlMs = TIMESTAMP_TOLERANCE_MS * 2, private readonly max = 5000) {}
  /** Returns false if the nonce was already used. */
  use(nonce: string, now = Date.now()): boolean {
    if (this.seen.has(nonce)) return false;
    if (this.seen.size >= this.max) this.sweep(now);
    this.seen.set(nonce, now + this.ttlMs);
    return true;
  }
  private sweep(now: number) {
    for (const [k, exp] of this.seen) if (exp <= now) this.seen.delete(k);
    while (this.seen.size >= this.max) {
      const first = this.seen.keys().next().value;
      if (first === undefined) break;
      this.seen.delete(first);
    }
  }
}
