// Project (SaaS listing) rules shared by the dashboard, the public API and the MCP server.
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { slugify, RESERVED } from "../../src/lib/slug";
import { CATEGORY_SLUGS } from "../../src/lib/categories";
import { normalizeDomain } from "../lib/domain";
import { publicTrustLabel } from "../lib/trust";

export type DomainErrorCode = "not_found" | "bad_request" | "conflict" | "rate_limited" | "forbidden";

// Typed failure that every interface (UI toast, REST envelope, MCP tool error) can map without string matching.
export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string, public readonly retryAfterSec?: number) {
    super(message);
    this.name = "DomainError";
  }
}

export interface ProjectInput {
  name: string;
  description: string;
  websiteUrl: string;
  logoUrl?: string;
  category?: string;
  tags: string[];
}

export function normalizeProjectInput(args: ProjectInput) {
  const name = args.name.trim();
  if (name.length < 2) throw new DomainError("bad_request", "Name is too short");
  const rawUrl = args.websiteUrl.trim();
  const websiteUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  if (!normalizeDomain(websiteUrl)) throw new DomainError("bad_request", "Website must be a valid URL (https://example.com)");
  if (args.category && !CATEGORY_SLUGS.has(args.category)) throw new DomainError("bad_request", `Unknown category "${args.category}"`);
  return {
    name,
    description: args.description.trim().slice(0, 160),
    websiteUrl,
    logoUrl: args.logoUrl?.trim() || undefined,
    category: args.category || undefined,
    tags: [...new Set(args.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 5),
  };
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
  return ctx.db.insert("saas", {
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
}

export type ProjectPatch = Partial<ProjectInput> & { slug?: string; isPublic?: boolean };

export async function updateProject(ctx: MutationCtx, saas: Doc<"saas">, patch: ProjectPatch) {
  const merged = normalizeProjectInput({
    name: patch.name ?? saas.name,
    description: patch.description ?? saas.description,
    websiteUrl: patch.websiteUrl ?? saas.websiteUrl,
    logoUrl: patch.logoUrl !== undefined ? patch.logoUrl : saas.logoUrl,
    category: patch.category !== undefined ? patch.category : saas.category,
    tags: patch.tags ?? saas.tags,
  });
  const next: Partial<Doc<"saas">> = merged;
  if (patch.slug && slugify(patch.slug) !== saas.slug) next.slug = await uniqueSlug(ctx, patch.slug, saas._id);
  if (patch.isPublic !== undefined && patch.isPublic !== saas.isPublic) next.isPublic = patch.isPublic;
  await ctx.db.patch(saas._id, next);
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
    ogImage: `${base}/s/${s.slug}/opengraph-image`,
    share: Object.fromEntries(["users", "growth", "rank", "trending", "activation"].map((k) => [k, `${base}/s/${s.slug}/share/${k}`])) as Record<string, string>,
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
    isPublic: s.isPublic,
    verification: { level: s.trust, label: publicTrustLabel(s.trust, s.trustState, s.trustScore), score: s.trustScore },
    metrics: {
      totalUsers: s.totalUsers,
      newUsers24h: s.newUsers24h,
      newUsers7d: s.newUsers7d,
      newUsers30d: s.newUsers30d,
      growth7dPct: s.growth7dPct,
      growth30dPct: s.growth30dPct,
      activatedUsers: s.activatedUsers,
      activationRatePct: s.activationRatePct,
    },
    ranks: { leaderboard: s.rank, previousLeaderboard: s.prevRank, best: s.bestRank, trending: s.trendingRank, previousTrending: s.prevTrendingRank },
    lastSyncedAt: s.lastSyncedAt ? new Date(s.lastSyncedAt).toISOString() : undefined,
    createdAt: new Date(s._creationTime).toISOString(),
    urls: projectUrls(s),
  };
}
