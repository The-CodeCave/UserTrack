// Project (SaaS listing) rules shared by the dashboard, the public API and the MCP server.
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { slugify, RESERVED } from "../../src/lib/slug";
import { CATEGORY_SLUGS } from "../../src/lib/categories";
import { CHANNEL_SLUGS, MARKET_SLUGS, PROFILE_LIMITS, type Funding, type TeamSize } from "../../src/lib/profile-options";
import { TECH_STACK, TECH_STACK_BY_SLUG, TECH_STACK_MAX, normalizeStackEntry } from "../../src/lib/tech-stack";
import { COUNTRY_CODES } from "../../src/lib/countries";
import { isValidXHandle, normalizeXHandle } from "../../src/lib/social";
import { normalizeDomain } from "../lib/domain";
import { SLUG_RE as TRUSTMRR_SLUG_RE } from "../lib/trustmrr";
import { publicTrustLabel } from "../lib/trust";
import { scheduleMissingSourceReminder } from "../email/lifecycle";
import { markLaunched } from "./events";

export type DomainErrorCode = "not_found" | "bad_request" | "conflict" | "rate_limited" | "forbidden";

// Typed failure that every interface (UI toast, REST envelope, MCP tool error) can map without string matching.
export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string, public readonly retryAfterSec?: number) {
    super(message);
    this.name = "DomainError";
  }
}

export type ProjectType = "web" | "mobile" | "hybrid";
export const AUTH_METHODS = ["apple", "google", "email", "phone", "github", "microsoft", "other"] as const;

export interface ProjectInput {
  name: string;
  description: string;
  websiteUrl: string;
  logoUrl?: string;
  category?: string;
  tags: string[];
  projectType?: ProjectType;
  appStoreUrl?: string;
  playStoreUrl?: string;
  // Informational: how users authenticate (Sign in with Apple, Google…). Never a metric source.
  authMethods?: string[];
  // Optional founding month (ms since epoch); benchmark age cohorts use it instead of the tracking age.
  foundedAt?: number;
  // Product profile (src/lib/profile-options.ts, tech-stack.ts, countries.ts). Descriptive only — never revenue.
  markets?: string[];
  techStack?: string[];
  marketingChannels?: string[];
  cofounders?: Cofounder[];
  country?: string;
  funding?: Funding;
  teamSize?: TeamSize;
  valueProposition?: string;
  problemSolved?: string;
  audience?: string;
  pricingSummary?: string;
  additionalInfo?: string;
  anonymous?: boolean;
  hideFromSearch?: boolean;
  // Same product on trustmrr.com (IMPORT-1); empty string clears it.
  trustmrrSlug?: string;
}

export interface Cofounder { name?: string; x?: string; github?: string }

const PROFILE_KEYS = ["markets", "techStack", "marketingChannels", "cofounders", "country", "funding", "teamSize", "valueProposition", "problemSolved", "audience", "pricingSummary", "additionalInfo", "anonymous", "hideFromSearch"] as const;

const text = (v: string | undefined, max: number) => v?.trim().slice(0, max) || undefined;
// Curated multi-select: unknown slugs are dropped, duplicates collapse, the list is capped.
const curated = (list: string[] | undefined, allowed: Set<string>, max: number) => { if (!list) return undefined; const out = [...new Set(list.map((x) => x.trim().toLowerCase()).filter((x) => allowed.has(x)))].slice(0, max); return out.length ? out : undefined; };
const GITHUB_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export function normalizeCofounders(list: Cofounder[] | undefined) {
  if (!list) return undefined;
  const out: Cofounder[] = [];
  for (const c of list) {
    const name = text(c.name, PROFILE_LIMITS.cofounderName);
    const x = normalizeXHandle(c.x) || undefined;
    if (x && !isValidXHandle(x)) throw new DomainError("bad_request", `Cofounder X handle "${x}" is invalid`);
    const github = c.github?.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "") || undefined;
    if (github && !GITHUB_RE.test(github)) throw new DomainError("bad_request", `Cofounder GitHub handle "${github}" is invalid`);
    if (name || x || github) out.push({ name, x, github });
  }
  return out.length ? out.slice(0, PROFILE_LIMITS.cofounders) : undefined;
}

