/**
 * UserTrack ↔ Better Auth plugin wire protocol (v1).
 * Both directions (UserTrack → plugin metrics pull, plugin → UserTrack events push)
 * are authenticated with HMAC-SHA256 over a canonical string. Runs on WebCrypto only.
 */
export const PROTOCOL_VERSION = 1;
export const PROVIDER_ID = "better-auth";
export const METRICS_PATH = "/usertrack/metrics";
export const EVENTS_PATH = "/api/integrations/better-auth/events";
export const DEFAULT_ENDPOINT = "https://usertrack.dev";
export const HEADER_PROJECT = "x-usertrack-project";
export const HEADER_TIMESTAMP = "x-usertrack-timestamp";
export const HEADER_NONCE = "x-usertrack-nonce";
export const HEADER_SIGNATURE = "x-usertrack-signature";
export const TIMESTAMP_TOLERANCE_MS = 5 * 60_000;
export const MAX_HISTORY_DAYS = 90;
const enc = new TextEncoder();
async function subtle() {
    const c = globalThis.crypto;
    if (c?.subtle)
        return c.subtle;
    const mod = await import("node:crypto");
    return mod.webcrypto.subtle;
}
function hex(bytes) {
    return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function sha256Hex(input) {
    return hex(await (await subtle()).digest("SHA-256", enc.encode(input)));
}
export async function hmacHex(secret, message) {
    const s = await subtle();
    const key = await s.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return hex(await s.sign("HMAC", key, enc.encode(message)));
}
export function canonicalString(input, bodyHash) {
    return ["v1", input.method, input.path, String(input.timestamp), input.nonce, bodyHash].join("\n");
}
export async function sign(secret, input) {
    return `v1=${await hmacHex(secret, canonicalString(input, await sha256Hex(input.body)))}`;
}
export function timingSafeEqual(a, b) {
    const x = enc.encode(a);
    const y = enc.encode(b);
    let diff = x.length ^ y.length;
    for (let i = 0; i < Math.max(x.length, y.length); i++)
        diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
    return diff === 0;
}
export function randomNonce() {
    const bytes = new Uint8Array(16);
    globalThis.crypto?.getRandomValues(bytes);
    return hex(bytes.buffer);
}
export async function signedHeaders(secret, projectId, input) {
    const timestamp = input.timestamp ?? Date.now();
    const nonce = input.nonce ?? randomNonce();
    const signature = await sign(secret, { ...input, timestamp, nonce });
    return { [HEADER_PROJECT]: projectId, [HEADER_TIMESTAMP]: String(timestamp), [HEADER_NONCE]: nonce, [HEADER_SIGNATURE]: signature };
}
function readHeader(h, name) {
    if (typeof h.get === "function")
        return h.get(name) ?? undefined;
    const v = h[name] ?? h[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
}
/** Verify a signed request or response. `expectedNonce` binds a response to the request that produced it. */
export async function verify(secret, headers, input, opts = {}) {
    const ts = readHeader(headers, HEADER_TIMESTAMP);
    const nonce = readHeader(headers, HEADER_NONCE);
    const signature = readHeader(headers, HEADER_SIGNATURE);
    if (!ts || !nonce || !signature)
        return { ok: false, reason: "missing_headers" };
    const timestamp = Number(ts);
    if (!Number.isFinite(timestamp))
        return { ok: false, reason: "bad_timestamp" };
    if (Math.abs((opts.now ?? Date.now()) - timestamp) > (opts.toleranceMs ?? TIMESTAMP_TOLERANCE_MS))
        return { ok: false, reason: "stale", timestamp, nonce };
    if (opts.expectedNonce !== undefined && !timingSafeEqual(opts.expectedNonce, nonce))
        return { ok: false, reason: "bad_signature", timestamp, nonce };
    const expected = await sign(secret, { ...input, timestamp, nonce });
    if (!timingSafeEqual(expected, signature))
        return { ok: false, reason: "bad_signature", timestamp, nonce };
    return { ok: true, timestamp, nonce };
}
/** Stable pseudonymous subject for a user id: HMAC keyed with the integration secret, truncated. */
export async function pseudonymize(secret, userId) {
    return (await hmacHex(`${secret}:subject`, userId)).slice(0, 32);
}
/** Bounded in-memory nonce cache for best-effort replay protection within the tolerance window. */
export class NonceCache {
    ttlMs;
    max;
    seen = new Map();
    constructor(ttlMs = TIMESTAMP_TOLERANCE_MS * 2, max = 5000) {
        this.ttlMs = ttlMs;
        this.max = max;
    }
    /** Returns false if the nonce was already used. */
    use(nonce, now = Date.now()) {
        if (this.seen.has(nonce))
            return false;
        if (this.seen.size >= this.max)
            this.sweep(now);
        this.seen.set(nonce, now + this.ttlMs);
        return true;
    }
    sweep(now) {
        for (const [k, exp] of this.seen)
            if (exp <= now)
                this.seen.delete(k);
        while (this.seen.size >= this.max) {
            const first = this.seen.keys().next().value;
            if (first === undefined)
                break;
            this.seen.delete(first);
        }
    }
}
//# sourceMappingURL=protocol.js.map