import { fetchMutation } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { capacityOf, type RateLimitName } from "@convex/lib/rateLimits";
import { clientIp } from "@/lib/client-ip";

// Per-process token bucket: the cheap first line, so a flood never turns into a flood of Convex mutations.
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

export type LimitResult = { allowed: boolean; limit: number; remaining: number; retryAfterSec: number };

// Local bucket first (trusted client IP by default), then the durable Convex limiter that every replica shares.
export async function limit(req: Request, name: RateLimitName, key = clientIp(req)): Promise<LimitResult> {
  const cap = capacityOf(name);
  const local = take(`${name}:${key}`, Date.now(), cap);
  if (!local.allowed) return { allowed: false, limit: cap, remaining: 0, retryAfterSec: local.retryAfterSec };
  try {
    const r = await fetchMutation(api.rateLimits.check, { gateway: process.env.UT_GATEWAY_SECRET, name, key });
    if (!r.ok) return { allowed: false, limit: cap, remaining: 0, retryAfterSec: Math.max(1, Math.ceil(r.retryAfterMs / 1000)) };
    return { allowed: true, limit: cap, remaining: r.remaining, retryAfterSec: 0 };
  } catch (e) {
    // One key changing under concurrent mutations past Convex's retries IS the flood: deny. Anything else degrades to the local bucket.
    if (String(e).includes("OptimisticConcurrencyControlFailure")) return { allowed: false, limit: cap, remaining: 0, retryAfterSec: 1 };
    console.error("[rate-limit]", name, e);
    return { allowed: true, limit: cap, remaining: local.remaining, retryAfterSec: 0 };
  }
}

export function tooMany(r: LimitResult, body = "Too many requests") {
  return new Response(body, { status: 429, headers: { "Retry-After": String(r.retryAfterSec), "Cache-Control": "no-store" } });
}