// Tech stack: curated slugs (or their labels, e.g. "Next.js") pass through, anything else becomes a free-text entry (lowercase token, no icon).
const TECH_BY_LABEL = new Map(TECH_STACK.map((t) => [t.label.toLowerCase(), t.slug]));
export function normalizeTechStack(list: string[] | undefined) {
  if (!list) return undefined;
  const one = (raw: string) => { const k = raw.trim().toLowerCase(); return TECH_STACK_BY_SLUG.has(k) ? k : TECH_BY_LABEL.get(k) ?? normalizeStackEntry(raw); };
  const out = [...new Set(list.map(one).filter((x): x is string => Boolean(x)))].slice(0, TECH_STACK_MAX);
  return out.length ? out : undefined;
}

function normalizeProfile(args: ProjectInput) {
  const country = args.country?.trim().toUpperCase() || undefined;
  if (country && !COUNTRY_CODES.has(country)) throw new DomainError("bad_request", `Unknown country "${country}"`);
  return {
    markets: curated(args.markets, MARKET_SLUGS, PROFILE_LIMITS.markets),
    techStack: normalizeTechStack(args.techStack),
    marketingChannels: curated(args.marketingChannels, CHANNEL_SLUGS, PROFILE_LIMITS.marketingChannels),
    cofounders: normalizeCofounders(args.cofounders),
    country,
    funding: args.funding,
    teamSize: args.teamSize,
    valueProposition: text(args.valueProposition, PROFILE_LIMITS.valueProposition),
    problemSolved: text(args.problemSolved, PROFILE_LIMITS.problemSolved),
    audience: text(args.audience, PROFILE_LIMITS.audience),
    pricingSummary: text(args.pricingSummary, PROFILE_LIMITS.pricingSummary),
    additionalInfo: text(args.additionalInfo, PROFILE_LIMITS.additionalInfo),
    anonymous: args.anonymous || undefined,
    hideFromSearch: args.hideFromSearch || undefined,
  };
}

