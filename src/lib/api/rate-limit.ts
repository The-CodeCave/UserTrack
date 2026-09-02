// Per-process token bucket: state lives in memory and resets on deploy, which is fine for a single Railway instance.
export const LIMIT = 60;
const STALE_MS = 10 * 60_000;
const MAX_KEYS = 5_000;
const buckets = new Map<string, { tokens: number; at: number }>();

export function take(key: string, now = Date.now(), limit = LIMIT) {
  const refillPerMs = limit / 60_000;
  if (buckets.size > MAX_KEYS) for (const [k, b] of buckets) if (now - b.at > STALE_MS) buckets.delete(k);
  const b = buckets.get(key) ?? { tokens: limit, at: now };
  b.tokens = Math.min(limit, b.tokens + (now - b.at) * refillPerMs);
  b.at = now;
  const allowed = b.tokens >= 1;
  if (allowed) b.tokens -= 1;
  buckets.set(key, b);
  return { allowed, remaining: Math.floor(b.tokens), retryAfterSec: allowed ? 0 : Math.ceil((1 - b.tokens) / refillPerMs / 1000) };
}
