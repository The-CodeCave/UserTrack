// Outbound-request policy shared by webhooks and providers: public https hosts only, resolved right before every request
// (docs/PROVIDERS.md → Security). Pure except for the DNS-over-HTTPS resolver.

export const MAX_URL_LENGTH = 2048;
export const BLOCKED_HOST_ERROR = "blocked: private or internal address — the host must be reachable from the public internet";

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".railway.internal", ".convex.cloud"];
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata", "instance-data", "kubernetes.default.svc"]);
const ALLOWED_PORTS = new Set(["", "443", "8443"]);

// Hostnames of this deployment (Next.js site, Convex site + cloud URLs) — never a valid data source or webhook target.
export function ownHosts(env: Record<string, string | undefined> = process.env): Set<string> {
  const out = new Set<string>();
  for (const key of ["SITE_URL", "NEXT_PUBLIC_SITE_URL", "CONVEX_SITE_URL", "CONVEX_CLOUD_URL"]) {
    try {
      if (env[key]) out.add(new URL(env[key]!).hostname.toLowerCase());
    } catch {
      // Unparseable env value: nothing to block.
    }
  }
  return out;
}

// Decimal / hex / octal / shorthand IPv4 forms (2130706433, 0x7f000001, 0177.0.0.1, 127.1) → dotted quad; null when not an IPv4 literal.
export function canonicalIpv4(host: string): string | null {
  const parts = host.split(".");
  if (parts.length > 4 || parts.some((p) => !/^(0x[0-9a-f]+|0[0-7]*|[1-9]\d*)$/i.test(p))) return null;
  const nums = parts.map((p) => (/^0x/i.test(p) ? parseInt(p, 16) : p.length > 1 && p.startsWith("0") ? parseInt(p, 8) : Number(p)));
  const last = nums.pop()!;
  if (nums.some((n) => n > 255) || last >= 256 ** (4 - nums.length)) return null;
  let value = last;
  for (let i = 0; i < nums.length; i++) value += nums[i] * 256 ** (3 - i);
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

const strip = (host: string) => host.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
export const isIpLiteral = (host: string) => canonicalIpv4(strip(host)) !== null || host.includes(":");

// Full 8-group form of an IPv6 literal: brackets, zone id, `::` compression, leading zeros and a dotted-quad tail; null when not IPv6.
export function expandIpv6(raw: string): number[] | null {
  const addr = strip(raw);
  if (!addr.includes(":")) return null;
  const sides = addr.split("::");
  if (sides.length > 2) return null;
  const parse = (side: string): number[] | null => {
    if (!side) return [];
    const groups = side.split(":");
    const out: number[] = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.includes(".")) {
        const v4 = i === groups.length - 1 ? canonicalIpv4(g) : null;
        if (!v4) return null;
        const [a, b, c, d] = v4.split(".").map(Number);
        out.push((a << 8) | b, (c << 8) | d);
      } else if (/^[0-9a-f]{1,4}$/.test(g)) {
        out.push(parseInt(g, 16));
      } else return null;
    }
    return out;
  };
  const head = parse(sides[0]);
  const tail = sides.length === 2 ? parse(sides[1]) : [];
  if (!head || !tail) return null;
  if (sides.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - tail.length;
  return fill < 0 ? null : [...head, ...Array<number>(fill).fill(0), ...tail];
}

// RFC 1918 / 6598 / loopback / link-local / metadata / multicast / unspecified for IPv4, plus ULA / link-local / loopback / v4-mapped for IPv6.
export function isPrivateIp(ip: string): boolean {
  const bare = strip(ip);
  const v4 = canonicalIpv4(bare);
  if (v4) {
    const [a, b] = v4.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const g = expandIpv6(bare);
  if (!g) return false;
  // ::, ::1, ::ffff:a.b.c.d and the v4-compatible form all carry an IPv4 address in the last two groups.
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && (g[5] === 0 || g[5] === 0xffff)) {
    return isPrivateIp(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return true;
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00;
}

// DNS answers must all be public, or the request is refused.
export function allPublic(addresses: string[]) {
  return addresses.length > 0 && addresses.every((a) => !isPrivateIp(a));
}

// Static hostname policy: internal names, our own deployment and private IP literals. Case-insensitive, trailing dot ignored.
export function isBlockedHost(rawHost: string, extraSuffixes: string[] = []): boolean {
  const host = strip(rawHost).replace(/\.$/, "");
  if (!host || BLOCKED_HOSTS.has(host) || ownHosts().has(host)) return true;
  if ([...BLOCKED_HOST_SUFFIXES, ...extraSuffixes].some((s) => host.endsWith(s))) return true;
  return isIpLiteral(host) && isPrivateIp(host);
}

export interface UrlPolicy {
  // Subject of the error messages, e.g. "Webhook URLs".
  what?: string;
  // Endpoint / native / webhook targets may use any port; API hosts are limited to 443 and 8443.
  anyPort?: boolean;
  // Additional blocked hostname suffixes (webhooks also refuse *.convex.site).
  blockSuffixes?: string[];
}

export type UrlCheck = { ok: true; url: string; host: string } | { ok: false; reason: string };

// Accepts only public https URLs without credentials. Literal IPs must be public; decimal / hex forms are normalized by the URL parser.
export function checkPublicHttpsUrl(raw: string, { what = "The URL", anyPort = false, blockSuffixes = [] }: UrlPolicy = {}): UrlCheck {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return { ok: false, reason: "Enter a URL" };
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: `${what} must use https://` };
  if (u.username || u.password) return { ok: false, reason: "Credentials in the URL are not allowed" };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || isBlockedHost(host, blockSuffixes)) {
    return { ok: false, reason: isIpLiteral(host) ? "Private, loopback, link-local and metadata addresses are not allowed" : "Internal or local hostnames are not allowed" };
  }
  if (!host.includes(".") && !isIpLiteral(host)) return { ok: false, reason: "Use a fully qualified public hostname" };
  if (!anyPort && !ALLOWED_PORTS.has(u.port)) return { ok: false, reason: "Only ports 443 and 8443 are allowed" };
  return { ok: true, url: u.toString(), host };
}

export type HostCheck = { ok: true } | { ok: false; reason: string };

// Resolves the host right before a request (DNS over HTTPS) so a hostname that now points at a private range is refused.
export async function resolvePublicHost(host: string): Promise<HostCheck> {
  if (isBlockedHost(host)) return { ok: false, reason: "blocked address" };
  if (isIpLiteral(host)) return { ok: true };
  const answers: string[] = [];
  for (const type of ["A", "AAAA"]) {
    try {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const json = (await res.json()) as { Answer?: { type: number; data: string }[] };
      for (const a of json.Answer ?? []) if (a.type === 1 || a.type === 28) answers.push(a.data);
    } catch {
      // A resolver hiccup is treated like an unknown host below.
    }
  }
  if (!answers.length) return { ok: false, reason: "host did not resolve" };
  return allPublic(answers) ? { ok: true } : { ok: false, reason: "host resolves to a private or internal address" };
}
