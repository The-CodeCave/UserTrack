/**
 * UserTrack ↔ Better Auth plugin wire protocol (v1).
 * Both directions (UserTrack → plugin metrics pull, plugin → UserTrack events push)
 * are authenticated with HMAC-SHA256 over a canonical string. Runs on WebCrypto only.
 */
export const PROTOCOL_VERSION = 1 as const;
export const PROVIDER_ID = "better-auth" as const;

export const METRICS_PATH = "/usertrack/metrics" as const;
export const EVENTS_PATH = "/api/integrations/better-auth/events" as const;
export const DEFAULT_ENDPOINT = "https://usertrack.dev" as const;

export const HEADER_PROJECT = "x-usertrack-project" as const;
export const HEADER_TIMESTAMP = "x-usertrack-timestamp" as const;
export const HEADER_NONCE = "x-usertrack-nonce" as const;
export const HEADER_SIGNATURE = "x-usertrack-signature" as const;

export const TIMESTAMP_TOLERANCE_MS = 5 * 60_000;
export const MAX_HISTORY_DAYS = 90;

export type SignatureInput = {
  method: "REQUEST" | "RESPONSE";
  path: string;
  timestamp: number;
  nonce: string;
  body: string;
};

export type MetricsRequest = {
  protocolVersion: typeof PROTOCOL_VERSION;
  /** Daily new-user series for the trailing N days (1–90). */
  days?: number;
  /** Count users created in [from, to) — ISO timestamps. */
  from?: string;
  to?: string;
};

export type MetricsResponse = {
  protocolVersion: typeof PROTOCOL_VERSION;
  pluginVersion: string;
  provider: typeof PROVIDER_ID;
  projectId: string;
  generatedAt: string;
  totalUsers: number;
  newUsers: { "24h": number; "7d": number; "30d": number };
  daily?: { day: string; newUsers: number }[];
  range?: { from: string; to: string; count: number };
  capabilities: { exactCounts: boolean; history: boolean; anonymousExcluded: boolean };
};

export type LifecycleEventType = "user.created" | "user.deleted";

export type LifecycleEvent = {
  protocolVersion: typeof PROTOCOL_VERSION;
  pluginVersion: string;
  provider: typeof PROVIDER_ID;
  projectId: string;
  eventId: string;
  type: LifecycleEventType;
  /** HMAC-derived pseudonymous subject, never the raw user id. */
  subject: string;
  occurredAt: string;
};

export type VerifyResult = { ok: true } | { ok: false; reason: "missing_headers" | "bad_timestamp" | "stale" | "bad_signature" };

const enc = new TextEncoder();

async function subtle(): Promise<SubtleCrypto> {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.subtle) return c.subtle;
  const mod = await import("node:crypto");
  return (mod.webcrypto as unknown as Crypto).subtle;
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

export async function signedHeaders(secret: string, projectId: string, input: Omit<SignatureInput, "timestamp" | "nonce"> & { timestamp?: number; nonce?: string }): Promise<SignedHeaders> {
  const timestamp = input.timestamp ?? Date.now();
  const nonce = input.nonce ?? randomNonce();
  const signature = await sign(secret, { ...input, timestamp, nonce });
  return { [HEADER_PROJECT]: projectId, [HEADER_TIMESTAMP]: String(timestamp), [HEADER_NONCE]: nonce, [HEADER_SIGNATURE]: signature };
}

type HeaderReader = { get(name: string): string | null | undefined } | Record<string, string | string[] | undefined>;

function readHeader(h: HeaderReader, name: string): string | undefined {
  if (typeof (h as { get?: unknown }).get === "function") return (h as { get(n: string): string | null | undefined }).get(name) ?? undefined;
  const v = (h as Record<string, string | string[] | undefined>)[name] ?? (h as Record<string, string | string[] | undefined>)[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

export type VerifyOptions = { now?: number; toleranceMs?: number; expectedNonce?: string };

/** Verify a signed request or response. `expectedNonce` binds a response to the request that produced it. */
export async function verify(secret: string, headers: HeaderReader, input: Omit<SignatureInput, "timestamp" | "nonce">, opts: VerifyOptions = {}): Promise<VerifyResult & { timestamp?: number; nonce?: string }> {
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
