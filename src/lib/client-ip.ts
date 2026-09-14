// Railway's edge overwrites x-real-ip on every request (resolved through cf-connecting-ip only for real Cloudflare peers); cf-connecting-ip / true-client-ip themselves reach the origin unfiltered, so they are never read.
export const CLIENT_IP_HEADER = "x-ut-client-ip";
// Carries UT_GATEWAY_SECRET next to CLIENT_IP_HEADER; Convex ignores the address without it (convex/lib/gateway.ts).
export const CLIENT_IP_PROOF_HEADER = "x-ut-gateway";

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:.]+$/i;

export function isIp(value: string) {
  return IPV4.test(value) || (value.includes(":") && IPV6.test(value));
}

export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real && isIp(real)) return real;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return forwarded && isIp(forwarded) ? forwarded : "unknown";
}
