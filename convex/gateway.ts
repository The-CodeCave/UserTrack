// Token-authenticated entry points used by the public API and the MCP server (called from Next.js with a token hash).
// Every function re-validates the credential, enforces scopes and strict ownership, then delegates to the domain layer.
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { authComponent } from "./auth";
import { hasScope, isActive, PLANS, planFor, type TokenType } from "./lib/tokens";
import { RANGES, dayKey, dayStart, DAY } from "./lib/time";
import { integrationRole, providerKind, tokenType } from "./schema";
import { describeProvider, getProvider, normalizeRole, ProviderError, verificationLevel, type Role } from "./providers";
import { detectedCount } from "./integrations";
import { visibilityOf } from "./domain/visibility";
import { fetchMetrics } from "./providerRun";
import { DomainError, createProject, findOwnedByDomain, listOwnedProjects, projectSummary, projectUrls, requireOwnedProject, updateProject } from "./domain/projects";
import { connectIntegration, integrationView, listIntegrations, requestSync } from "./domain/integrations";
import { TIMEFRAMES, metricsSummary, milestonesFor, seriesFor, shareData } from "./domain/metrics";
import { INTEGRATION_CATALOG, conversionSetup as conversionPlan, identityMappingGuidance, integrationSetup, rankActivationEvents, recommendIntegrations } from "./lib/integrationSetup";
import { publicProfile, publicSaas, sortBoard, trendingRankFor, HIDDEN_GEM_RULES } from "./public";
import { FUNNEL_TIMEFRAMES, OWNER_FUNNEL, STAGE_ORDER, funnelFor, funnelHistoryFor, funnelSources } from "./domain/funnel";
import { cohortView } from "./cohorts";
import { projectType as projectTypeArg } from "./schema";
import { BENCHMARK_METRICS, BENCHMARK_METRIC_LABEL, MIN_SAMPLE, benchmarkInsight, medianMultiple, percentileOf } from "./lib/benchmarks";
import { SIZE_BUCKETS, sizeBucket } from "./lib/metrics";
import { explainTrending, trendingFactors } from "./lib/trending";
import { trendingInputs } from "./leaderboard";
import { CATEGORIES } from "../src/lib/categories";

export const authArg = v.object({ hash: v.string(), gateway: v.optional(v.string()) });
type Auth = { hash: string; gateway?: string };
const refArg = { projectId: v.optional(v.string()), slug: v.optional(v.string()) };
const rangeArg = v.union(...RANGES.map((r) => v.literal(r)));
const timeframeArg = v.union(...TIMEFRAMES.map((t) => v.literal(t)));

export type GatewayErrorCode = "unauthorized" | "revoked" | "expired" | "forbidden" | "rate_limited" | "not_found" | "bad_request" | "conflict";
const fail = (code: GatewayErrorCode, message: string, extra: Record<string, unknown> = {}): never => {
  throw new ConvexError({ code, message, ...extra });
};

// Turns domain failures into structured errors the REST envelope and MCP tool results can render.
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DomainError) return fail(e.code, e.message, e.retryAfterSec ? { retryAfterSec: e.retryAfterSec } : {});
    throw e;
  }
}

async function authenticate(ctx: QueryCtx | MutationCtx, auth: Auth, type: TokenType, scope?: string) {
  const expected = process.env.UT_GATEWAY_SECRET;
  if (expected && auth.gateway !== expected) fail("unauthorized", "Gateway secret mismatch");
  const token = await ctx.db.query("developerTokens").withIndex("by_hash", (q) => q.eq("hash", auth.hash)).unique();
  if (!token || token.type !== type) return fail("unauthorized", type === "mcp" ? "Invalid MCP token" : "Invalid API key");
  if (token.revokedAt !== undefined) return fail("revoked", "This token has been revoked");
  if (!isActive(token)) return fail("expired", "This token has expired");
  if (!hasScope(token.scopes, scope)) return fail("forbidden", `This token is missing the ${scope} scope`, { requiredScope: scope, scopes: token.scopes });
  const profile = await ctx.db.get(token.profileId);
  if (!profile) return fail("unauthorized", "Token owner not found");
  return { token, profile };
}

async function audit(ctx: MutationCtx, p: { profileId: Id<"profiles">; tokenId: Id<"developerTokens">; action: string; saasId?: Id<"saas">; ok: boolean; detail?: string }) {
  await ctx.db.insert("auditLogs", { ...p, at: Date.now() });
}

// One call per request: validates, applies the daily quota, records usage in a per-day bucket and touches lastUsedAt (throttled).
export const authorize = mutation({
  args: { auth: authArg, type: tokenType, scope: v.optional(v.string()), category: v.string() },
  handler: async (ctx, { auth, type, scope, category }) => {
    const { token, profile } = await authenticate(ctx, auth, type, scope);
    const now = Date.now();
    const day = dayKey(now);
    const plan = planFor();
    const perDay = PLANS[plan][type].perDay;
    const rows = await ctx.db.query("apiUsage").withIndex("by_token_day", (q) => q.eq("tokenId", token._id).eq("day", day)).collect();
    const usedToday = rows.reduce((a, r) => a + r.count, 0);
    const resetAt = dayStart(now) + DAY;
    if (usedToday >= perDay) fail("rate_limited", `Daily limit of ${perDay} requests reached`, { retryAfterSec: Math.ceil((resetAt - now) / 1000), limit: perDay, resetAt });
    const row = rows.find((r) => r.category === category);
    if (row) await ctx.db.patch(row._id, { count: row.count + 1, updatedAt: now });
    else await ctx.db.insert("apiUsage", { tokenId: token._id, day, category, count: 1, updatedAt: now });
    if (!token.lastUsedAt || now - token.lastUsedAt > 60_000) await ctx.db.patch(token._id, { lastUsedAt: now });
    return {
      tokenId: token._id,
      tokenName: token.name,
      profileId: profile._id,
      username: profile.username,
      scopes: token.scopes,
      plan,
      limit: { perDay, usedToday: usedToday + 1, remaining: Math.max(0, perDay - usedToday - 1), resetAt },
    };
  },
});

