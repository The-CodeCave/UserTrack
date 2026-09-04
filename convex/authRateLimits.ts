// Durable storage for Better Auth's rate limiter (FIX-4). Better Auth counts in the process it runs in, so with more
// than one Railway replica the sign-in limit is not a limit; here every bucket is one `authRateLimits` row consumed
// inside a Convex mutation, which is the atomic check-and-increment the storage contract asks for.
import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { decideAuthRateLimit } from "./lib/authRateLimits";

// Longest configured window plus headroom; rows older than this can no longer influence a decision.
const SWEEP_AFTER_MS = 2 * 60 * 60_000;
const SWEEP_PAGE = 20;

const bucket = (ctx: QueryCtx | MutationCtx, key: string) =>
  ctx.db.query("authRateLimits").withIndex("by_key", (q) => q.eq("key", key)).unique();

export const get = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await bucket(ctx, key);
    return row ? { key: row.key, count: row.count, lastRequest: row.lastRequest } : null;
  },
});

export const set = internalMutation({
  args: { key: v.string(), count: v.number(), lastRequest: v.number() },
  handler: async (ctx, { key, count, lastRequest }) => {
    const row = await bucket(ctx, key);
    if (row) await ctx.db.patch(row._id, { count, lastRequest });
    else await ctx.db.insert("authRateLimits", { key, count, lastRequest });
  },
});

export const consume = internalMutation({
  args: { key: v.string(), window: v.number(), max: v.number() },
  returns: v.object({ allowed: v.boolean(), retryAfter: v.union(v.number(), v.null()) }),
  handler: async (ctx, { key, window, max }) => {
    const now = Date.now();
    const row = await bucket(ctx, key);
    const decision = decideAuthRateLimit(row, { window, max }, now);
    if (!decision.allowed) return { allowed: false, retryAfter: decision.retryAfter };
    if (row) await ctx.db.patch(row._id, { count: decision.count, lastRequest: now });
    else {
      await ctx.db.insert("authRateLimits", { key, count: decision.count, lastRequest: now });
      await sweep(ctx, now);
    }
    return { allowed: true, retryAfter: null };
  },
});

// Bounded, and only on the transaction that opens a bucket, so the table stays the size of the live windows.
async function sweep(ctx: MutationCtx, now: number) {
  const stale = await ctx.db.query("authRateLimits").withIndex("by_lastRequest", (q) => q.lt("lastRequest", now - SWEEP_AFTER_MS)).take(SWEEP_PAGE);
  for (const row of stale) await ctx.db.delete(row._id);
}
