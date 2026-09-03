// Outbound webhooks: URL policy (SSRF), HMAC-SHA256 signing, retry schedule and payload shape. Pure; no I/O (docs/WEBHOOKS.md).

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
export const MAX_URL_LENGTH = 2048;
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

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".railway.internal", ".convex.cloud", ".convex.site"];
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata", "instance-data", "kubernetes.default.svc"]);

export type UrlCheck = { ok: true; url: string; host: string } | { ok: false; reason: string };

// Accepts only public https URLs (http is allowed for nothing — HTTPS is mandatory). Literal IPs must be public.
export function checkWebhookUrl(raw: string): UrlCheck {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return { ok: false, reason: "Enter a URL" };
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "Webhook URLs must use https://" };
  if (u.username || u.password) return { ok: false, reason: "Credentials in the URL are not allowed" };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: "Internal or local hostnames are not allowed" };
  if (!host.includes(".") && !isIp(host)) return { ok: false, reason: "Use a fully qualified public hostname" };
  if (isIp(host) && isPrivateIp(host)) return { ok: false, reason: "Private, loopback, link-local and metadata addresses are not allowed" };
  return { ok: true, url: u.toString(), host };
}

const isIp = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || /^\[.*\]$/.test(host);

// RFC 1918 / 6598 / loopback / link-local / metadata / multicast / unspecified for IPv4, plus ULA / link-local / loopback / v4-mapped for IPv6.
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) {
    const [a, b] = v4.split(".").map(Number);
    if ([a, b].some((n) => n > 255)) return true;
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = v4.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("::ffff:")) {
    const rest = v6.slice(7);
    if (rest.includes(".")) return isPrivateIp(rest);
    // URL parsing normalizes v4-mapped addresses to hex groups (::ffff:a00:1) — expand them back.
    const [hi, lo] = rest.split(":").map((g) => parseInt(g || "0", 16));
    return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (/^fe[89ab]/.test(v6) || /^f[cd]/.test(v6) || v6.startsWith("ff")) return true;
  if (v6.startsWith("64:ff9b:")) return true;
  return false;
}

// DNS answers (resolved right before delivery) must all be public, or the delivery is refused.
export function allPublic(addresses: string[]) {
  return addresses.length > 0 && addresses.every((a) => !isPrivateIp(a));
}

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
