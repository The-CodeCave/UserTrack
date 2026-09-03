// Trust model: Railway's edge APPENDS the real client IP to x-forwarded-for, so only the LAST entry is proxy-set;
// everything left of it (and x-real-ip when set by the client) can be forged. Never key a limit on the first entry.
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:.]+$/i;

export function isIp(value: string) {
  return IPV4.test(value) || (value.includes(":") && IPV6.test(value));
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  if (forwarded && isIp(forwarded)) return forwarded;
  const real = req.headers.get("x-real-ip")?.trim();
  return real && isIp(real) ? real : "unknown";
}