// ---- Account & projects ---------------------------------------------------------------------------------------------

export const account = query({
  args: { auth: authArg },
  handler: async (ctx, { auth }) => {
    const { token, profile } = await authenticate(ctx, auth, "mcp", "profile:read");
    const user = await authComponent.getAnyUserById(ctx, profile.userId);
    const projects = await listOwnedProjects(ctx, profile._id);
    return {
      profile: { ...publicProfile(profile), id: profile._id, email: user?.email, onboardingCompleted: profile.onboardingCompleted, url: projectUrls({ slug: "" }, profile.username).profile },
      token: { name: token.name, prefix: token.prefix, scopes: token.scopes, createdAt: new Date(token.createdAt).toISOString() },
      projectCount: projects.length,
      projects: projects.map((s) => ({ id: s._id, slug: s.slug, name: s.name, isPublic: s.isPublic, verification: s.trust, totalUsers: s.totalUsers, url: projectUrls(s).page })),
    };
  },
});

export const projects = query({
  args: { auth: authArg },
  handler: async (ctx, { auth }) => {
    const { profile } = await authenticate(ctx, auth, "mcp", "projects:read");
    const rows = await listOwnedProjects(ctx, profile._id);
    const out = [];
    for (const s of rows.sort((a, b) => b._creationTime - a._creationTime)) out.push({ ...projectSummary(s), lifecycle: await lifecycleOf(ctx, s) });
    return out;
  },
});

const CONVERSION_HINT = "Connect a conversion source (usertrack_get_conversion_setup) to see Trial → Converted. Payment providers are read for conversion state only, never revenue.";

// Which lifecycle stages have data today, plus what to connect next. Stages come from synced sources (same rule as the funnel).
async function lifecycleOf(ctx: QueryCtx | MutationCtx, saas: Doc<"saas">) {
  const sources = await funnelSources(ctx, saas._id);
  const stages = STAGE_ORDER.filter((k) => (k === "reached" ? sources.traffic : k === "signed_up" ? sources.users : k === "activated" ? sources.activation : k === "trial" ? sources.conversion?.trial : sources.conversion));
  const nextStep = !sources.users ? "Connect a users source first (usertrack_get_provider_recommendation)." : !sources.activation ? "Connect an activation source (usertrack_get_activation_setup) to see Signed up → Activated." : !sources.conversion ? CONVERSION_HINT : sources.conversion.identity && saas.identityQuality !== "cohort_verified" ? "Carry one user id across sources (usertrack_get_identity_mapping) to reach Cohort Verified." : undefined;
  return { stages, identityQuality: saas.identityQuality ?? "aggregate_only", conversionMode: saas.conversionMode ?? (sources.conversion ? "active_paid" : undefined), visibility: visibilityOf(saas), nextStep };
}

async function fullProject(ctx: QueryCtx | MutationCtx, saas: Doc<"saas">, username: string) {
  const integrations = (await listIntegrations(ctx, saas._id)).map(integrationView);
  const users = integrations.find((i) => i.role === "users");
  const flags = await ctx.db.query("fraudFlags").withIndex("by_saas_open", (q) => q.eq("saasId", saas._id).eq("resolvedAt", undefined)).collect();
  return {
    ...projectSummary(saas),
    urls: projectUrls(saas, username),
    integrations,
    lifecycle: await lifecycleOf(ctx, saas),
    setup: {
      hasUsersSource: Boolean(users),
      usersSourceStatus: users?.status ?? "missing",
      firstSyncDone: saas.lastSyncedAt !== undefined,
      published: saas.isPublic,
      underReview: flags.length > 0,
      nextStep: !users ? "configure_integration" : users.status === "error" ? "fix_integration" : saas.lastSyncedAt === undefined ? "wait_for_first_sync" : !saas.isPublic ? "publish" : "done",
    },
  };
}

export const project = query({
  args: { auth: authArg, ...refArg },
  handler: async (ctx, { auth, ...ref }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "projects:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: ref.projectId, slug: ref.slug });
      return fullProject(ctx, saas, profile.username);
    }),
});

export const createProjectTool = mutation({
  args: {
    auth: authArg,
    name: v.string(),
    websiteUrl: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    logoUrl: v.optional(v.string()),
    detectedStack: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { auth, detectedStack, ...input }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "projects:write");
      const existing = await findOwnedByDomain(ctx, profile._id, input.websiteUrl);
      const perHour = PLANS[planFor()].mcp.createProjectPerHour;
      const recentCreates = (await ctx.db.query("auditLogs").withIndex("by_token_time", (q) => q.eq("tokenId", token._id).gte("at", Date.now() - 3_600_000)).collect()).filter((l) => l.action === "create_project" && l.ok && l.detail?.startsWith("duplicate") !== true);
      if (!existing && recentCreates.length >= perHour) fail("rate_limited", `At most ${perHour} projects can be created per hour with one token`, { retryAfterSec: 3600 });
      if (existing) {
        await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "create_project", saasId: existing._id, ok: true, detail: "duplicate → returned existing" });
        return { created: false, duplicateOf: existing.slug, message: `A project for ${existing.websiteUrl} already exists (${existing.slug}); returning it instead of creating a duplicate.`, project: await fullProject(ctx, existing, profile.username), recommendation: recommendIntegrations({ detectedProviders: detectedStack }) };
      }
      const id = await createProject(ctx, profile._id, { ...input, description: input.description ?? "", tags: input.tags ?? [] });
      await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "create_project", saasId: id, ok: true, detail: detectedStack?.length ? `stack: ${detectedStack.join(",").slice(0, 120)}` : undefined });
      const saas = (await ctx.db.get(id))!;
      return { created: true, message: `Created ${saas.name} (${saas.slug}). Next: connect a data source.`, project: await fullProject(ctx, saas, profile.username), recommendation: recommendIntegrations({ detectedProviders: detectedStack }), warnings: input.description ? [] : ["No description was provided; add one with usertrack_update_project so the public page reads well."] };
    }),
});

