import { LIMIT, take } from "./rate-limit";

export type ErrorCode = "not_found" | "bad_request" | "rate_limited" | "internal";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return Response.json(
    { data, meta: { version: "v1", generatedAt: new Date().toISOString(), ...extra } },
    { headers: { ...CORS, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}

export function fail(code: ErrorCode, message: string, status: number, headers: Record<string, string> = {}) {
  return Response.json({ error: { code, message } }, { status, headers: { ...CORS, "Cache-Control": "no-store", ...headers } });
}

export function options() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}

export function withApi<C>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const rl = take(ip);
    let res: Response;
    if (!rl.allowed) res = fail("rate_limited", `Rate limit of ${LIMIT} requests per minute exceeded`, 429, { "Retry-After": String(rl.retryAfterSec) });
    else {
      try {
        res = await handler(req, ctx);
      } catch (e) {
        console.error("[api]", e);
        res = fail("internal", "Internal error", 500);
      }
    }
    res.headers.set("X-RateLimit-Limit", String(LIMIT));
    res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
    return res;
  };
}
