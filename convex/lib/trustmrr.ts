// "Import from TrustMRR": input parsing, the tolerant response mapper and the fetch. Only descriptive fields are ever
// read — every revenue / price / growth field TrustMRR returns is ignored by construction (see REVENUE_KEY_RE in the tests).
import { CATEGORY_SLUGS } from "../../src/lib/categories";
import { COUNTRY_CODES } from "../../src/lib/countries";
import { CHANNEL_SLUGS, MARKET_SLUGS, PROFILE_LIMITS, type Funding, type TeamSize } from "../../src/lib/profile-options";
import { TECH_STACK, TECH_STACK_MAX } from "../../src/lib/tech-stack";
import { isValidXHandle, normalizeXHandle } from "../../src/lib/social";
import type { Doc } from "../_generated/dataModel";

export const TRUSTMRR_API = "https://trustmrr.com/api/v1";
export const TRUSTMRR_SITE = "https://trustmrr.com";
export const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const TIMEOUT_MS = 10_000;

export type TrustmrrErrorCode = "not_configured" | "bad_request" | "not_found" | "rate_limited" | "upstream";
export class TrustmrrError extends Error {
  constructor(public code: TrustmrrErrorCode, message: string, public retryAfterSec?: number) { super(message); }
}

export interface TrustmrrPrefill {
  name?: string; description?: string; websiteUrl?: string; logoUrl?: string; category?: string;
  markets?: string[]; techStack?: string[]; marketingChannels?: string[];
  cofounders?: { name?: string; x?: string }[];
  country?: string; funding?: Funding; teamSize?: TeamSize; foundedAt?: number;
  valueProposition?: string; problemSolved?: string; audience?: string; pricingSummary?: string; additionalInfo?: string;
  projectType?: "mobile";
}
export type PrefillKey = keyof TrustmrrPrefill;
export interface TrustmrrImport { prefill: TrustmrrPrefill; unmapped: string[]; source: { slug: string; url: string } }

// Full URL (/startup/<slug> or /startups/<slug>, with or without scheme, trailing slash, query) or a bare slug.
export function parseTrustmrrRef(input: string): string | null {
  const raw = input.trim().toLowerCase();
  const m = /^(?:https?:\/\/)?(?:www\.)?trustmrr\.com\/startups?\/([^/?#]+)/.exec(raw);
  const slug = (m ? m[1] : raw.replace(/\/+$/, ""));
  return SLUG_RE.test(slug) ? slug : null;
}

type Raw = Record<string, unknown>;
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const obj = (v: unknown): Raw | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : undefined);
const get = (o: Raw | undefined, ...keys: string[]): unknown => { for (const k of keys) { const v = o?.[k] ?? o?.[snake(k)]; if (v !== undefined && v !== null) return v; } return undefined; };
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const text = (v: unknown, max: number) => str(v)?.slice(0, max);
// Arrays of strings or {slug|name|label, category?} objects, or a comma-separated string.
const items = (v: unknown): { value: string; category?: string }[] => {
  if (Array.isArray(v)) return v.flatMap((x) => { const o = obj(x); const value = str(x) ?? str(get(o, "slug", "name", "label")); return value ? [{ value, category: str(get(o, "category")) }] : []; });
  return typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean).map((value) => ({ value })) : [];
};
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const kebab = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, "-");