export const updateProjectTool = mutation({
  args: {
    auth: authArg,
    ...refArg,
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    category: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    logoUrl: v.optional(v.string()),
    newSlug: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, { auth, projectId, slug, newSlug, ...patch }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "projects:write");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const changed = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined);
      if (newSlug) changed.push("slug");
      if (!changed.length) fail("bad_request", "Nothing to update");
      const next = await updateProject(ctx, saas, { ...patch, slug: newSlug });
      await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "update_project", saasId: saas._id, ok: true, detail: changed.join(",") });
      return { updated: changed, project: await fullProject(ctx, next as Doc<"saas">, profile.username) };
    }),
});

// ---- Integrations ---------------------------------------------------------------------------------------------------

const detectArgs = { detectedProviders: v.optional(v.array(v.string())), framework: v.optional(v.string()), projectType: v.optional(projectTypeArg), detectedAuth: v.optional(v.array(v.string())), detectedAnalytics: v.optional(v.array(v.string())), detectedPayments: v.optional(v.array(v.string())) };

export const supportedIntegrations = query({
  args: { auth: authArg, ...detectArgs },
  handler: async (ctx, { auth, ...detected }) => {
    await authenticate(ctx, auth, "mcp", "integrations:read");
    return {
      providers: INTEGRATION_CATALOG.map(({ credentials, ...c }) => ({ ...c, credentialKeys: credentials.map((x) => ({ key: x.key, secret: x.secret, optional: x.optional ?? false, roles: x.roles })) })),
      recommendation: recommendIntegrations(detected),
    };
  },
});

export const setupInstructions = query({
  args: { auth: authArg, ...refArg, provider: v.string(), role: v.optional(integrationRole), framework: v.optional(v.string()), detectedProviders: v.optional(v.array(v.string())) },
  handler: async (ctx, { auth, projectId, slug, provider, role, framework, detectedProviders }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "integrations:read");
      const saas = projectId || slug ? await requireOwnedProject(ctx, profile._id, { id: projectId, slug }) : null;
      const setup = integrationSetup({ provider, role: role ? normalizeRole(role) : undefined, framework, detectedProviders, websiteUrl: saas?.websiteUrl, projectId: saas?._id });
      if (!setup) return fail("bad_request", `Unknown provider or role: ${provider}${role ? `/${role}` : ""}`, { supported: INTEGRATION_CATALOG.map((c) => ({ provider: c.provider, roles: c.roles })) });
      return { project: saas ? { id: saas._id, slug: saas.slug, websiteUrl: saas.websiteUrl } : null, ...setup };
    }),
});

export const configureIntegration = mutation({
  args: { auth: authArg, ...refArg, provider: providerKind, role: v.optional(integrationRole), config: v.any() },
  handler: async (ctx, { auth, projectId, slug, provider, role: rawRole, config }) =>
    run(async () => {
      const role = normalizeRole(rawRole);
      const { token, profile } = await authenticate(ctx, auth, "mcp", "integrations:write");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const id = await connectIntegration(ctx, saas, role, provider, config);
      await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "configure_integration", saasId: saas._id, ok: true, detail: `${provider}/${role}` });
      const integration = integrationView((await ctx.db.get(id))!);
      return { integration, message: "Configuration stored (secrets encrypted, never returned). First sync started — call usertrack_verify_integration in ~5 seconds.", nextTool: "usertrack_verify_integration" };
    }),
});

// Server-only read of the stored config for the verify action. Never exposed to clients.
export const integrationForVerify = internalQuery({
  args: { auth: authArg, ...refArg, role: integrationRole },
  handler: async (ctx, { auth, projectId, slug, role }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "integrations:write");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const last = await ctx.db.query("auditLogs").withIndex("by_token_time", (q) => q.eq("tokenId", token._id).gte("at", Date.now() - PLANS[planFor()].mcp.verifyCooldownSec * 1000)).collect();
      const recent = last.find((l) => l.action === "verify_integration" && l.saasId === saas._id);
      if (recent) fail("rate_limited", `Verification already ran ${Math.round((Date.now() - recent.at) / 1000)}s ago; wait before retrying`, { retryAfterSec: PLANS[planFor()].mcp.verifyCooldownSec - Math.round((Date.now() - recent.at) / 1000) });
      const integration = (await listIntegrations(ctx, saas._id)).find((i) => (i.role ?? "users") === role) ?? null;
      return { tokenId: token._id, profileId: profile._id, saasId: saas._id, websiteUrl: saas.websiteUrl, totalUsers: saas.totalUsers, trust: saas.trust, lastSyncedAt: saas.lastSyncedAt, isPublic: saas.isPublic, integration };
    }),
});

