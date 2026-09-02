// Per-process token bucket: state lives in memory and resets on deploy, which is fine for a single Railway instance.
export const LIMIT = 60;
const REFILL_PER_MS = LIMIT / 60_000;
const STALE_MS = 10 * 60_000;
const MAX_KEYS = 5_000;
const buckets = new Map<string, { tokens: number; at: number }>();

export function take(key: string, now = Date.now()) {
  if (buckets.size > MAX_KEYS) for (const [k, b] of buckets) if (now - b.at > STALE_MS) buckets.delete(k);
  const b = buckets.get(key) ?? { tokens: LIMIT, at: now };
  b.tokens = Math.min(LIMIT, b.tokens + (now - b.at) * REFILL_PER_MS);
  b.at = now;
  const allowed = b.tokens >= 1;
  if (allowed) b.tokens -= 1;
  buckets.set(key, b);
  return { allowed, remaining: Math.floor(b.tokens), retryAfterSec: allowed ? 0 : Math.ceil((1 - b.tokens) / REFILL_PER_MS / 1000) };
}
