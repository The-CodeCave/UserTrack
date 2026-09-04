// Trust model: Railway's edge APPENDS the real client IP to x-forwarded-for, so only the LAST entry is proxy-set;
// everything left of it (and x-real-ip when set by the client) can be forged. Never key a limit on the first entry.
// Behind Cloudflare that last hop is Cloudflare's own address (one bucket for every visitor), so cf-connecting-ip /
// true-client-ip win — but only when UT_TRUST_CF_HEADERS=1 confirms Cloudflare really fronts this deployment.
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:.]+$/i;

export function isIp(value: string) {
  return IPV4.test(value) || (value.includes(":") && IPV6.test(value));
}

export function clientIp(req: Request): string {
  if (process.env.UT_TRUST_CF_HEADERS === "1") {
    for (const header of ["cf-connecting-ip", "true-client-ip"]) {
      const cf = req.headers.get(header)?.trim();
      if (cf && isIp(cf)) return cf;
    }
  }
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  if (forwarded && isIp(forwarded)) return forwarded;
  const real = req.headers.get("x-real-ip")?.trim();
  return real && isIp(real) ? real : "unknown";
}
