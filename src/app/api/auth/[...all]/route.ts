import { handler } from "@/lib/auth-server";
import { CLIENT_IP_HEADER, clientIp } from "@/lib/client-ip";

// Better Auth runs inside Convex, one proxy hop away, so the trusted address is resolved here and forwarded explicitly;
// its durable rate limit (convex/authRateLimits.ts) reads exactly this header.
const withClientIp = (fn: (req: Request) => Promise<Response>) => (req: Request) => {
  const headers = new Headers(req.headers);
  headers.set(CLIENT_IP_HEADER, clientIp(req));
  return fn(new Request(req, { headers }));
};

export const GET = withClientIp(handler.GET);
export const POST = withClientIp(handler.POST);
