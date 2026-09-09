// Public metadata of a founder's own website, used to prefill a new project (name, description, tagline, icon).
// Pure parsing and URL rules only — the network calls live in convex/enrich.ts.

export interface SiteMeta {
  url: string;
  name?: string;
  description?: string;
  valueProposition?: string;
  iconUrl?: string;
  // Every declared icon, best first, with /favicon.ico appended: the importer tries them in order, so a site whose
  // apple-touch-icon 404s still gets its favicon instead of no logo at all.
  iconUrls: string[];
}

// How many icons the importer is allowed to try. Each one is a network round trip on the founder's first keystroke.
export const ICON_CANDIDATES = 4;

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
  const ranked = icons.sort((a, b) => b.score - a.score).map((i) => absolute(i.href, baseUrl));
  const iconUrls = [...new Set([...ranked, absolute("/favicon.ico", baseUrl)].filter((u): u is string => Boolean(u)))].slice(0, ICON_CANDIDATES);
  return {
    url: baseUrl,
    name: clean(meta["og:site_name"] ?? meta["application-name"] ?? split.name, 100),
    description,
    valueProposition: tagline && tagline.length >= 12 && tagline !== description ? tagline : undefined,
    iconUrl: iconUrls[0],
    iconUrls,
  };
}

export interface SiteHints {
  identity?: string;
  analytics?: string;
  monetization?: string;
  category?: string;
  // Store links prove apps exist next to the site we just read, so "hybrid" is the only honest guess here.
  projectType?: "hybrid";
  appStoreUrl?: string;
  playStoreUrl?: string;
}

type HintKey = "identity" | "analytics" | "monetization";

// Hosts that prove a provider is wired in, most specific first: the first hit per key wins, so a site running
// PostHog *and* GA4 answers "PostHog" (the product-usage question) instead of refusing. Matched against
// `host + pathname` of script / link / iframe assets only — "we use Stripe" in a paragraph proves nothing.
const PROVIDER_ASSETS: [HintKey, string, RegExp][] = [
  ["identity", "clerk", /(^|\.)clerk\.(com|accounts\.dev)\/|^clerk\.[a-z0-9.-]+\//],
  ["identity", "supabase", /(^|\.)supabase\.(co|com)\//],
  ["identity", "firebase", /(^|\.)firebaseapp\.com\/|(^|\.)identitytoolkit\.googleapis\.com\/|(^|\.)gstatic\.com\/firebasejs\//],
  ["identity", "auth0", /(^|\.)auth0\.com\//],
  ["identity", "convex", /(^|\.)convex\.(cloud|site)\//],
  ["identity", "better_auth", /\/better-auth[@./]/],
  ["identity", "authjs", /\/next-auth[@./]|(^|\.)authjs\.dev\//],
  ["analytics", "posthog", /(^|\.)posthog\.com\//],
  ["analytics", "plausible", /(^|\.)plausible\.io\//],
  ["analytics", "amplitude", /(^|\.)amplitude\.com\//],
  ["analytics", "mixpanel", /(^|\.)mixpanel\.com\/|(^|\.)mxpnl\.com\//],
  ["analytics", "ga4", /(^|\.)googletagmanager\.com\/(gtag\/js|gtm\.js)|(^|\.)google-analytics\.com\//],
  ["monetization", "stripe", /(^|\.)stripe\.com\//],
  ["monetization", "paddle", /(^|\.)paddle\.com\//],
  ["monetization", "lemonsqueezy", /(^|\.)lemonsqueezy\.com\/|(^|\.)lmsqueezy\.com\//],
  ["monetization", "revenuecat", /(^|\.)revenuecat\.com\//],
  ["monetization", "chargebee", /(^|\.)chargebee\.com\//],
];

// Globals that only appear when the SDK is actually initialised. Read from <script> bodies, never from body text.
const PROVIDER_GLOBALS: [HintKey, string, RegExp][] = [
  ["identity", "clerk", /__clerk|\bClerk\.load\s*\(/],
  ["analytics", "posthog", /\bposthog\.init\s*\(/],
  ["monetization", "stripe", /\bStripe\s*\(\s*["']pk_(test|live)_/],
];

// Only a phrase that names the category outright counts, and only when exactly one category matches: a wrong
// guess seeds the wrong peers on the preview, so "no idea" is the better answer.
const CATEGORY_HINTS: [string, RegExp][] = [
  ["developer-tools", /\bdev(eloper)? tools?\b|\bfor developers\b|\bdeveloper platform\b/],
  ["analytics", /\banalytics\b|\bbusiness intelligence\b/],
  ["marketing", /\bmarketing (platform|automation|software)\b|\bemail marketing\b/],
  ["sales", /\bcrm\b|\bsales (platform|software)\b/],
  ["productivity", /\bproductivity (app|tool|software)\b|\bproject management\b/],
  ["fintech", /\bfintech\b|\baccounting software\b|\binvoicing\b/],
  ["no-code", /\bno[- ]code\b/],
  ["design", /\bdesign (tool|platform|software)\b/],
  ["ecommerce", /\be-?commerce\b|\bonline store\b/],
  ["education", /\bed[- ]?tech\b|\bonline (course|learning)\b/],
  ["health", /\bhealth(care)? (app|platform|software)\b/],
  ["social", /\bcommunity (platform|software)\b/],
  ["infrastructure", /\b(hosting|infrastructure|devops) platform\b/],
  ["ai", /\bai[- ](powered|assistant|agent|platform)\b|\bartificial intelligence\b/],
];

const APP_STORE = /^https:\/\/apps\.apple\.com\//i;
const PLAY_STORE = /^https:\/\/play\.google\.com\/store\/apps\//i;

function guessCategory(text: string) {
  const hits = [...new Set(CATEGORY_HINTS.filter(([, re]) => re.test(text.toLowerCase())).map(([slug]) => slug))];
  return hits.length === 1 ? hits[0] : undefined;
}

// What the founder's own page already answers of the onboarding questionnaire. Conservative by construction:
// every signal is an asset host, a script global or an outbound store link, never prose.
export function detectSiteHints(html: string, meta: SiteMeta): SiteHints {
  const assets: string[] = [];
  const links: string[] = [];
  for (const m of html.matchAll(/<(script|link|iframe|a)\b([^>]*?)\/?>/gi)) {
    const a = attrs(m[2]);
    const href = a.src ?? a.href;
    if (!href) continue;
    let u: URL;
    try {
      u = new URL(href, meta.url);
    } catch {
      continue;
    }
    if (m[1].toLowerCase() === "a") links.push(u.toString());
    else assets.push(`${u.hostname.toLowerCase()}${u.pathname}`);
  }
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  const hints: SiteHints = {};
  for (const [key, value, re] of PROVIDER_ASSETS) if (!hints[key] && assets.some((a) => re.test(a))) hints[key] = value;
  for (const [key, value, re] of PROVIDER_GLOBALS) if (!hints[key] && re.test(scripts)) hints[key] = value;
  const appStoreUrl = links.find((l) => APP_STORE.test(l));
  const playStoreUrl = links.find((l) => PLAY_STORE.test(l));
  if (appStoreUrl || playStoreUrl) Object.assign(hints, { projectType: "hybrid", appStoreUrl, playStoreUrl });
  hints.category = guessCategory(`${meta.name ?? ""} ${meta.valueProposition ?? ""} ${meta.description ?? ""}`);
  return hints;
}
