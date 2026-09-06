// Public metadata of a founder's own website, used to prefill a new project (name, description, tagline, icon).
// Pure parsing and URL rules only — the network calls live in convex/enrich.ts.

export interface SiteMeta {
  url: string;
  name?: string;
  description?: string;
  valueProposition?: string;
  iconUrl?: string;
}

const BLOCKED_HOST = /^(localhost|\[?::1\]?|.+\.local|.+\.internal|metadata\..+)$/i;
const PRIVATE_IP = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

// A public http(s) origin we are willing to fetch, or null. Blocks loopback / RFC1918 / metadata hosts so a founder
// cannot point the importer at infrastructure the Convex action can reach but they cannot.
export function publicUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s || s.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.hostname.includes(".") || BLOCKED_HOST.test(u.hostname) || PRIVATE_IP.test(u.hostname)) return null;
  return u;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'",
  mdash: "—", ndash: "–", hellip: "…", middot: "·", bull: "•", laquo: "«", raquo: "»",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©", reg: "®", trade: "™",
};

export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (ENTITIES[k]) return ENTITIES[k];
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : k.startsWith("#") ? Number(k.slice(1)) : NaN;
    return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : m;
  });

const clean = (s: string | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : undefined;
};

const ATTR = /([a-zA-Z:_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+))/g;
const attrs = (raw: string) => {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR)) out[m[1].toLowerCase()] ??= decodeEntities((m[2] ?? m[3] ?? m[4] ?? "").trim());
  return out;
};

// "Acme — Product analytics for indie SaaS" → brand + tagline. The brand is the shorter of the outer segments.
export function splitTitle(title: string): { name: string; tagline?: string } {
  const parts = title.split(/\s+[|·•—–:»>]\s+|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { name: title.trim() };
  const name = parts[0].length <= parts[parts.length - 1].length ? parts[0] : parts[parts.length - 1];
  const tagline = parts.filter((p) => p !== name).join(" · ");
  return { name, tagline: tagline || undefined };
}

// Bigger, sharper icons win: apple-touch-icon (usually a 180px PNG) over a declared size over a bare favicon.
function iconScore(a: Record<string, string>) {
  const rel = a.rel.toLowerCase();
  const size = Math.max(0, ...(a.sizes ?? "").split(/\s+/).map((s) => Number(s.split(/[x×]/)[0]) || 0));
  const type = (a.type ?? "").toLowerCase();
  let score = rel.includes("apple-touch-icon") ? 300 : rel.includes("mask-icon") ? 50 : 100;
  score += Math.min(size, 512) / 4;
  // Only PNG / JPG / WebP can be copied into storage, so a raster icon beats an SVG or an .ico of the same rank.
  if (type.includes("svg") || /\.svg(\?|$)/i.test(a.href)) score -= 30;
  if (type.includes("icon") || /\.ico(\?|$)/i.test(a.href)) score -= 40;
  return score;
}

const absolute = (href: string, base: string) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
};

export function parseSiteMeta(html: string, baseUrl: string): SiteMeta {
  const head = html.slice(0, 400_000);
  const meta: Record<string, string> = {};
  const icons: { href: string; score: number }[] = [];
  for (const m of head.matchAll(/<(meta|link)\b([^>]*?)\/?>/gi)) {
    const a = attrs(m[2]);
    if (m[1].toLowerCase() === "meta") {
      const key = (a.property ?? a.name ?? a.itemprop)?.toLowerCase();
      if (key && a.content) meta[key] ??= a.content;
    } else if (a.rel && a.href && /\bicon\b/i.test(a.rel)) {
      icons.push({ href: a.href, score: iconScore(a) });
    }
  }
  const title = clean(decodeEntities(/<title[^>]*>([\s\S]{0,400}?)<\/title>/i.exec(head)?.[1] ?? ""), 200) ?? "";
  const split = splitTitle(clean(meta["og:title"], 200) ?? title);
  const description = clean(meta.description ?? meta["og:description"] ?? meta["twitter:description"], 500);
  const tagline = clean(split.tagline, 300);
  const icon = icons.sort((a, b) => b.score - a.score)[0]?.href ?? "/favicon.ico";
  return {
    url: baseUrl,
    name: clean(meta["og:site_name"] ?? meta["application-name"] ?? split.name, 100),
    description,
    valueProposition: tagline && tagline.length >= 12 && tagline !== description ? tagline : undefined,
    iconUrl: absolute(icon, baseUrl),
  };
}
