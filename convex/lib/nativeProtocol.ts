// UserTrack ↔ native SDK wire protocol (v1). Intentionally a self-contained twin of packages/protocol/src/index.ts
// (the Convex bundle must not depend on a workspace package build); nativeProtocol.test.ts pins both to the same
// frozen fixtures and cross-checks random inputs against the package source.
export const PROTOCOL_VERSION = 1;
export const SUPPORTED_PROTOCOL_VERSIONS = [1];
export const NATIVE_SOURCES = ["better-auth", "prisma", "drizzle", "convex", "authjs", "custom"] as const;
export type NativeSource = (typeof NATIVE_SOURCES)[number];
export const NATIVE_SOURCE_LABEL: Record<NativeSource, string> = { "better-auth": "Better Auth", prisma: "Prisma", drizzle: "Drizzle", convex: "Convex", authjs: "Auth.js", custom: "Custom app" };
export const NATIVE_PACKAGE: Record<NativeSource, string> = { "better-auth": "@usertrack/better-auth", prisma: "@usertrack/node", drizzle: "@usertrack/node", convex: "@usertrack/node", authjs: "@usertrack/node", custom: "@usertrack/node" };
// Oldest client version per source that speaks a shape this server parses.
export const MIN_CLIENT_VERSION: Record<NativeSource, string> = { "better-auth": "0.1.0", prisma: "0.1.0", drizzle: "0.1.0", convex: "0.1.0", authjs: "0.1.0", custom: "0.1.0" };
export const normalizeSource = (s: unknown): NativeSource => (NATIVE_SOURCES.includes(s as NativeSource) ? (s as NativeSource) : "custom");
export const METRICS_PATH = "/usertrack/metrics";
export const EVENTS_PATH = "/api/integrations/native/events";
// Path the 0.1.x Better Auth plugin signs events with; still accepted.
export const LEGACY_EVENTS_PATH = "/api/integrations/better-auth/events";
export const EVENT_TYPES = ["user.created", "user.deleted", "user.activated", "trial.started", "user.converted"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const HEADER_PROJECT = "x-usertrack-project";
export const HEADER_TIMESTAMP = "x-usertrack-timestamp";
export const HEADER_NONCE = "x-usertrack-nonce";
export const HEADER_SIGNATURE = "x-usertrack-signature";
export const TIMESTAMP_TOLERANCE_MS = 5 * 60_000;
export const INTEGRATION_SECRET_PREFIX = "ut_int_";

export type SignatureInput = { method: "REQUEST" | "RESPONSE"; path: string; timestamp: number; nonce: string; body: string };
export type VerifyResult = { ok: true; timestamp: number; nonce: string } | { ok: false; reason: "missing_headers" | "bad_timestamp" | "stale" | "bad_signature" };

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

export const sha256Hex = async (input: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(input)));

export async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

export const canonicalString = (i: SignatureInput, bodyHash: string) => ["v1", i.method, i.path, String(i.timestamp), i.nonce, bodyHash].join("\n");

export async function sign(secret: string, input: SignatureInput) {
  return `v1=${await hmacHex(secret, canonicalString(input, await sha256Hex(input.body)))}`;
}

export function timingSafeEqual(a: string, b: string) {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function randomNonce() {
  return hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export async function signedHeaders(secret: string, projectId: string, input: Omit<SignatureInput, "timestamp" | "nonce"> & { timestamp?: number; nonce?: string }) {
  const timestamp = input.timestamp ?? Date.now();
  const nonce = input.nonce ?? randomNonce();
  const signature = await sign(secret, { ...input, timestamp, nonce });
  return { [HEADER_PROJECT]: projectId, [HEADER_TIMESTAMP]: String(timestamp), [HEADER_NONCE]: nonce, [HEADER_SIGNATURE]: signature } as Record<string, string>;
}

type Headers = { get(name: string): string | null | undefined } | Record<string, string | undefined>;
const read = (h: Headers, name: string) => (typeof (h as { get?: unknown }).get === "function" ? (h as { get(n: string): string | null | undefined }).get(name) ?? undefined : (h as Record<string, string | undefined>)[name]);

export async function verify(secret: string, headers: Headers, input: Omit<SignatureInput, "timestamp" | "nonce">, opts: { now?: number; toleranceMs?: number; expectedNonce?: string } = {}): Promise<VerifyResult> {
  const ts = read(headers, HEADER_TIMESTAMP);
  const nonce = read(headers, HEADER_NONCE);
  const signature = read(headers, HEADER_SIGNATURE);
  if (!ts || !nonce || !signature) return { ok: false, reason: "missing_headers" };
  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "bad_timestamp" };
  if (Math.abs((opts.now ?? Date.now()) - timestamp) > (opts.toleranceMs ?? TIMESTAMP_TOLERANCE_MS)) return { ok: false, reason: "stale" };
  if (opts.expectedNonce !== undefined && !timingSafeEqual(opts.expectedNonce, nonce)) return { ok: false, reason: "bad_signature" };
  if (!timingSafeEqual(await sign(secret, { ...input, timestamp, nonce }), signature)) return { ok: false, reason: "bad_signature" };
  return { ok: true, timestamp, nonce };
}

// "0.2.1" >= "0.1.0" — enough for a minimum-version gate; pre-release tags are ignored.
export function versionAtLeast(version: string, min: string) {
  const a = version.split(/[.-]/).slice(0, 3).map((x) => Number(x) || 0);
  const b = min.split(/[.-]/).slice(0, 3).map((x) => Number(x) || 0);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
// 40 random base62 chars ≈ 238 bits. Shown once, stored in the integration config (server-only) plus its SHA-256 for lookup.
export function generateIntegrationSecret(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  let body = "";
  for (const b of random(40)) body += ALPHABET[b % ALPHABET.length];
  const secret = `${INTEGRATION_SECRET_PREFIX}${body}`;
  return { secret, prefix: secret.slice(0, INTEGRATION_SECRET_PREFIX.length + 4) };
}