// Failed writes roll back the mutation that raised them, so the MCP adapter records the failure in a separate call.
export const auditFailure = mutation({
  args: { auth: authArg, action: v.string(), detail: v.optional(v.string()), ...refArg },
  handler: async (ctx, { auth, action, detail, projectId, slug }) => {
    const { token, profile } = await authenticate(ctx, auth, "mcp");
    const saas = projectId || slug ? await requireOwnedProject(ctx, profile._id, { id: projectId, slug }).catch(() => null) : null;
    await audit(ctx, { profileId: profile._id, tokenId: token._id, action, saasId: saas?._id, ok: false, detail: detail?.slice(0, 200) });
  },
});

export const auditWrite = internalMutation({
  args: { profileId: v.id("profiles"), tokenId: v.id("developerTokens"), action: v.string(), saasId: v.optional(v.id("saas")), ok: v.boolean(), detail: v.optional(v.string()) },
  handler: async (ctx, args) => audit(ctx, args),
});

interface VerifyTarget {
  tokenId: Id<"developerTokens">;
  profileId: Id<"profiles">;
  saasId: Id<"saas">;
  websiteUrl: string;
  totalUsers: number;
  trust: Doc<"saas">["trust"];
  lastSyncedAt?: number;
  isPublic: boolean;
  integration: Doc<"integrations"> | null;
}

// Live connection test. Uses the stored config, or an inline `config` to test before saving.
export const verifyIntegration = action({
  args: { auth: authArg, ...refArg, role: v.optional(integrationRole), provider: v.optional(providerKind), config: v.optional(v.any()) },
  handler: async (ctx, { auth, projectId, slug, role: rawRole, provider, config }) => {
    const role = normalizeRole(rawRole);
    const target: VerifyTarget = await ctx.runQuery(internal.gateway.integrationForVerify, { auth, projectId, slug, role });
    const kind = provider ?? target.integration?.provider;
    if (!kind) {
      return { connected: false, status: "missing" as const, error: "No data source is configured for this project yet. Call usertrack_get_integration_setup, then usertrack_configure_integration.", nextTool: "usertrack_get_integration_setup" };
    }
    const p = getProvider(kind);
    let cfg: unknown = target.integration?.config;
    let mode: "stored" | "inline" = "stored";
    if (config !== undefined) {
      const validated = p.validate(config, role as Role);
      if (!validated.ok) return { connected: false, status: "invalid_config" as const, error: validated.error, provider: kind, role };
      cfg = validated.config;
      mode = "inline";
    }
    if (cfg === undefined) return { connected: false, status: "missing" as const, error: `No ${p.label} configuration stored; pass config to test one or configure the integration first.`, nextTool: "usertrack_configure_integration" };
    const started = Date.now();
    try {
      const metrics = await fetchMetrics(ctx, kind, cfg, role as Role);
      const trust = p.trust(cfg, target.websiteUrl);
      const capabilities = describeProvider(p, cfg, role as Role);
      const detected = detectedCount(metrics, role);
      delete metrics.identities;
      await ctx.runMutation(internal.gateway.auditWrite, { profileId: target.profileId, tokenId: target.tokenId, action: "verify_integration", saasId: target.saasId, ok: true, detail: `${kind}/${role} ${mode}: ${detected ?? "?"}` });
      return {
        connected: true,
        status: "connected" as const,
        provider: kind,
        role,
        mode,
        detected: { count: detected, metrics },
        verificationLevel: trust,
        verificationLabel: trust === "verified" ? "Verified" : trust === "unverified" ? "Self-reported (not ranked)" : "Pending",
        sourceVerification: verificationLevel(kind, trust, capabilities, role as Role),
        capabilities,
        durationMs: Date.now() - started,
        stored: target.integration ? { status: target.integration.status, lastSuccessAt: target.integration.lastSuccessAt, lastError: target.integration.lastError } : null,
        project: { firstSyncDone: target.lastSyncedAt !== undefined, totalUsers: target.totalUsers, published: target.isPublic },
        nextTool: mode === "inline" ? "usertrack_configure_integration" : target.lastSyncedAt === undefined ? "usertrack_sync_project" : target.isPublic ? "usertrack_get_share_url" : "usertrack_update_project",
        hint: trust === "unverified" && kind === "endpoint" ? "The endpoint is not on the product's domain, so it counts as self-reported. Host it on the same domain to get verified and ranked." : undefined,
      };
    } catch (e) {
      const err = e as Error;
      const retryable = err instanceof ProviderError ? err.retryable : true;
      await ctx.runMutation(internal.gateway.auditWrite, { profileId: target.profileId, tokenId: target.tokenId, action: "verify_integration", saasId: target.saasId, ok: false, detail: `${kind}/${role}: ${err.message.slice(0, 160)}` });
      return { connected: false, status: "failed" as const, provider: kind, role, mode, error: err.message, retryable, missingRequirements: retryable ? [] : ["Check the credential value and permissions listed by usertrack_get_integration_setup"], nextTool: retryable ? "usertrack_verify_integration" : "usertrack_configure_integration" };
    }
  },
});

export const syncProject = mutation({
  args: { auth: authArg, ...refArg, role: v.optional(integrationRole) },
  handler: async (ctx, { auth, projectId, slug, role }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "integrations:write");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const ids = await requestSync(ctx, saas._id, role ? normalizeRole(role) : undefined);
      await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "sync_project", saasId: saas._id, ok: true, detail: role ?? "all" });
      return { started: ids.length, message: "Sync scheduled. Results land within seconds; call usertrack_get_project to see the updated numbers.", nextTool: "usertrack_get_project" };
    }),
});

// ---- Metrics ----------------------------------------------------------------------------------------------------------