const storeUrl = (v: string | undefined, host: RegExp, what: string) => {
  const url = v?.trim();
  if (!url) return undefined;
  if (!/^https:\/\//i.test(url) || !host.test(url)) throw new DomainError("bad_request", `${what} must be an https URL on the store domain`);
  return url;
};

export function normalizeProjectInput(args: ProjectInput) {
  const name = args.name.trim();
  if (name.length < 2) throw new DomainError("bad_request", "Name is too short");
  if (name.length > PROFILE_LIMITS.name) throw new DomainError("bad_request", `Name must be at most ${PROFILE_LIMITS.name} characters`);
  const rawUrl = args.websiteUrl.trim();
  const websiteUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  if (!normalizeDomain(websiteUrl)) throw new DomainError("bad_request", "Website must be a valid URL (https://example.com)");
  if (args.category && !CATEGORY_SLUGS.has(args.category)) throw new DomainError("bad_request", `Unknown category "${args.category}"`);
  return {
    name,
    description: args.description.trim().slice(0, PROFILE_LIMITS.description),
    websiteUrl,
    logoUrl: args.logoUrl?.trim() || undefined,
    category: args.category || undefined,
    tags: [...new Set(args.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 5),
    projectType: args.projectType,
    appStoreUrl: storeUrl(args.appStoreUrl, /apps\.apple\.com/i, "App Store URL"),
    playStoreUrl: storeUrl(args.playStoreUrl, /play\.google\.com/i, "Google Play URL"),
    authMethods: args.authMethods ? [...new Set(args.authMethods.map((m) => m.trim().toLowerCase()).filter((m) => (AUTH_METHODS as readonly string[]).includes(m)))] : undefined,
    foundedAt: foundedAtOf(args.foundedAt),
    trustmrrSlug: trustmrrSlugOf(args.trustmrrSlug),
    ...normalizeProfile(args),
  };
}

function trustmrrSlugOf(v: string | undefined) {
  const slug = v?.trim().toLowerCase() || undefined;
  if (slug && !TRUSTMRR_SLUG_RE.test(slug)) throw new DomainError("bad_request", "TrustMRR slug must be lowercase letters, digits and dashes");
  return slug;
}

// Month precision, between 1990 and now; anything else is dropped rather than stored as a bogus age.
function foundedAtOf(v: number | undefined) {
  if (v === undefined || !Number.isFinite(v) || v <= 0) return undefined;
  const d = new Date(v);
  const month = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  if (month < Date.UTC(1990, 0, 1) || month > Date.now()) throw new DomainError("bad_request", "Founded date must be between 1990 and today");
  return month;
}

export async function uniqueSlug(ctx: MutationCtx, base: string, ignore?: Id<"saas">) {
  const root = slugify(base) || "saas";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`;
    if (RESERVED.has(slug)) continue;
    const hit = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!hit || hit._id === ignore) return slug;
  }
  throw new DomainError("conflict", "Could not find a free slug");
}

export async function listOwnedProjects(ctx: QueryCtx | MutationCtx, ownerId: Id<"profiles">) {
  return ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
}

// Same owner + same canonical domain = same project. This is what makes agent retries idempotent.
export async function findOwnedByDomain(ctx: QueryCtx | MutationCtx, ownerId: Id<"profiles">, websiteUrl: string) {
  const host = normalizeDomain(websiteUrl);
  if (!host) return null;
  return (await listOwnedProjects(ctx, ownerId)).find((s) => normalizeDomain(s.websiteUrl) === host) ?? null;
}

export async function createProject(ctx: MutationCtx, ownerId: Id<"profiles">, input: ProjectInput) {
  const data = normalizeProjectInput(input);
  const id = await ctx.db.insert("saas", {
    ...data,
    ownerId,
    slug: await uniqueSlug(ctx, data.name),
    isPublic: false,
    trust: "pending",
    totalUsers: 0,
    newUsers24h: 0,
    newUsers7d: 0,
    newUsers30d: 0,
    growth30dPct: 0,
  });
  await scheduleMissingSourceReminder(ctx, id);
  return id;
}

export type ProjectPatch = Partial<ProjectInput> & { slug?: string; isPublic?: boolean };
export type Publisher = { emailVerified?: boolean } | null | undefined;

// Public pages and founder profiles require a verified email; the caller passes the Better Auth user (or null = refuse).
export function requireVerifiedToPublish(user: Publisher) {
  if (!user?.emailVerified) throw new DomainError("forbidden", "Verify your email to publish (Settings → Verify email)");
}

export async function updateProject(ctx: MutationCtx, saas: Doc<"saas">, patch: ProjectPatch, publisher?: Publisher) {
  if (patch.isPublic && !saas.isPublic) requireVerifiedToPublish(publisher);
  const merged = normalizeProjectInput({
    name: patch.name ?? saas.name,
    description: patch.description ?? saas.description,
    websiteUrl: patch.websiteUrl ?? saas.websiteUrl,
    logoUrl: patch.logoUrl !== undefined ? patch.logoUrl : saas.logoUrl,
    category: patch.category !== undefined ? patch.category : saas.category,
    tags: patch.tags ?? saas.tags,
    projectType: patch.projectType ?? saas.projectType,
    appStoreUrl: patch.appStoreUrl !== undefined ? patch.appStoreUrl : saas.appStoreUrl,
    playStoreUrl: patch.playStoreUrl !== undefined ? patch.playStoreUrl : saas.playStoreUrl,
    authMethods: patch.authMethods ?? saas.authMethods,
    foundedAt: patch.foundedAt !== undefined ? (patch.foundedAt || undefined) : saas.foundedAt,
    trustmrrSlug: patch.trustmrrSlug !== undefined ? patch.trustmrrSlug : saas.trustmrrSlug,
    ...Object.fromEntries(PROFILE_KEYS.map((k) => [k, patch[k] !== undefined ? patch[k] : saas[k]])),
  });
  const next: Partial<Doc<"saas">> = merged;
  if (patch.slug && slugify(patch.slug) !== saas.slug) next.slug = await uniqueSlug(ctx, patch.slug, saas._id);
  if (patch.isPublic !== undefined && patch.isPublic !== saas.isPublic) next.isPublic = patch.isPublic;
  await ctx.db.patch(saas._id, next);
  if (next.isPublic) await markLaunched(ctx, saas);
  if (next.isPublic !== undefined) await ctx.scheduler.runAfter(0, internal.leaderboard.rerank, {});
  return { ...saas, ...next };
}

// Resolves a project by Convex id or slug and enforces ownership. Ids alone are never trusted.
export async function requireOwnedProject(ctx: QueryCtx | MutationCtx, ownerId: Id<"profiles">, ref: { id?: string; slug?: string }) {
  let saas: Doc<"saas"> | null = null;
  if (ref.id) saas = await ctx.db.get(ref.id as Id<"saas">).catch(() => null);
  if (!saas && ref.slug) saas = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", ref.slug!)).unique();
  if (!saas && ref.id) saas = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", ref.id!)).unique();
  if (!saas || saas.ownerId !== ownerId) throw new DomainError("not_found", "Project not found");
  return saas;
}

export const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function projectUrls(s: Pick<Doc<"saas">, "slug">, username?: string) {
  const base = siteUrl();
  return {
    page: `${base}/s/${s.slug}`,
    profile: username ? `${base}/u/${username}` : undefined,
    badge: `${base}/api/badge/${s.slug}.svg`,
    widget: `${base}/embed/${s.slug}`,
    ogImage: `${base}/s/${s.slug}/opengraph-image`,
    share: Object.fromEntries(["users", "growth", "week", "rank", "trending", "activation", "conversion"].map((k) => [k, `${base}/s/${s.slug}/share/${k}`])) as Record<string, string>,
    api: `${base}/api/v1/saas/${s.slug}`,
  };
}

// Owner-facing summary: everything the founder can already see on the dashboard, nothing internal to the trust engine.
export function projectSummary(s: Doc<"saas">) {
  return {
    id: s._id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    websiteUrl: s.websiteUrl,
    logoUrl: s.logoUrl,
    category: s.category,
    tags: s.tags,
    projectType: s.projectType ?? "web",
    appStoreUrl: s.appStoreUrl,
    playStoreUrl: s.playStoreUrl,
    authMethods: s.authMethods,
    foundedAt: s.foundedAt ? new Date(s.foundedAt).toISOString() : undefined,
    ...Object.fromEntries(PROFILE_KEYS.map((k) => [k, s[k]])),
    isPublic: s.isPublic,
    verification: { level: s.trust, label: publicTrustLabel(s.trust, s.trustState, s.trustScore), score: s.trustScore },
    metrics: {
      totalUsers: s.totalUsers,
      newUsers24h: s.newUsers24h,
      newUsers7d: s.newUsers7d,
      newUsers30d: s.newUsers30d,
      growth7dPct: s.growth7dPct,
      growth30dPct: s.growth30dPct,
      streakDays: s.streakDays ?? 0,
      activatedUsers: s.activatedUsers,
      activationRatePct: s.activationRatePct,
      trialUsers: s.trialUsers,
      convertedUsers: s.convertedUsers,
      signupToConvertedPct: s.signupToConvertedPct,
      activatedToConvertedPct: s.activatedToConvertedPct,
      trialToConvertedPct: s.trialToConvertedPct,
      identityQuality: s.identityQuality ?? "aggregate_only",
    },
    ranks: { leaderboard: s.rank, previousLeaderboard: s.prevRank, best: s.bestRank, trending: s.trendingRank, previousTrending: s.prevTrendingRank },
    lastSyncedAt: s.lastSyncedAt ? new Date(s.lastSyncedAt).toISOString() : undefined,
    createdAt: new Date(s._creationTime).toISOString(),
    urls: projectUrls(s),
  };
}

// ---- Deletion ---------------------------------------------------------------------------------------------------------

type Drainable = { take(n: number): Promise<{ _id: Id<TableNames> }[]> };

// Deletes up to `budget` rows of one query; returns how many went. `< budget` means the query is exhausted.
export async function drain(ctx: MutationCtx, budget: number, q: Drainable) {
  if (budget <= 0) return 0;
  const rows = await q.take(budget);
  for (const r of rows) await ctx.db.delete(r._id);
  return rows.length;
}

// Every row that belongs to one project, in dependency order. Returns the number deleted (≤ budget); when the result is
// below the budget nothing is left and the caller may delete the `saas` row itself.
export async function removeProjectRows(ctx: MutationCtx, id: Id<"saas">, budget: number) {
  let n = 0;
  const saas = await ctx.db.get(id);
  if (saas?.logoStorageId) { await ctx.storage.delete(saas.logoStorageId); await ctx.db.patch(id, { logoStorageId: undefined }); }
  for (const i of await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", id)).collect()) {
    n += await drain(ctx, budget - n, ctx.db.query("integrationEvents").withIndex("by_integration_time", (q) => q.eq("integrationId", i._id)));
    if (n >= budget) return n;
    await ctx.db.delete(i._id);
    n++;
  }
  const children: Drainable[] = [
    ctx.db.query("snapshots").withIndex("by_saas_time", (q) => q.eq("saasId", id)),
    ctx.db.query("stageSnapshots").withIndex("by_saas_stage_time", (q) => q.eq("saasId", id)),
    ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", id)),
    ctx.db.query("identityLinks").withIndex("by_saas_subject", (q) => q.eq("saasId", id)),
    ctx.db.query("cohortMetrics").withIndex("by_saas_cohort", (q) => q.eq("saasId", id)),
    ctx.db.query("syncRuns").withIndex("by_saas_time", (q) => q.eq("saasId", id)),
    ctx.db.query("backfills").withIndex("by_saas_time", (q) => q.eq("saasId", id)),
    ctx.db.query("milestones").withIndex("by_saas_time", (q) => q.eq("saasId", id)),
    ctx.db.query("events").withIndex("by_saas_time", (q) => q.eq("saasId", id)),
    ctx.db.query("shareEvents").withIndex("by_saas_key", (q) => q.eq("saasId", id)),
    ctx.db.query("embedSites").withIndex("by_saas_host", (q) => q.eq("saasId", id)),
    ctx.db.query("follows").withIndex("by_target", (q) => q.eq("targetType", "saas").eq("targetId", id)),
    ctx.db.query("fraudFlags").withIndex("by_saas", (q) => q.eq("saasId", id)),
    ctx.db.query("rankHistory").withIndex("by_saas_kind_window_day", (q) => q.eq("saasId", id)),
    ctx.db.query("benchmarkHistory").withIndex("by_saas_week", (q) => q.eq("saasId", id)),
    ctx.db.query("emailEvents").withIndex("by_saas_type_time", (q) => q.eq("saasId", id)),
  ];
  for (const q of children) {
    n += await drain(ctx, budget - n, q);
    if (n >= budget) return n;
  }
  return n;
}

// Whole project in one transaction (dashboard delete, seed cleanup). Account deletion pages the same helper instead.
export async function removeSaas(ctx: MutationCtx, id: Id<"saas">) {
  const STEP = 500;
  while ((await removeProjectRows(ctx, id, STEP)) >= STEP);
  await ctx.db.delete(id);
}
