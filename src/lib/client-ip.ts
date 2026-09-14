// Trust model: Railway's edge APPENDS the real client IP to x-forwarded-for, so only the LAST entry is proxy-set;
// everything left of it (and x-real-ip when set by the client) can be forged. Never key a limit on the first entry.
// Behind Cloudflare that last hop can be Cloudflare's own address, so cf-connecting-ip / true-client-ip win — but only
// with UT_TRUST_CF_HEADERS=1 AND a Cloudflare last hop: the Railway origin is reachable directly and the header is free text.
// Header the /api/auth proxy stamps with the resolved address so Better Auth (running inside Convex, one hop further
// away) keys its durable rate limit on the same trust rules instead of re-deriving them from a forwarded chain.
export const CLIENT_IP_HEADER = "x-ut-client-ip";
// Carries UT_GATEWAY_SECRET next to CLIENT_IP_HEADER; Convex ignores the address without it (convex/lib/gateway.ts).
export const CLIENT_IP_PROOF_HEADER = "x-ut-gateway";

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:.]+$/i;

// https://www.cloudflare.com/ips-v4 and /ips-v6 (checked 2026-09-14).
const CLOUDFLARE_V4 = ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"];
const CLOUDFLARE_V6 = ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"];

export function isIp(value: string) {
  return IPV4.test(value) || (value.includes(":") && IPV6.test(value));
}

function v6Groups(ip: string) {
  const [head, tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill = tail === undefined ? [] : Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0");
  return [...left, ...fill, ...right].map((g) => parseInt(g, 16) || 0);
}

const bits = (ip: string) => (ip.includes(":") ? v6Groups(ip).map((g) => g.toString(2).padStart(16, "0")) : ip.split(".").map((o) => Number(o).toString(2).padStart(8, "0"))).join("");

export function isCloudflareIp(ip: string) {
  const addr = ip.toLowerCase().match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1] ?? ip;
  if (!isIp(addr)) return false;
  const ranges = IPV4.test(addr) ? CLOUDFLARE_V4 : CLOUDFLARE_V6;
  return ranges.some((cidr) => {
    const [base, len] = cidr.split("/");
    return bits(addr).slice(0, Number(len)) === bits(base).slice(0, Number(len));
  });
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  const hop = forwarded && isIp(forwarded) ? forwarded : undefined;
  if (process.env.UT_TRUST_CF_HEADERS === "1" && hop && isCloudflareIp(hop)) {
    for (const header of ["cf-connecting-ip", "true-client-ip"]) {
      const cf = req.headers.get(header)?.trim();
      if (cf && isIp(cf)) return cf;
    }
  }
  if (hop) return hop;
  const real = req.headers.get("x-real-ip")?.trim();
  return real && isIp(real) ? real : "unknown";
}