export const metrics = query({
  args: { auth: authArg, ...refArg, timeframe: v.optional(timeframeArg) },
  handler: async (ctx, { auth, projectId, slug, timeframe }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const recent = await milestonesFor(ctx, saas._id, 3);
      return { project: { id: saas._id, slug: saas.slug, name: saas.name, url: projectUrls(saas).page }, ...metricsSummary(saas, timeframe ?? "7d"), recentMilestones: recent };
    }),
});

export const history = query({
  args: { auth: authArg, ...refArg, range: v.optional(rangeArg) },
  handler: async (ctx, { auth, projectId, slug, range }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const points = await seriesFor(ctx, saas, range ?? "30d", true);
      return { project: { id: saas._id, slug: saas.slug, name: saas.name }, range: range ?? "30d", points: points.map((p) => ({ t: new Date(p.t).toISOString(), totalUsers: p.total, newUsers: p.delta, activatedUsers: p.activated, visitors: p.visitors })) };
    }),
});

export const rank = query({
  args: { auth: authArg, ...refArg },
  handler: async (ctx, { auth, projectId, slug }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const m = metricsSummary(saas);
      const eligible = saas.isPublic && saas.trust === "verified" && !saas.isDemo && saas.trustState !== "review";
      return {
        project: { id: saas._id, slug: saas.slug, name: saas.name },
        eligible,
        reason: eligible ? undefined : !saas.isPublic ? "Project is not published" : saas.trust !== "verified" ? `Source is ${saas.trust}; only verified sources are ranked` : saas.trustState === "review" ? "Data is under review" : "Demo project",
        ...m.ranks,
        boards: { leaderboard: `${projectUrls(saas).page.replace(/\/s\/.*$/, "")}/leaderboard`, trending: `${projectUrls(saas).page.replace(/\/s\/.*$/, "")}/trending` },
        trendingScore7d: saas.trendingScore7d,
      };
    }),
});

export const milestones = query({
  args: { auth: authArg, ...refArg, limit: v.optional(v.number()) },
  handler: async (ctx, { auth, projectId, slug, limit }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const list = await milestonesFor(ctx, saas._id, Math.min(limit ?? 20, 50));
      const base = projectUrls(saas).page;
      return { project: { id: saas._id, slug: saas.slug, name: saas.name }, milestones: list.map((m) => ({ ...m, sharePage: `${base}/share/milestone-${m.id}`, shareImage: `${base}/share/milestone-${m.id}/card` })) };
    }),
});

export const shareUrls = query({
  args: { auth: authArg, ...refArg },
  handler: async (ctx, { auth, projectId, slug }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const list = await milestonesFor(ctx, saas._id, 5);
      return { project: { id: saas._id, slug: saas.slug, name: saas.name, isPublic: saas.isPublic }, ...shareData(saas, profile.username, list), note: saas.isPublic ? undefined : "The project is not published yet; public URLs will 404 until usertrack_update_project sets isPublic: true." };
    }),
});

// ---- v0.4: provider recommendation, activation setup, funnel, trending, benchmarks, compare, share, embed ----------------

const ACTIVATION_EXAMPLES = ["onboarding_completed", "project_created", "first_document_created", "first_workflow_run", "first_message_sent", "first_generation_completed"];

// "Which UserTrack path fits this repo?" — pure catalog logic over the detected stack, safe to call before a project exists.
export const providerRecommendation = query({
  args: { auth: authArg, ...detectArgs },
  handler: async (ctx, { auth, ...detected }) => {
    await authenticate(ctx, auth, "mcp", "integrations:read");
    const rec = recommendIntegrations(detected);
    return {
      ...rec,
      priority: ["supabase", "clerk", "firebase", "postgres", "endpoint"],
      conversionPriority: ["revenuecat", "stripe", "paddle", "lemonsqueezy", "chargebee", "endpoint"],
      signals: { supabase: ["@supabase/supabase-js", "SUPABASE_URL", "SUPABASE_DB_URL"], clerk: ["@clerk/nextjs", "CLERK_SECRET_KEY"], firebase: ["firebase-admin", "@react-native-firebase/auth", "firebase_auth", "GOOGLE_APPLICATION_CREDENTIALS"], postgres: ["DATABASE_URL", "pg", "prisma:postgresql", "drizzle-pg"], posthog: ["posthog-js", "posthog-react-native", "posthog-ios", "posthog-flutter"], revenuecat: ["react-native-purchases", "purchases_flutter", "RevenueCat"], stripe: ["stripe", "STRIPE_SECRET_KEY"] },
      nextTool: rec.composition.conversion ? "usertrack_get_integration_setup (then usertrack_get_conversion_setup)" : "usertrack_get_integration_setup",
    };
  },
});

