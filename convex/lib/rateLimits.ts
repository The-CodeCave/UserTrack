// Named limits shared by the Next.js first line (in-memory) and the durable Convex limiter (`convex/rateLimits.ts`).
import type { RateLimitConfig } from "@convex-dev/rate-limiter";
import { PLANS } from "./tokens";

const MINUTE = 60_000;

export const RATE_LIMITS = {
  anonApi: { kind: "token bucket", rate: PLANS.free.anonymous.burstPerMinute, period: MINUTE, capacity: PLANS.free.anonymous.burstPerMinute },
  apiKey: { kind: "token bucket", rate: PLANS.free.api.burstPerMinute, period: MINUTE },
  mcp: { kind: "token bucket", rate: PLANS.free.mcp.burstPerMinute, period: MINUTE },
  badge: { kind: "token bucket", rate: 120, period: MINUTE },
  embed: { kind: "token bucket", rate: 60, period: MINUTE },
  card: { kind: "token bucket", rate: 40, period: MINUTE },
  nativeEvents: { kind: "token bucket", rate: 600, period: MINUTE },
  xCallback: { kind: "fixed window", rate: 10, period: 10 * MINUTE },
  // TrustMRR import: per founder, plus the shared budget of the single operator key (10 req/min on standard keys).
  trustmrrImport: { kind: "fixed window", rate: 5, period: 10 * MINUTE },
  trustmrrGlobal: { kind: "fixed window", rate: 10, period: MINUTE },
} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitName = keyof typeof RATE_LIMITS;
export const RATE_LIMIT_NAMES = Object.keys(RATE_LIMITS) as RateLimitName[];

// Tokens a fresh key may spend at once; the in-memory first line refills this many per minute.
export const capacityOf = (name: RateLimitName) => RATE_LIMITS[name].rate;
