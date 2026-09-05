// Rules and the pure fixed-window decision behind Better Auth's durable rate-limit store (convex/authRateLimits.ts).
// Paths are Better Auth's own, relative to its basePath (`/api/auth`); `*` matches one path segment.

export const AUTH_RATE_LIMIT_DEFAULT = { window: 60, max: 100 };

export const AUTH_RATE_LIMIT_RULES: Record<string, { window: number; max: number } | false> = {
  "/sign-in/*": { window: 600, max: 20 },
  "/sign-up/*": { window: 3600, max: 10 },
  "/send-verification-email": { window: 600, max: 5 },
  "/forget-password": { window: 600, max: 5 },
  "/request-password-reset": { window: 600, max: 5 },
  // The public key set Convex itself fetches to validate JWTs: no client IP, so it would share one bucket with nothing to protect.
  "/convex/jwks": false,
};

export type AuthRateLimitRow = { count: number; lastRequest: number };
export type AuthRateLimitRule = { window: number; max: number };

// Same shape of decision as Better Auth's built-in storages, so `retryAfter` means what its 429 says it means.
export function decideAuthRateLimit(row: AuthRateLimitRow | null, rule: AuthRateLimitRule, now: number) {
  const windowMs = rule.window * 1000;
  if (!row || now - row.lastRequest > windowMs) return { allowed: true, count: 1, retryAfter: null };
  if (row.count >= rule.max) return { allowed: false, count: row.count, retryAfter: Math.ceil((row.lastRequest + windowMs - now) / 1000) };
  return { allowed: true, count: row.count + 1, retryAfter: null };
}