const TECH_LOOKUP = new Map<string, string>();
for (const t of TECH_STACK) { TECH_LOOKUP.set(squash(t.label), t.slug); TECH_LOOKUP.set(squash(t.slug), t.slug); }
const TECH_ALIASES: Record<string, string> = {
  postgres: "postgresql", pg: "postgresql", mongo: "mongodb", materialui: "mui", net: "dotnet", csharp: "dotnet", golang: "go", k8s: "kubernetes",
  sveltekit: "svelte", alpine: "alpinejs", nextauth: "authjs", claude: "anthropic", chatgpt: "openai", gpt: "openai", spring: "java", springboot: "java",
  gcloud: "gcp", googlecloudplatform: "gcp", ga: "ga4", googleanalytics4: "ga4", cloudflareworkers: "cloudflare", cloudflarepages: "cloudflare",
  awslambda: "aws", amazonwebservices: "aws", firebaseauth: "firebase", supabaseauth: "supabase", rn: "reactnative", resendcom: "resend",
};
// Exact slug / label match after stripping punctuation, then aliases, then "vuejs" ⇄ "vue" style suffix tolerance.
export function mapTech(raw: string): string | undefined {
  const k = squash(raw);
  if (!k) return undefined;
  return TECH_LOOKUP.get(k) ?? TECH_ALIASES[k] ?? (k.endsWith("js") ? TECH_LOOKUP.get(k.slice(0, -2)) : TECH_LOOKUP.get(`${k}js`));
}

// TrustMRR categories → our market / category slugs where they overlap; "saas" is the whole site, not a market.
const TOPIC_ALIASES: Record<string, string> = {
  "design-tools": "design", "health-fitness": "health", "social-media": "social", games: "gaming", "news-magazines": "media", "content-creation": "media",
  entertainment: "media", recruiting: "hr", "crypto-web3": "fintech", marketplace: "ecommerce", community: "social", "iot-hardware": "infrastructure",
  "developer-tool": "developer-tools", devtools: "developer-tools", "e-commerce": "ecommerce", "artificial-intelligence": "ai",
};
const topic = (raw: string, allowed: Set<string>) => { const k = kebab(raw); const v = allowed.has(k) ? k : TOPIC_ALIASES[k]; return v && allowed.has(v) ? v : undefined; };

const CHANNEL_ALIASES: Record<string, string> = {
  "x-twitter": "x", twitter: "x", "paid-search": "paid-ads", "paid-social": "paid-ads", ads: "paid-ads", "google-ads": "paid-ads", "facebook-ads": "paid-ads",
  "meta-ads": "paid-ads", advertising: "paid-ads", blog: "content", "content-marketing": "content", producthunt: "product-hunt", email: "newsletter",
  "email-marketing": "newsletter", "cold-outreach": "cold-email", outbound: "cold-email", affiliate: "affiliates", "affiliate-marketing": "affiliates",
  community: "communities", discord: "communities", slack: "communities", partners: "partnerships", integrations: "partnerships", referrals: "word-of-mouth",
  referral: "word-of-mouth", directory: "directories", "directory-listings": "directories", podcast: "podcasts", conferences: "events",
  aso: "app-store", "app-store-optimization": "app-store", "app-stores": "app-store", "hacker-news": "communities", "indie-hackers": "communities",
};
const CHANNEL_BY_CATEGORY: Record<string, string> = { paid: "paid-ads", community: "communities", partnerships: "partnerships", outbound: "cold-email" };
export function mapChannel(raw: string, category?: string): string | undefined {
  const k = kebab(raw);
  const v = CHANNEL_SLUGS.has(k) ? k : CHANNEL_ALIASES[k] ?? (category ? CHANNEL_BY_CATEGORY[kebab(category)] : undefined);
  return v && CHANNEL_SLUGS.has(v) ? v : undefined;
}

