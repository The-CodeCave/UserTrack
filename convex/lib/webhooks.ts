// Outbound webhooks: URL policy (SSRF), HMAC-SHA256 signing, retry schedule and payload shape. Pure; no I/O (docs/WEBHOOKS.md).
import { checkPublicHttpsUrl } from "./ssrf";

export const WEBHOOK_EVENTS = [
  { type: "milestone.reached", label: "Milestone reached", blurb: "User / activated / converted thresholds, Top 10 / Top 100 entries, records and streaks." },
  { type: "rank.changed", label: "Leaderboard rank changed", blurb: "The 30-day leaderboard position moved (at most once per UTC day)." },
  { type: "trending.rank_changed", label: "Trending rank changed", blurb: "The 7-day trending position moved (at most once per UTC day)." },
  { type: "growth.spike", label: "Growth spike", blurb: "A day ≥ 3× the trailing 14-day average with at least 20 new users." },
  { type: "integration.failed", label: "Integration failed", blurb: "A users source entered the unhealthy state (repeated failed syncs)." },
  { type: "integration.recovered", label: "Integration recovered", blurb: "The source synced again after an unhealthy episode." },
  { type: "project.verified", label: "Project verified", blurb: "First verified users sync of a project." },
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]["type"] | "webhook.test";
export const WEBHOOK_EVENT_TYPES = WEBHOOK_EVENTS.map((e) => e.type) as WebhookEventType[];

export const WEBHOOK_API_VERSION = "2026-09-01";
export const WEBHOOK_TIMEOUT_MS = 10_000;
export const MAX_ENDPOINTS = 10;
// Attempt n waits RETRY_DELAYS_MS[n-1] after the previous failure: immediate, 5 min, 30 min, 2 h, 12 h → 5 attempts, then exhausted.
export const RETRY_DELAYS_MS = [0, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
// Endpoints that fail this many deliveries in a row are disabled; the owner re-enables them from the dashboard.
export const DISABLE_AFTER_FAILURES = 25;
// Signatures older than this are rejected by well-behaved consumers (documented in the verification snippet).
export const SIGNATURE_TOLERANCE_SEC = 300;

export function nextAttemptDelay(attempt: number) {
  return attempt >= MAX_ATTEMPTS ? null : RETRY_DELAYS_MS[attempt];
}

// ---- URL policy --------------------------------------------------------------------------------------------------------

export { MAX_URL_LENGTH, allPublic, isPrivateIp, type UrlCheck } from "./ssrf";

// Accepts only public https URLs (any port); our own Convex deployments are refused as well. Generic policy lives in ./ssrf.ts.
export const checkWebhookUrl = (raw: string) => checkPublicHttpsUrl(raw, { what: "Webhook URLs", anyPort: true, blockSuffixes: [".convex.site"] });

// ---- Signing ---------------------------------------------------------------------------------------------------------

export const SECRET_PREFIX = "whsec_";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function generateWebhookSecret(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  let body = "";
  for (const b of random(32)) body += ALPHABET[b % ALPHABET.length];
  const secret = `${SECRET_PREFIX}${body}`;
  return { secret, prefix: secret.slice(0, SECRET_PREFIX.length + 4) };
}

export const maskSecret = (prefix: string) => `${prefix}••••••••••••••••`;

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

// signature = hex(HMAC-SHA256(secret, `${timestamp}.${body}`)); header value `v1=<hex>`.
export async function signPayload(secret: string, timestamp: number, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return `v1=${hex(sig)}`;
}

export function signatureHeaders(p: { signature: string; timestamp: number; type: string; deliveryId: string; eventId: string }) {
  return {
    "Content-Type": "application/json",
    "User-Agent": "UserTrack-Webhooks/1.0 (+https://usertrack.dev/developers/webhooks)",
    "UserTrack-Signature": p.signature,
    "UserTrack-Timestamp": String(p.timestamp),
    "UserTrack-Event": p.type,
    "UserTrack-Delivery": p.deliveryId,
    "UserTrack-Event-Id": p.eventId,
    "Idempotency-Key": p.deliveryId,
  };
}

// ---- Ids + payloads ---------------------------------------------------------------------------------------------------

const randomId = (prefix: string, random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) => {
  let body = "";
  for (const b of random(20)) body += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${body}`;
};
export const newDeliveryId = () => randomId("dlv");
// Event ids are deterministic per source event so every endpoint receives the same `id` and consumers can dedupe globally.
export const eventIdFor = (type: string, key: string) => `evt_${type.replace(/\./g, "_")}_${key.replace(/[^A-Za-z0-9_-]/g, "_")}`;

export interface WebhookProject { id: string; slug: string; name: string; url: string; totalUsers: number }

export function buildPayload(p: { id: string; type: WebhookEventType; createdAt: number; project?: WebhookProject; data: Record<string, unknown>; test?: boolean }) {
  return {
    id: p.id,
    type: p.type,
    apiVersion: WEBHOOK_API_VERSION,
    createdAt: new Date(p.createdAt).toISOString(),
    ...(p.test ? { test: true } : {}),
    data: { ...(p.project ? { project: p.project } : {}), ...p.data },
  };
}

// Every endpoint sees the same canonical JSON, so signatures verify against the exact bytes that were sent.
export const serializePayload = (payload: unknown) => JSON.stringify(payload);