// Activation = the first meaningful value in the product. Recommends where the event can come from given the detected stack.
export const activationSetup = query({
  args: { auth: authArg, ...refArg, detectedProviders: v.optional(v.array(v.string())), candidateEvents: v.optional(v.array(v.string())) },
  handler: async (ctx, { auth, projectId, slug, detectedProviders, candidateEvents }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "integrations:read");
      const saas = projectId || slug ? await requireOwnedProject(ctx, profile._id, { id: projectId, slug }) : null;
      const integrations = saas ? (await listIntegrations(ctx, saas._id)).map(integrationView) : [];
      const users = integrations.find((i) => i.role === "users");
      const existing = integrations.find((i) => i.role === "activation");
      const rec = recommendIntegrations({ detectedProviders });
      const kinds = new Set(rec.detected.map((d) => d.provider));
      const options: { provider: string; role: "activation"; why: string; configShape: Record<string, string> }[] = [];
      if (kinds.has("posthog")) options.push({ provider: "posthog", role: "activation", why: "PostHog is already in the product: count distinct persons who fired the activation event.", configShape: { host: "string", projectId: "string", apiKey: "secret string (query:read)", activationEvent: "string" } });
      if (users?.provider === "supabase" || kinds.has("supabase")) options.push({ provider: "supabase", role: "activation", why: "Same read-only Supabase connection: a table with one row per activated user, or one SELECT count(...) WHERE created_at >= $1.", configShape: { connectionString: "secret string", table: "string (optional)", createdAtColumn: "string (optional)", sql: "string (optional)" } });
      if (users?.provider === "postgres" || kinds.has("postgres")) options.push({ provider: "postgres", role: "activation", why: "Same read-only Postgres connection: activation table + timestamp column, or a custom aggregate SELECT with $1 = since.", configShape: { connectionString: "secret string", tableRef: "schema.table (optional)", createdAtColumn: "string (optional)", sql: "string (optional)" } });
      options.push({ provider: "endpoint", role: "activation", why: "Universal: your own route on the product domain returning { activatedUsers, activated24h, activated7d, activated30d }.", configShape: { url: "string", token: "secret string (optional)" } });
      const ranking = rankActivationEvents(candidateEvents, options[0].provider);
      return {
        definition: "An activated user is someone who reached the first meaningful value in your product — not just an account.",
        examples: ACTIVATION_EXAMPLES,
        ...ranking,
        candidateEvents: (candidateEvents ?? []).map((e) => ({ event: e, looksLikeActivation: e === ranking.recommendedEvent || ranking.alternatives.some((a) => a.event === e && a.looksLikeActivation) })),
        project: saas ? { id: saas._id, slug: saas.slug, usersSource: users?.provider ?? null, activationSource: existing ? { provider: existing.provider, status: existing.status } : null } : null,
        recommended: options[0],
        options,
        steps: ["Pick the event/table/query that only fires once a user has done the core action.", "Call usertrack_get_integration_setup with role: \"activation\" for the chosen provider.", "usertrack_configure_integration with role: \"activation\".", "usertrack_verify_integration with role: \"activation\" — the count must be ≤ total users."],
        optional: true,
        nextTool: "usertrack_get_integration_setup",
      };
    }),
});

export const funnel = query({
  args: { auth: authArg, ...refArg, timeframe: v.optional(v.union(...FUNNEL_TIMEFRAMES.map((t) => v.literal(t)))) },
  handler: async (ctx, { auth, projectId, slug, timeframe }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const f = await funnelFor(ctx, saas, timeframe ?? "30d", OWNER_FUNNEL);
      const missing = STAGE_ORDER.filter((k) => !f.stages.some((s) => s.key === k));
      const hint = missing.includes("activated") ? "Connect an activation source (usertrack_get_activation_setup) to see Signup → Activated." : missing.includes("converted") ? "Connect a conversion source (usertrack_get_conversion_setup) to see Signup → Converted. Payment providers are read for conversion state only, never revenue." : undefined;
      return { project: { id: saas._id, slug: saas.slug, name: saas.name }, ...f, missingStages: missing, hint, visibility: visibilityOf(saas), publicUrl: `${projectUrls(saas).page}#funnel` };
    }),
});

// Strategic rates per day (trailing 7-day ratios) for the owner: all connected stages, private ones included.
export const funnelHistory = query({
  args: { auth: authArg, ...refArg, days: v.optional(v.number()) },
  handler: async (ctx, { auth, projectId, slug, days }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const d = Math.min(365, Math.max(14, days ?? 90));
      return { project: { id: saas._id, slug: saas.slug, name: saas.name }, days: d, points: await funnelHistoryFor(ctx, saas, d, OWNER_FUNNEL) };
    }),
});

// Owner cohorts: same view as api.cohorts.mine (counts always included, conversion + trial included).
export const cohorts = query({
  args: { auth: authArg, ...refArg },
  handler: async (ctx, { auth, projectId, slug }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const rows = await ctx.db.query("cohortMetrics").withIndex("by_saas_cohort", (q) => q.eq("saasId", saas._id)).collect();
      const view = cohortView(rows, saas.identityQuality ?? "aggregate_only", { includeConversion: true, includeTrial: true, hideCounts: false });
      return { project: { id: saas._id, slug: saas.slug, name: saas.name }, ...view, coveragePct: saas.identityCoveragePct, hint: view.cohorts.length ? undefined : "No cohorts yet: sources must report identities (see usertrack_get_identity_mapping); cohorts rebuild daily." };
    }),
});

// Conversion source plan for the detected payment provider (or the one asked for). Safe to call before a project exists.
export const conversionSetup = query({
  args: { auth: authArg, ...refArg, provider: v.optional(v.string()), detectedProviders: v.optional(v.array(v.string())), projectType: v.optional(projectTypeArg) },
  handler: async (ctx, { auth, projectId, slug, provider, detectedProviders, projectType }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "integrations:read");
      const saas = projectId || slug ? await requireOwnedProject(ctx, profile._id, { id: projectId, slug }) : null;
      const plan = conversionPlan({ provider, detectedProviders, projectType: projectType ?? saas?.projectType, projectId: saas?._id });
      if (!plan) return fail("bad_request", `${provider} cannot provide conversion`, { supported: ["stripe", "revenuecat", "paddle", "lemonsqueezy", "chargebee", "endpoint"] });
      const existing = saas ? (await listIntegrations(ctx, saas._id)).map(integrationView).find((i) => i.role === "conversion") : undefined;
      return {
        project: saas ? { id: saas._id, slug: saas.slug, projectType: saas.projectType ?? "web", conversionSource: existing ? { provider: existing.provider, status: existing.status } : null, visibility: visibilityOf(saas) } : null,
        definition: "Converted = a unique user who reached the configured monetization condition. UserTrack never needs your revenue numbers. Payment providers are used only to calculate user conversion metrics.",
        ...plan,
        optional: true,
      };
    }),
});

