import { PLANS } from "@convex/lib/tokens";
import { serverTrack } from "@/lib/analytics-server";
import { limit } from "./rate-limit";
import { authorize, bearer, hashSecret, STATUS, toFailure, type GatewayCode } from "./gateway";

export type ErrorCode = GatewayCode | "internal";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key" };

export function ok(data: unknown, extra: Record<string, unknown> = {}, cache = "public, s-maxage=300, stale-while-revalidate=600") {
  return Response.json({ data, meta: { version: "v1", generatedAt: new Date().toISOString(), ...extra } }, { headers: { ...CORS, "Cache-Control": cache } });
}

export function fail(code: ErrorCode, message: string, status: number, headers: Record<string, string> = {}) {
  return Response.json({ error: { code, message } }, { status, headers: { ...CORS, "Cache-Control": "no-store", ...headers } });
}

// CSV download with the same CORS + caching rules as JSON responses; rate-limit headers are added by withApi.
export function csv(body: string, filename: string, extra: Record<string, string> = {}, cache = "public, s-maxage=300, stale-while-revalidate=600") {
  return new Response(body, { headers: { ...CORS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": cache, ...extra } });
}

export function options() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}

type Limits = { limit: number; remaining: number; window: "minute" | "day"; resetAt?: number };

// Anonymous callers share an IP bucket; API keys (ut_api_) get the per-key daily quota plus a burst bucket. Same handler either way.
export function withApi<C>(category: string, handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const key = bearer(req);
    let res: Response;
    let limits: Limits;
    const done = (r: Response, l: Limits) => {
      serverTrack(req, "api_request", { category, status: r.status, authenticated: !!key });
      return finish(r, l);
    };
    if (key) {
      const b = await limit(req, "apiKey", hashSecret(key));
      if (!b.allowed) return done(fail("rate_limited", `Burst limit of ${b.limit} requests per minute exceeded`, 429, { "Retry-After": String(b.retryAfterSec) }), { limit: b.limit, remaining: 0, window: "minute" });
      try {
        const a = await authorize(key, "api", category);
        limits = { limit: a.limit.perDay, remaining: a.limit.remaining, window: "day", resetAt: a.limit.resetAt };
      } catch (e) {
        const f = toFailure(e);
        if (!f) throw e;
        return done(fail(f.code, f.message, STATUS[f.code], f.retryAfterSec ? { "Retry-After": String(f.retryAfterSec) } : {}), { limit: f.limit ?? PLANS.free.api.perDay, remaining: 0, window: "day", resetAt: f.resetAt });
      }
    } else {
      const rl = await limit(req, "anonApi");
      limits = { limit: rl.limit, remaining: rl.remaining, window: "minute" };
      if (!rl.allowed) return done(fail("rate_limited", `Rate limit of ${rl.limit} requests per minute exceeded. Use an API key for ${PLANS.free.api.perDay.toLocaleString("en")} requests per day.`, 429, { "Retry-After": String(rl.retryAfterSec) }), limits);
    }
    try {
      res = await handler(req, ctx);
    } catch (e) {
      console.error("[api]", e);
      res = fail("internal", "Internal error", 500);
    }
    if (key) res.headers.set("Cache-Control", "private, no-store");
    return done(res, limits);
  };
}

function finish(res: Response, l: Limits) {
  res.headers.set("X-RateLimit-Limit", String(l.limit));
  res.headers.set("X-RateLimit-Remaining", String(Math.max(0, l.remaining)));
  res.headers.set("X-RateLimit-Window", l.window);
  if (l.resetAt) res.headers.set("X-RateLimit-Reset", String(Math.floor(l.resetAt / 1000)));
  return res;
}