const TEAM: Record<string, TeamSize> = { "1": "1", "2-5": "2-5", "6-10": "6-10", "11-25": "11-50", "26-50": "11-50", "11-50": "11-50", "51+": "50+", "50+": "50+" };
function teamSizeOf(v: unknown): TeamSize | undefined {
  if (typeof v === "number") return v <= 1 ? "1" : v <= 5 ? "2-5" : v <= 10 ? "6-10" : v <= 50 ? "11-50" : "50+";
  const s = str(v)?.replace(/\s/g, "");
  return s ? TEAM[s] : undefined;
}
function fundingOf(v: unknown): Funding | undefined {
  const s = str(v)?.toLowerCase();
  if (!s) return undefined;
  return /boot/.test(s) ? "bootstrapped" : /vc|venture|funded|angel|seed|series/.test(s) ? "vc" : undefined;
}
function foundedOf(v: unknown) {
  const d = new Date(typeof v === "number" ? v : str(v) ?? "");
  if (Number.isNaN(d.getTime())) return undefined;
  const month = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return month >= Date.UTC(1990, 0, 1) && month <= Date.now() ? month : undefined;
}
const httpsUrl = (v: unknown) => { const s = str(v); return s && /^https:\/\//i.test(s) ? s : undefined; };
const AUDIENCE_WORDS: Record<string, string> = { b2b: "B2B", b2c: "B2C", both: "B2B and B2C", b2b2c: "B2B and B2C" };
const MOBILE_PROVIDERS = new Set(["revenuecat", "superwall"]);

// Accepts `{ data: {...} }` or a bare object, camelCase or snake_case keys, arrays of objects / strings or comma strings.
export function mapTrustmrrStartup(json: unknown): { prefill: TrustmrrPrefill; unmapped: string[]; slug?: string } {
  const root = obj(json);
  const d = obj(get(root, "data")) ?? root ?? {};
  const insights = obj(get(d, "startupInsights", "insights")) ?? {};
  const unmapped: string[] = [];
  const prefill: TrustmrrPrefill = {};
  const set = <K extends PrefillKey>(k: K, v: TrustmrrPrefill[K] | undefined) => { if (v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) prefill[k] = v; };

  set("name", text(get(d, "name"), PROFILE_LIMITS.name));
  set("description", text(get(d, "description", "tagline"), PROFILE_LIMITS.description));
  set("websiteUrl", str(get(d, "website", "websiteUrl", "url")));
  set("logoUrl", httpsUrl(get(d, "icon", "logo", "logoUrl")));

  const categories = [...items(get(d, "category")), ...items(get(d, "categories", "markets"))].map((i) => i.value);
  set("category", categories.map((c) => topic(c, CATEGORY_SLUGS)).find(Boolean));
  const markets = [...new Set(categories.map((c) => topic(c, MARKET_SLUGS)).filter((m): m is string => Boolean(m)))].slice(0, PROFILE_LIMITS.markets);
  set("markets", markets);
  for (const c of categories) if (!topic(c, MARKET_SLUGS) && !topic(c, CATEGORY_SLUGS) && kebab(c) !== "saas" && kebab(c) !== "mobile-apps") unmapped.push(`market: ${c}`);

  const stack: string[] = [];
  for (const { value } of items(get(d, "techStack", "stack", "technologies"))) { const s = mapTech(value); if (s) stack.push(s); else unmapped.push(`stack: ${value}`); }
  set("techStack", [...new Set(stack)].slice(0, TECH_STACK_MAX));

  const channels: string[] = [];
  for (const { value, category } of items(get(d, "marketingChannels", "channels"))) { const c = mapChannel(value, category); if (c) channels.push(c); else unmapped.push(`channel: ${value}`); }
  set("marketingChannels", [...new Set(channels)].slice(0, PROFILE_LIMITS.marketingChannels));

  const founders = Array.isArray(get(d, "cofounders", "founders")) ? (get(d, "cofounders", "founders") as unknown[]) : [];
  const cofounders = founders.flatMap((f) => {
    const o = obj(f);
    const name = text(get(o, "xName", "name", "displayName"), PROFILE_LIMITS.cofounderName);
    const handle = normalizeXHandle(str(get(o, "xHandle", "x", "handle", "twitter")) ?? (typeof f === "string" ? f : ""));
    const x = handle && isValidXHandle(handle) ? handle : undefined;
    return name || x ? [{ name, x }] : [];
  });
  set("cofounders", cofounders.slice(0, PROFILE_LIMITS.cofounders));

  const country = str(get(d, "country", "countryCode"))?.toUpperCase();
  set("country", country && COUNTRY_CODES.has(country) ? country : undefined);
  set("funding", fundingOf(get(insights, "fundingStatus", "funding") ?? get(d, "fundingStatus", "funding")));
  set("teamSize", teamSizeOf(get(insights, "teamSize") ?? get(d, "teamSize")));
  set("foundedAt", foundedOf(get(d, "foundedDate", "foundedAt", "founded")));

  set("valueProposition", text(get(insights, "valueProposition") ?? get(d, "valueProposition"), PROFILE_LIMITS.valueProposition));
  set("problemSolved", text(get(insights, "problemSolved") ?? get(d, "problemSolved"), PROFILE_LIMITS.problemSolved));
  set("pricingSummary", text(get(insights, "pricingModel") ?? get(d, "pricingModel", "pricingSummary"), PROFILE_LIMITS.pricingSummary));
  const persona = text(get(insights, "targetPersona") ?? get(d, "targetPersona", "audience"), PROFILE_LIMITS.audience);
  const business = str(get(insights, "businessType") ?? get(d, "targetAudience"))?.toLowerCase();
  set("audience", persona ?? (business ? AUDIENCE_WORDS[business] : undefined));
  set("additionalInfo", text(get(d, "additionalInfo", "notes"), PROFILE_LIMITS.additionalInfo));

  const provider = str(get(d, "paymentProvider"))?.toLowerCase();
  const platforms = items(get(d, "platforms")).map((p) => p.value.toLowerCase());
  if (categories.some((c) => kebab(c) === "mobile-apps") || (provider && MOBILE_PROVIDERS.has(provider)) || platforms.some((p) => /ios|android/.test(p))) set("projectType", "mobile");

  return { prefill, unmapped, slug: str(get(d, "slug")) };
}

export const prefillKeys = (p: TrustmrrPrefill) => Object.keys(p) as PrefillKey[];

const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
// Patch for the domain update path: every prefilled key the project has no value for (or all of them with overwrite).
export function prefillPatch(saas: Pick<Doc<"saas">, PrefillKey>, prefill: TrustmrrPrefill, overwrite: boolean) {
  const patch: Partial<TrustmrrPrefill> = {};
  for (const k of prefillKeys(prefill)) if (overwrite || empty(saas[k])) (patch as Record<string, unknown>)[k] = prefill[k];
  return patch;
}

const retryAfterOf = (res: Response) => { const reset = Number(res.headers.get("x-ratelimit-reset")); return reset > 0 ? Math.max(1, Math.ceil(reset - Date.now() / 1000)) : 60; };

// One authenticated GET; the key travels only in the header and never in an error or log line.
export async function fetchStartup(slug: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<TrustmrrImport> {
  let res: Response;
  try {
    res = await fetchImpl(`${TRUSTMRR_API}/startups/${slug}`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "User-Agent": "UserTrack/1.0" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new TrustmrrError("upstream", "TrustMRR did not answer within 10 s; try again");
  }
  if (res.status === 404) throw new TrustmrrError("not_found", `No startup "${slug}" on TrustMRR — check the URL`);
  if (res.status === 429) throw new TrustmrrError("rate_limited", "TrustMRR rate limit, try again in a minute", retryAfterOf(res));
  if (res.status === 401 || res.status === 403) throw new TrustmrrError("not_configured", "TrustMRR rejected the operator key; the operator has to check TRUSTMRR_API_KEY");
  if (!res.ok) throw new TrustmrrError("upstream", `TrustMRR returned ${res.status}; try again later`);
  const json: unknown = await res.json().catch(() => { throw new TrustmrrError("upstream", "TrustMRR returned an unreadable response"); });
  const { prefill, unmapped, slug: found } = mapTrustmrrStartup(json);
  const s = found && SLUG_RE.test(found) ? found : slug;
  return { prefill, unmapped, source: { slug: s, url: `${TRUSTMRR_SITE}/startup/${s}` } };
}