// How to carry one stable id across the identity, analytics and conversion sources; sources default to the project's integrations.
export const identityMapping = query({
  args: { auth: authArg, ...refArg, identitySource: v.optional(v.string()), analyticsSource: v.optional(v.string()), conversionSource: v.optional(v.string()), projectType: v.optional(projectTypeArg) },
  handler: async (ctx, { auth, projectId, slug, identitySource, analyticsSource, conversionSource, projectType }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "integrations:read");
      const saas = projectId || slug ? await requireOwnedProject(ctx, profile._id, { id: projectId, slug }) : null;
      const integrations = saas ? (await listIntegrations(ctx, saas._id)).map(integrationView) : [];
      const by = (role: Role) => integrations.find((i) => i.role === role)?.provider;
      const identity = identitySource ?? by("users");
      if (!identity) return fail("bad_request", "Pass identitySource (e.g. firebase, supabase, clerk, auth0, postgres, endpoint) or a project with a users source");
      return {
        project: saas ? { id: saas._id, slug: saas.slug, identityQuality: saas.identityQuality ?? "aggregate_only", identityCoveragePct: saas.identityCoveragePct } : null,
        ...identityMappingGuidance({ identitySource: identity, analyticsSource: analyticsSource ?? by("activation"), conversionSource: conversionSource ?? by("conversion"), projectType: projectType ?? saas?.projectType }),
      };
    }),
});

const trendingWindowArg = v.union(v.literal("24h"), v.literal("7d"), v.literal("30d"));

// Public trending board (+ the caller's own position and factors when a project is given).
export const trending = query({
  args: { auth: authArg, ...refArg, window: v.optional(trendingWindowArg), category: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { auth, projectId, slug, window = "7d", category, limit }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const all = await ctx.db.query("saas").withIndex("by_public_new30d", (q) => q.eq("isPublic", true)).collect();
      const rows = sortBoard(all, { board: "trending", window, verifiedOnly: true, category, limit: Math.min(limit ?? 20, 50) });
      const own = projectId || slug ? await requireOwnedProject(ctx, profile._id, { id: projectId, slug }) : null;
      const item = (s: Doc<"saas">) => {
        const r = trendingRankFor(s, window);
        const p = publicSaas(s);
        return { slug: p.slug, name: p.name, category: p.category, totalUsers: p.totalUsers, newUsers: window === "24h" ? p.newUsers24h : window === "7d" ? p.newUsers7d : p.newUsers30d, score: window === "24h" ? p.trendingScore24h : window === "7d" ? p.trendingScore7d : p.trendingScore30d, rank: r.rank, previousRank: r.prev, explain: explainTrending(trendingInputs(s)[window]), url: projectUrls(s).page };
      };
      return {
        window,
        category,
        formula: "100 · log10(1+new)^1.5 · (1+min(new/max(base,50),2)) · (1+0.5·clamp((new−prev)/max(prev,10),−0.5,2)) · (0.5+0.5·trust/100) · (1+0.25·activation) · freshness · history · conversion, where conversion = 1 + 0.10 · clamp(signupToConvertedPct, 0, 25)/25 (optional, small)",
        rows: rows.map(item),
        own: own ? { ...item(own), eligible: own.isPublic && own.trust === "verified" && !own.isDemo && own.trustState !== "review", factors: trendingFactors(trendingInputs(own)[window]) } : undefined,
        boardUrl: `${siteUrlOf()}/trending?window=${window}${category ? `&category=${category}` : ""}`,
      };
    }),
});

const siteUrlOf = () => projectUrls({ slug: "" }).page.replace(/\/s\/$/, "");

export const benchmark = query({
  args: { auth: authArg, ...refArg },
  handler: async (ctx, { auth, projectId, slug }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const bucket = SIZE_BUCKETS.find((b) => b.key === sizeBucket(saas.totalUsers));
      const cohorts = [
        { key: "all", label: "all SaaS on UserTrack" },
        ...(saas.category ? [{ key: `cat:${saas.category}`, label: `${CATEGORIES.find((c) => c.slug === saas.category)?.label ?? saas.category} SaaS` }] : []),
        { key: `size:${sizeBucket(saas.totalUsers)}`, label: `products with ${bucket?.label ?? "similar"} users` },
      ];
      const cards = [];
      for (const c of cohorts) {
        for (const metric of BENCHMARK_METRICS) {
          const value = saas[metric];
          if (value === undefined) continue;
          const agg = await ctx.db.query("benchmarkAggregates").withIndex("by_group_metric", (q) => q.eq("groupKey", c.key).eq("metric", metric)).unique();
          if (!agg) continue;
          const percentile = percentileOf(value, agg.deciles);
          if (percentile === null) continue;
          cards.push({ cohort: c.label, metric, metricLabel: BENCHMARK_METRIC_LABEL[metric], value, percentile, median: agg.deciles[4], p10: agg.deciles[0], p90: agg.deciles[8], medianMultiple: medianMultiple(value, agg.deciles[4]), sampleSize: agg.sampleSize, insight: benchmarkInsight({ metricLabel: BENCHMARK_METRIC_LABEL[metric], groupLabel: c.label, percentile, value, median: agg.deciles[4] }) });
        }
      }
      const eligible = saas.isPublic && saas.trust === "verified" && !saas.isDemo;
      return { project: { id: saas._id, slug: saas.slug, name: saas.name }, eligible, minCohortSize: MIN_SAMPLE, cards, note: !eligible ? "Benchmarks compare public, verified products; publish with a verified source first." : cards.length === 0 ? "Not enough benchmark data yet — cohorts need at least " + MIN_SAMPLE + " verified products and refresh daily." : undefined, hiddenGemRules: HIDDEN_GEM_RULES };
    }),
});

