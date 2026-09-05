import { handler } from "@/lib/auth-server";
import { CLIENT_IP_HEADER, clientIp } from "@/lib/client-ip";

// Better Auth runs inside Convex, one proxy hop away, so the trusted address is resolved here and forwarded explicitly;
// its durable rate limit (convex/authRateLimits.ts) reads exactly this header.
// Rebuilt from url/method/body instead of `new Request(req, …)`: Next bundles its own Request class, so re-wrapping the
// incoming instance throws "Cannot read private member #state" in a production build and every /api/auth/* call 500s.
const withClientIp = (fn: (req: Request) => Promise<Response>) => async (req: Request) => {
  const headers = new Headers(req.headers);
  headers.set(CLIENT_IP_HEADER, clientIp(req));
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  return fn(new Request(req.url, { method: req.method, headers, body }));
};

export const GET = withClientIp(handler.GET);
export const POST = withClientIp(handler.POST);
