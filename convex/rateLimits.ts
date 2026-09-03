// Durable, replica-independent rate limits (Convex component). Called only by the Next.js server with the gateway secret.
import { RateLimiter } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { requireGateway } from "./lib/gateway";
import { RATE_LIMIT_NAMES, RATE_LIMITS } from "./lib/rateLimits";

const limiter = new RateLimiter(components.rateLimiter, RATE_LIMITS);

export const check = mutation({
  args: { gateway: v.optional(v.string()), name: v.union(...RATE_LIMIT_NAMES.map((n) => v.literal(n))), key: v.string() },
  returns: v.object({ ok: v.boolean(), retryAfterMs: v.number(), remaining: v.number() }),
  handler: async (ctx, { gateway, name, key }) => {
    requireGateway(gateway);
    const r = await limiter.limit(ctx, name, { key });
    const { value } = await limiter.getValue(ctx, name, { key });
    return { ok: r.ok, retryAfterMs: r.ok ? 0 : Math.ceil(r.retryAfter), remaining: Math.max(0, Math.floor(value)) };
  },
});