const compareDaysArg = v.union(v.literal(7), v.literal(30), v.literal(90), v.literal(365), v.literal(0));

// Compare any public products (not only the caller's). Read-only public data, same as /compare.
export const compareProjects = query({
  args: { auth: authArg, slugs: v.array(v.string()), days: v.optional(compareDaysArg) },
  handler: async (ctx, { auth, slugs, days = 30 }) =>
    run(async () => {
      await authenticate(ctx, auth, "mcp", "metrics:read");
      const unique = [...new Set(slugs)].slice(0, 4);
      if (unique.length < 2) fail("bad_request", "Pass 2 to 4 slugs");
      const since = days === 0 ? "0000-00-00" : dayKey(Date.now() - days * DAY);
      const products = [];
      for (const slug of unique) {
        const s = await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
        if (!s || !s.isPublic) continue;
        const rows = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", s._id).gte("day", since)).collect();
        const base = rows.find((r) => r.totalUsers > 0)?.totalUsers ?? 0;
        const last = rows[rows.length - 1];
        const p = publicSaas(s);
        products.push({
          slug: p.slug, name: p.name, category: p.category, totalUsers: p.totalUsers, newUsers7d: p.newUsers7d, newUsers30d: p.newUsers30d, growth30dPct: p.growth30dPct, activationRatePct: p.activationRatePct, trendingScore7d: p.trendingScore7d, trendingRank: p.trendingRank, rank: p.rank, verification: p.trust,
          windowGrowthPct: base > 0 && last ? Math.round(((last.totalUsers - base) / base) * 1000) / 10 : undefined,
          indexEnd: base > 0 && last ? Math.round((last.totalUsers / base) * 1000) / 10 : undefined,
          series: rows.map((r) => ({ day: r.day, totalUsers: r.totalUsers, newUsers: r.newUsers, index: base > 0 ? Math.round((r.totalUsers / base) * 1000) / 10 : undefined })),
          url: projectUrls(s).page,
        });
      }
      if (products.length < 2) fail("not_found", "Fewer than two of the requested products are public");
      return { days: days === 0 ? "all" : days, products, url: `${siteUrlOf()}/compare?s=${products.map((p) => p.slug).join(",")}&days=${days === 0 ? "all" : days}` };
    }),
});

export const shareCard = query({
  args: { auth: authArg, ...refArg, kind: v.optional(v.string()) },
  handler: async (ctx, { auth, projectId, slug, kind }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const base = projectUrls(saas).page;
      const kinds = ["users", "growth", "week", ...(saas.rank ? ["rank"] : []), ...(saas.trendingRank ? ["trending"] : []), ...(saas.activationRatePct !== undefined ? ["activation"] : [])];
      const milestones = await milestonesFor(ctx, saas._id, 5);
      const card = (k: string) => ({ kind: k, page: `${base}/share/${k}`, image: `${base}/share/${k}/card`, square: `${base}/share/${k}/card?size=square`, xIntent: `https://x.com/intent/post?url=${encodeURIComponent(`${base}/share/${k}`)}` });
      if (kind && !kinds.includes(kind) && !kind.startsWith("milestone-") && !kind.startsWith("spike-")) fail("bad_request", `kind must be one of ${kinds.join(", ")} or milestone-<id>`);
      return { project: { id: saas._id, slug: saas.slug, name: saas.name, isPublic: saas.isPublic }, card: kind ? card(kind) : card("users"), available: kinds.map(card), milestones: milestones.map((m) => ({ ...card(`milestone-${m.id}`), title: m.title })), note: saas.isPublic ? undefined : "Publish the project first; share images 404 for drafts." };
    }),
});

export const embedCode = query({
  args: { auth: authArg, ...refArg, type: v.optional(v.string()), theme: v.optional(v.string()), window: v.optional(v.string()), compact: v.optional(v.boolean()) },
  handler: async (ctx, { auth, projectId, slug, type = "users", theme = "dark", window = "30d", compact }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const types = ["users", "growth", "trending", "verified", "chart"];
      if (!types.includes(type)) fail("bad_request", `type must be one of ${types.join(", ")}`);
      const urls = projectUrls(saas);
      const qs = new URLSearchParams({ type, ...(theme === "light" ? { theme: "light" } : {}), ...(window === "7d" ? { window: "7d" } : {}), ...(compact ? { compact: "1" } : {}) });
      const src = `${urls.badge}?${qs}`;
      const height = type === "chart" ? (compact ? 96 : 120) : 28;
      return {
        project: { id: saas._id, slug: saas.slug, name: saas.name, isPublic: saas.isPublic },
        type, theme, window, compact: Boolean(compact),
        imageUrl: src,
        html: `<a href="${urls.page}"><img src="${src}" alt="${saas.name} on UserTrack" height="${height}"></a>`,
        markdown: `[![${saas.name} on UserTrack](${src})](${urls.page})`,
        types, cache: "Rendered on request, cached 1h at the edge; only public metrics; no key needed.",
        note: saas.isPublic ? undefined : "Drafts render a 'not found' badge until published.",
      };
    }),
});
