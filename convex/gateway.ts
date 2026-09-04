// Token-authenticated entry points used by the public API and the MCP server (called from Next.js with a token hash).
// Every function re-validates the credential, enforces scopes and strict ownership, then delegates to the domain layer.
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { authComponent } from "./auth";
import { hasScope, isActive, PLANS, planFor, type TokenType } from "./lib/tokens";
import { requireGateway } from "./lib/gateway";
import { RANGES, dayKey, dayStart, DAY } from "./lib/time";
import { integrationRole, providerKind, tokenType } from "./schema";
import { describeProvider, getProvider, normalizeRole, ProviderError, verificationLevel, type Role } from "./providers";
import { detectedCount } from "./integrations";
import { visibilityOf } from "./domain/visibility";
import { fetchMetrics } from "./providerRun";
import { DomainError, createProject, findOwnedByDomain, listOwnedProjects, projectSummary, projectUrls, requireOwnedProject, siteUrl, updateProject } from "./domain/projects";
import { connectIntegration, integrationView, listIntegrations, requestSync } from "./domain/integrations";
import { TIMEFRAMES, metricsSummary, milestonesFor, seriesFor, shareData } from "./domain/metrics";
import { INTEGRATION_CATALOG, conversionSetup as conversionPlan, identityMappingGuidance, integrationSetup, rankActivationEvents, recommendIntegrations } from "./lib/integrationSetup";
import { ENV_PROJECT_ID, ENV_SECRET, envSnippet, NATIVE_PACKAGE, nativeSetup } from "./lib/nativeSetup";
import { createNativeIntegration, nativeSourceArg } from "./native";
import { metricsUrl } from "./providers/native";
import { normalizeSource, type NativeSource } from "./lib/nativeProtocol";
import { boardRows, founderRows, lastSyncedAt, publicProfile, publicSaas, trendingRankFor, feedItems, HIDDEN_GEM_RULES, NEW_RISING_RULES, PLATFORMS, type Board } from "./public";
import { followTarget, unfollowTarget, watchlistFeed } from "./follows";
import { createEndpoint, deleteEndpoint, listEndpoints, recentDeliveries, rotateEndpointSecret, sendTestEvent, updateEndpoint } from "./webhooks";
import { MAX_ENDPOINTS, WEBHOOK_EVENTS } from "./lib/webhooks";
import { rankMovement } from "./lib/history";
import { DATASETS, DATASET_NAMES, datasetRow, type DatasetName } from "../src/lib/api/datasets";
import { canonicalX } from "./profiles";
import { buildExport } from "./account";
import { founderAggregates } from "./lib/founder";
import { normalizePrefs } from "./lib/shareRules";
import { xConnectionState, xIntentUrl } from "../src/lib/social";
import { xDraft, type DraftKind } from "../src/lib/x-drafts";
import { CARD_RANGES, CARD_STYLES, cardQuery, type CardConfig } from "../src/lib/share-card";
import { shareStatus } from "./schema";
import { FUNNEL_TIMEFRAMES, OWNER_FUNNEL, STAGE_ORDER, funnelFor, funnelHistoryFor, funnelSources } from "./domain/funnel";
import { cohortView } from "./cohorts";
import { cofounder, funding, projectType as projectTypeArg, teamSize } from "./schema";
import { MIN_SAMPLE } from "./lib/benchmarks";
import { benchmarkCards, benchmarkHistoryFor, isBenchmarkEligible } from "./domain/benchmarks";
import { TrustmrrError, prefillPatch, type TrustmrrImport } from "./lib/trustmrr";
import { importForProfile } from "./trustmrr";
import { explainTrending, trendingFactors } from "./lib/trending";
import { trendingInputs } from "./leaderboard";
import { CATEGORIES } from "../src/lib/categories";
import { WIDGET_TYPES, parseWidgetParams, widgetSnippets } from "../src/lib/embed";

export const authArg = v.object({ hash: v.string(), gateway: v.optional(v.string()) });
type Auth = { hash: string; gateway?: string };
const refArg = { projectId: v.optional(v.string()), slug: v.optional(v.string()) };
const rangeArg = v.union(...RANGES.map((r) => v.literal(r)));
const timeframeArg = v.union(...TIMEFRAMES.map((t) => v.literal(t)));

export type GatewayErrorCode = "unauthorized" | "revoked" | "expired" | "forbidden" | "rate_limited" | "not_found" | "bad_request" | "conflict" | "not_configured" | "upstream";
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
  requireGateway(auth.gateway);
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

// ---- Import from TrustMRR (IMPORT-1) -------------------------------------------------------------------------------

export const projectForImport = internalQuery({
  args: { auth: authArg, ...refArg },
  handler: async (ctx, { auth, projectId, slug }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "projects:write");
      const saas = projectId || slug ? await requireOwnedProject(ctx, profile._id, { id: projectId, slug }) : null;
      return { tokenId: token._id, profileId: profile._id, saasId: saas?._id ?? null };
    }),
});

// Same domain update path as usertrack_update_project; fills the empty fields (or everything with overwrite) and links the slug.
export const applyTrustmrrPrefill = internalMutation({
  args: { tokenId: v.id("developerTokens"), profileId: v.id("profiles"), saasId: v.id("saas"), prefill: v.any(), trustmrrSlug: v.string(), overwrite: v.boolean() },
  handler: async (ctx, { tokenId, profileId, saasId, prefill, trustmrrSlug, overwrite }) =>
    run(async () => {
      const saas = await ctx.db.get(saasId);
      if (!saas || saas.ownerId !== profileId) return fail("not_found", "Project not found");
      const patch = { ...prefillPatch(saas, prefill as TrustmrrImport["prefill"], overwrite), trustmrrSlug };
      const next = await updateProject(ctx, saas, patch);
      const applied = Object.keys(patch);
      await audit(ctx, { profileId, tokenId, action: "import_from_trustmrr", saasId, ok: true, detail: applied.join(",") });
      return { applied, project: projectSummary(next as Doc<"saas">) };
    }),
});

type ImportTarget = { tokenId: Id<"developerTokens">; profileId: Id<"profiles">; saasId: Id<"saas"> | null };
type ImportApplied = { applied: string[]; project: ReturnType<typeof projectSummary> } | null;

export const importFromTrustmrr = action({
  args: { auth: authArg, ...refArg, urlOrSlug: v.string(), apply: v.optional(v.boolean()), overwrite: v.optional(v.boolean()) },
  handler: async (ctx, { auth, projectId, slug, urlOrSlug, apply, overwrite }): Promise<TrustmrrImport & { applied: ImportApplied }> => {
    const target: ImportTarget = await ctx.runQuery(internal.gateway.projectForImport, { auth, projectId, slug });
    if (apply && !target.saasId) fail("bad_request", "Pass projectId or slug to apply the prefill");
    let result: TrustmrrImport;
    try {
      result = await importForProfile(ctx, target.profileId, urlOrSlug);
    } catch (e) {
      if (e instanceof TrustmrrError) return fail(e.code, e.message, e.retryAfterSec ? { retryAfterSec: e.retryAfterSec } : {});
      throw e;
    }
    const applied: ImportApplied = apply && target.saasId
      ? await ctx.runMutation(internal.gateway.applyTrustmrrPrefill, { tokenId: target.tokenId, profileId: target.profileId, saasId: target.saasId, prefill: result.prefill, trustmrrSlug: result.source.slug, overwrite: overwrite ?? false })
      : null;
    return { ...result, applied };
  },
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
    foundedAt: v.optional(v.number()),
    markets: v.optional(v.array(v.string())),
    techStack: v.optional(v.array(v.string())),
    marketingChannels: v.optional(v.array(v.string())),
    cofounders: v.optional(v.array(cofounder)),
    country: v.optional(v.string()),
    funding: v.optional(funding),
    teamSize: v.optional(teamSize),
    valueProposition: v.optional(v.string()),
    problemSolved: v.optional(v.string()),
    audience: v.optional(v.string()),
    pricingSummary: v.optional(v.string()),
    additionalInfo: v.optional(v.string()),
    anonymous: v.optional(v.boolean()),
    hideFromSearch: v.optional(v.boolean()),
  },
  handler: async (ctx, { auth, projectId, slug, newSlug, ...patch }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "projects:write");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const changed = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined);
      if (newSlug) changed.push("slug");
      if (!changed.length) fail("bad_request", "Nothing to update");
      const publisher = patch.isPublic ? await authComponent.getAnyUserById(ctx, profile.userId) : undefined;
      const next = await updateProject(ctx, saas, { ...patch, slug: newSlug }, publisher);
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
      return { integration, message: "Configuration stored (secrets kept server-side, never returned). First sync started — call usertrack_verify_integration in ~5 seconds.", nextTool: "usertrack_verify_integration" };
    }),
});

// Native SDK integrations: UserTrack generates the credential. The secret is returned exactly once (creation / rotation).
// `provider: "better_auth"` is the v0.6 alias of `{ provider: "native", source: "better-auth" }`.
export const createIntegrationTool = mutation({
  args: { auth: authArg, ...refArg, provider: v.union(v.literal("native"), v.literal("better_auth")), source: v.optional(nativeSourceArg), url: v.optional(v.string()), rotate: v.optional(v.boolean()) },
  handler: async (ctx, { auth, projectId, slug, provider, source: rawSource, url, rotate }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "integrations:write");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const source = normalizeSource(rawSource ?? (provider === "better_auth" ? "better-auth" : "custom"));
      const c = await createNativeIntegration(ctx, saas, { url, source, rotate });
      await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "create_integration", saasId: saas._id, ok: true, detail: `native/${source}/users ${c.created ? "created" : c.rotated ? "rotated" : "existing"} ${c.secretPrefix}…` });
      const integration = integrationView((await ctx.db.get(c.integrationId))!);
      const pkg = NATIVE_PACKAGE[source];
      const base = { provider: "native" as const, source, package: pkg, created: c.created, rotated: c.rotated, projectId: c.projectId, url: c.url, metricsUrl: metricsUrl(c.url, source), integration, secretPrefix: c.secretPrefix, environmentVariables: [ENV_PROJECT_ID, ENV_SECRET] };
      if (!c.secret) return { ...base, secret: null, message: `A native integration already exists (secret ${c.secretPrefix}…). The secret is never returned again; if the app does not have it, call usertrack_create_integration with rotate: true and update ${ENV_SECRET} everywhere.`, nextTool: integration.awaitingVerification ? "usertrack_verify_integration" : "usertrack_sync_project" };
      return { ...base, secret: c.secret, env: envSnippet(c.projectId, c.secret), message: `${c.rotated ? "Secret rotated" : "Integration created"}. Set ${ENV_PROJECT_ID}=${c.projectId} and ${ENV_SECRET}=<secret> in the app's environment (never commit the secret; it is shown only now), install ${pkg}, deploy, then call usertrack_verify_integration.`, nextTool: "usertrack_get_native_setup" };
    }),
});

// Structured install plan for a native source (Better Auth plugin or @usertrack/node adapter). Never contains the secret.
export const nativeSetupPlan = query({
  args: { auth: authArg, ...refArg, source: v.optional(nativeSourceArg), packageManager: v.optional(v.string()), betterAuthVersion: v.optional(v.string()), framework: v.optional(v.string()), authConfigPath: v.optional(v.string()) },
  handler: async (ctx, { auth, projectId, slug, source, ...input }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "integrations:read");
      const saas = projectId || slug ? await requireOwnedProject(ctx, profile._id, { id: projectId, slug }) : null;
      const users = saas ? (await listIntegrations(ctx, saas._id)).find((i) => normalizeRole(i.role) === "users") : null;
      const view = users ? integrationView(users) : null;
      const cfg = view?.provider === "native" ? (users!.config as { url: string; source?: NativeSource }) : null;
      const resolved = normalizeSource(source ?? cfg?.source ?? "better-auth");
      return {
        project: saas ? { id: saas._id, slug: saas.slug, websiteUrl: saas.websiteUrl } : null,
        integration: view,
        ...nativeSetup({ ...input, source: resolved, projectId: saas?._id, projectSlug: saas?.slug, metricsUrl: cfg ? metricsUrl(cfg.url, resolved) : undefined, integrationExists: view?.provider === "native", awaitingVerification: users?.awaitingVerification ?? false }),
      };
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
      if (mode === "stored" && target.integration) await ctx.runMutation(internal.integrations.markVerified, { integrationId: target.integration._id });
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
      const native = kind === "native" || kind === "better_auth";
      return { connected: false, status: "failed" as const, provider: kind, role, mode, error: err.message, retryable, missingRequirements: retryable ? [] : [native ? "Confirm the UserTrack SDK (@usertrack/node handler or @usertrack/better-auth plugin) is installed and mounted, USERTRACK_PROJECT_ID / USERTRACK_SECRET are set in the deployed environment and the deploy is live (usertrack_get_native_setup)" : "Check the credential value and permissions listed by usertrack_get_integration_setup"], nextTool: retryable ? "usertrack_verify_integration" : native ? "usertrack_get_native_setup" : "usertrack_configure_integration" };
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
      priority: ["native", "supabase", "clerk", "firebase", "auth0", "postgres", "endpoint"],
      nativeSources: { packages: NATIVE_PACKAGE, setupTool: "usertrack_get_native_setup", createTool: "usertrack_create_integration", note: "native = the app itself answers signed aggregate requests (verified, no credentials shared): Better Auth plugin, or @usertrack/node with a Prisma / Drizzle / Convex / Auth.js / custom count source. Better Auth, Auth.js and Convex rank first; Prisma / Drizzle rank after hosted auth providers." },
      conversionPriority: ["revenuecat", "stripe", "paddle", "lemonsqueezy", "chargebee", "endpoint"],
      signals: { native: ["better-auth", "@better-auth/core", "BETTER_AUTH_SECRET", "next-auth", "@auth/core", "convex", "@prisma/client", "drizzle-orm"], supabase: ["@supabase/supabase-js", "SUPABASE_URL", "SUPABASE_DB_URL"], clerk: ["@clerk/nextjs", "CLERK_SECRET_KEY"], firebase: ["firebase-admin", "@react-native-firebase/auth", "firebase_auth", "GOOGLE_APPLICATION_CREDENTIALS"], postgres: ["DATABASE_URL", "pg", "prisma:postgresql", "drizzle-pg"], posthog: ["posthog-js", "posthog-react-native", "posthog-ios", "posthog-flutter"], revenuecat: ["react-native-purchases", "purchases_flutter", "RevenueCat"], stripe: ["stripe", "STRIPE_SECRET_KEY"] },
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
      const rows = await boardRows(ctx, { board: "trending", window, verifiedOnly: true, category, limit: Math.min(limit ?? 20, 50) });
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
      const cards = (await benchmarkCards(ctx, saas)).map((c) => ({ cohort: c.groupLabel, cohortKey: c.group, cohortDefinition: c.cohortDefinition, dimension: c.dimension, metric: c.metric, metricLabel: c.metricLabel, value: c.value, percentile: c.percentile, previousPercentile: c.previousPercentile, band: c.band, median: c.median, p10: c.p10, p90: c.p90, medianMultiple: c.medianMultiple, sampleSize: c.sampleSize, insight: c.insight, changeInsight: c.changeInsight }));
      const eligible = isBenchmarkEligible(saas);
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
  args: { auth: authArg, ...refArg, format: v.optional(v.string()), type: v.optional(v.string()), theme: v.optional(v.string()), window: v.optional(v.string()), compact: v.optional(v.boolean()) },
  handler: async (ctx, { auth, projectId, slug, format = "badge", type = "users", theme, window = "30d", compact }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      if (format !== "badge" && format !== "widget") fail("bad_request", "format must be badge or widget");
      const urls = projectUrls(saas);
      const project = { id: saas._id, slug: saas.slug, name: saas.name, isPublic: saas.isPublic };
      const note = saas.isPublic ? undefined : "Drafts render 'not found' until published.";
      if (format === "widget") {
        if (!(WIDGET_TYPES as readonly string[]).includes(type)) fail("bad_request", `type must be one of ${WIDGET_TYPES.join(", ")}`);
        const p = parseWidgetParams(new URLSearchParams({ type, theme: theme ?? "auto", window }));
        const s = widgetSnippets({ siteUrl: siteUrl(), slug: saas.slug, name: saas.name, ...p });
        return {
          project, format, ...p,
          script: s.script, iframe: s.iframe, iframeSrc: s.iframeSrc, jsonUrl: s.jsonUrl, width: s.width, height: s.height,
          types: WIDGET_TYPES, themes: ["auto", "dark", "light"],
          cache: "Live iframe widget: renders from public metrics, refreshes every 5 minutes, auto light/dark, links back to the growth page with ref=embed. The embedding host is counted (never visitors).",
          note,
        };
      }
      const types = ["users", "growth", "trending", "verified", "chart"];
      if (!types.includes(type)) fail("bad_request", `type must be one of ${types.join(", ")}`);
      const qs = new URLSearchParams({ type, ...(theme === "light" ? { theme: "light" } : {}), ...(window === "7d" ? { window: "7d" } : {}), ...(compact ? { compact: "1" } : {}) });
      const src = `${urls.badge}?${qs}`;
      const height = type === "chart" ? (compact ? 96 : 120) : 28;
      return {
        project, format,
        type, theme: theme ?? "dark", window, compact: Boolean(compact),
        imageUrl: src,
        html: `<a href="${urls.page}"><img src="${src}" alt="${saas.name} on UserTrack" height="${height}"></a>`,
        markdown: `[![${saas.name} on UserTrack](${src})](${urls.page})`,
        types, cache: "Rendered on request, cached 1h at the edge; only public metrics; no key needed.",
        note,
      };
    }),
});

// ---- v0.7: founder profile, share events, share cards, X drafts ------------------------------------------------------

const cardUrls = (page: string, kind: string, c: Partial<CardConfig> = {}) => {
  const q = cardQuery(c);
  return { kind, page: `${page}/share/${kind}`, image: `${page}/share/${kind}/card${q}`, square: `${page}/share/${kind}/card${cardQuery({ ...c, size: "square" })}` };
};

function draftFor(e: Doc<"shareEvents">, saas: Doc<"saas">, profile: Doc<"profiles">, url: string) {
  const text = xDraft({ kind: e.kind as DraftKind, name: saas.name, value: e.value, title: e.title, totalUsers: saas.totalUsers, newUsers30d: saas.newUsers30d, growth30dPct: saas.growth30dPct, rank: e.rank, percentile: e.percentile, verified: saas.trust === "verified", author: "founder", seed: e.key, founderHandle: profile.x });
  return { text, xIntent: xIntentUrl(text, url) };
}

async function founderProfile(ctx: QueryCtx | MutationCtx, profile: Doc<"profiles">) {
  const rows = (await founderRows(ctx, profile)).map(publicSaas);
  const base = siteUrl();
  return {
    profile: { ...publicProfile(profile), location: profile.location, profilePublic: profile.profilePublic !== false, xState: xConnectionState({ handle: profile.x, connected: Boolean(profile.xUserId) }), socialPrefs: normalizePrefs(profile.socialPrefs) },
    aggregates: founderAggregates(rows),
    projects: rows.map((s) => ({ id: s._id, slug: s.slug, name: s.name, totalUsers: s.totalUsers, newUsers30d: s.newUsers30d, growth30dPct: s.growth30dPct, rank: s.rank, trendingRank: s.trendingRank, verification: s.trust, url: `${base}/s/${s.slug}` })),
    urls: { profile: `${base}/u/${profile.username}`, card: `${base}/u/${profile.username}/card`, api: `${base}/api/v1/users/${profile.username}`, settings: `${base}/app/settings/social` },
    formulas: { activationRatePct: "sum(activated users) / sum(users of projects with an activation source)", growth30dPct: "sum(new users 30d) / (sum(total users) - sum(new users 30d))", totalUsers: "sum over public projects only" },
  };
}

export const profileTool = query({
  args: { auth: authArg },
  handler: async (ctx, { auth }) => {
    const { profile } = await authenticate(ctx, auth, "mcp", "profile:read");
    return founderProfile(ctx, profile);
  },
});

// Art. 20 export for agents: same document as /api/account/export, never a secret.
export const exportAccountTool = query({
  args: { auth: authArg },
  handler: async (ctx, { auth }) => {
    const { profile } = await authenticate(ctx, auth, "mcp", "profile:read");
    const user = await authComponent.getAnyUserById(ctx, profile.userId);
    if (!user) return fail("unauthorized", "Token owner not found");
    return buildExport(ctx, user, profile);
  },
});

export const updateProfileTool = mutation({
  args: { auth: authArg, displayName: v.optional(v.string()), bio: v.optional(v.string()), website: v.optional(v.string()), x: v.optional(v.string()), github: v.optional(v.string()), linkedin: v.optional(v.string()), location: v.optional(v.string()), avatarUrl: v.optional(v.string()), profilePublic: v.optional(v.boolean()) },
  handler: async (ctx, { auth, ...patch }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "profile:write");
      const strip = (s?: string) => s?.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(github\.com|linkedin\.com\/in)\//, "").replace(/\/$/, "") || undefined;
      const next: Partial<Doc<"profiles">> = {};
      if (patch.displayName !== undefined) {
        if (patch.displayName.trim().length < 2) fail("bad_request", "displayName is too short");
        next.displayName = patch.displayName.trim().slice(0, 60);
      }
      if (patch.bio !== undefined) next.bio = patch.bio.trim().slice(0, 160) || undefined;
      if (patch.location !== undefined) next.location = patch.location.trim().slice(0, 60) || undefined;
      if (patch.website !== undefined) {
        if (patch.website && !/^https?:\/\//.test(patch.website.trim())) fail("bad_request", "website must start with https://");
        next.website = patch.website.trim() || undefined;
      }
      if (patch.avatarUrl !== undefined) {
        if (patch.avatarUrl && !/^https:\/\//.test(patch.avatarUrl.trim())) fail("bad_request", "avatarUrl must start with https://");
        next.avatarUrl = patch.avatarUrl.trim() || undefined;
      }
      if (patch.x !== undefined) {
        try { next.x = canonicalX(patch.x); } catch (e) { fail("bad_request", (e as Error).message); }
      }
      if (patch.github !== undefined) next.github = strip(patch.github);
      if (patch.linkedin !== undefined) next.linkedin = strip(patch.linkedin);
      if (patch.profilePublic !== undefined) next.profilePublic = patch.profilePublic;
      await ctx.db.patch(profile._id, next);
      await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "update_profile", ok: true, detail: Object.keys(next).join(",") });
      return { updated: Object.keys(next), ...(await founderProfile(ctx, (await ctx.db.get(profile._id))!)) };
    }),
});

export const shareEventsTool = query({
  args: { auth: authArg, ...refArg, status: v.optional(shareStatus), limit: v.optional(v.number()) },
  handler: async (ctx, { auth, projectId, slug, status, limit }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const only = projectId || slug ? await requireOwnedProject(ctx, profile._id, { id: projectId, slug }) : null;
      const rows = await ctx.db.query("shareEvents").withIndex("by_profile_status_time", (q) => q.eq("profileId", profile._id).eq("status", status ?? "ready")).order("desc").take(Math.min(limit ?? 20, 100));
      const events = [];
      for (const e of rows) {
        if (only && e.saasId !== only._id) continue;
        const saas = await ctx.db.get(e.saasId);
        if (!saas) continue;
        const page = projectUrls(saas).page;
        const urls = cardUrls(page, e.cardKind);
        events.push({ id: e._id, project: { id: saas._id, slug: saas.slug, name: saas.name, isPublic: saas.isPublic }, kind: e.kind, category: e.category, title: e.title, detail: e.detail, metric: e.metric, value: e.value, rank: e.rank, percentile: e.percentile, timeframe: e.timeframe, score: e.score, status: e.status, createdAt: new Date(e.createdAt).toISOString(), card: urls, draft: draftFor(e, saas, profile, urls.page) });
      }
      events.sort((a, b) => b.score - a.score);
      return { events, strongest: events[0] ?? null, note: events.length ? undefined : "No share-ready events yet. Significant milestones (100+ users, Top 100, records, top-10% benchmarks) create them automatically." };
    }),
});

const cardStyleArg = v.union(...CARD_STYLES.map((s) => v.literal(s)));
const cardRangeArg = v.union(...CARD_RANGES.map((r) => v.literal(r)));

// Builds a card configuration + URLs. Marks the share event as shared when one is referenced (the agent is about to post it).
export const createShareCardTool = mutation({
  args: { auth: authArg, ...refArg, kind: v.optional(v.string()), shareEventId: v.optional(v.id("shareEvents")), style: v.optional(cardStyleArg), size: v.optional(v.union(v.literal("og"), v.literal("square"))), range: v.optional(cardRangeArg), chart: v.optional(v.boolean()), logo: v.optional(v.boolean()), founder: v.optional(v.boolean()), verified: v.optional(v.boolean()), dates: v.optional(v.boolean()), title: v.optional(v.string()) },
  handler: async (ctx, { auth, projectId, slug, kind, shareEventId, ...config }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "profile:write");
      let event: Doc<"shareEvents"> | null = null;
      if (shareEventId) {
        event = await ctx.db.get(shareEventId);
        if (!event || event.profileId !== profile._id) fail("not_found", "Unknown share event");
      }
      const saas = event ? (await ctx.db.get(event.saasId))! : await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const kinds = ["users", "growth", "week", ...(saas.rank ? ["rank"] : []), ...(saas.trendingRank ? ["trending"] : []), ...(saas.activationRatePct !== undefined ? ["activation"] : []), ...(visibilityOf(saas).conversionRate && saas.signupToConvertedPct !== undefined ? ["conversion"] : []), "benchmark"];
      const k = kind ?? event?.cardKind ?? "users";
      if (!kinds.includes(k) && !/^(milestone|spike)-[a-z0-9]+$/i.test(k)) fail("bad_request", `kind must be one of ${kinds.join(", ")}, milestone-<id> or spike-<id>`);
      const urls = cardUrls(projectUrls(saas).page, k, config);
      if (event) await ctx.db.patch(event._id, { status: "shared", sharedAt: Date.now() });
      const draft = event ? draftFor(event, saas, profile, urls.page) : (() => { const text = xDraft({ kind: (k.split("-")[0] as DraftKind), name: saas.name, value: saas.totalUsers, totalUsers: saas.totalUsers, newUsers30d: saas.newUsers30d, newUsers7d: saas.newUsers7d, growth30dPct: saas.growth30dPct, rank: k === "trending" ? saas.trendingRank : saas.rank, verified: saas.trust === "verified", author: "founder", seed: k }); return { text, xIntent: xIntentUrl(text, urls.page) }; })();
      return { project: { id: saas._id, slug: saas.slug, name: saas.name, isPublic: saas.isPublic }, config: { style: "blueprint", size: "og", range: "30d", chart: true, logo: true, founder: true, verified: true, dates: true, ...config }, card: urls, draft, styles: CARD_STYLES, ranges: CARD_RANGES, verificationLine: saas.trust === "verified" ? "Verified by UserTrack" : "Tracked on UserTrack", note: saas.isPublic ? undefined : "Publish the project first; share images 404 for drafts." };
    }),
});

export const xDraftTool = query({
  args: { auth: authArg, ...refArg, shareEventId: v.optional(v.id("shareEvents")), kind: v.optional(v.string()) },
  handler: async (ctx, { auth, projectId, slug, shareEventId, kind }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      if (shareEventId) {
        const e = await ctx.db.get(shareEventId);
        if (!e || e.profileId !== profile._id) fail("not_found", "Unknown share event");
        const saas = (await ctx.db.get(e!.saasId))!;
        const page = `${projectUrls(saas).page}/share/${e!.cardKind}`;
        return { project: { id: saas._id, slug: saas.slug, name: saas.name }, event: { id: e!._id, title: e!.title, kind: e!.kind }, url: page, ...draftFor(e!, saas, profile, page) };
      }
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const k = (kind ?? "users") as DraftKind;
      const page = `${projectUrls(saas).page}/share/${kind ?? "users"}`;
      const text = xDraft({ kind: k, name: saas.name, value: k === "users" ? saas.totalUsers : k === "growth" ? saas.newUsers30d : k === "week" ? saas.newUsers7d : k === "activation" ? (saas.activationRatePct ?? 0) : k === "trending" ? (saas.trendingRank ?? 0) : (saas.rank ?? 0), totalUsers: saas.totalUsers, newUsers30d: saas.newUsers30d, newUsers7d: saas.newUsers7d, growth30dPct: saas.growth30dPct, rank: k === "trending" ? saas.trendingRank : saas.rank, verified: saas.trust === "verified", author: "founder", seed: k, founderHandle: profile.x });
      return { project: { id: saas._id, slug: saas.slug, name: saas.name }, url: page, text, xIntent: xIntentUrl(text, page) };
    }),
});

export const founderUrlTool = query({
  args: { auth: authArg },
  handler: async (ctx, { auth }) => {
    const { profile } = await authenticate(ctx, auth, "mcp", "profile:read");
    const base = siteUrl();
    return { username: profile.username, public: profile.profilePublic !== false, urls: { profile: `${base}/u/${profile.username}`, card: `${base}/u/${profile.username}/card`, ogImage: `${base}/u/${profile.username}/opengraph-image`, api: `${base}/api/v1/users/${profile.username}`, history: `${base}/api/v1/users/${profile.username}/history` } };
  },
});

// ---- v0.9: discovery, watchlist, rank + benchmark history, datasets, webhooks ----------------------------------------

// follows.ts / webhooks.ts raise plain Errors with user-facing messages; surface them as structured failures.
async function lift<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ConvexError || e instanceof DomainError) throw e;
    const message = (e as Error).message ?? "Request failed";
    return fail(/not found/i.test(message) ? "not_found" : "bad_request", message);
  }
}

type Window = "24h" | "7d" | "30d";
const windowArg = v.union(v.literal("24h"), v.literal("7d"), v.literal("30d"));
const platformArg = v.union(...PLATFORMS.map((p) => v.literal(p)));
// Compact public row for discovery / dataset answers: public projection only, never owner or visibility internals.
function discoverRow(s: Doc<"saas">, w: Window) {
  const p = publicSaas(s);
  return {
    slug: p.slug, name: p.name, category: p.category, projectType: p.projectType ?? "web", verification: p.trust,
    totalUsers: p.totalUsers, newUsers: w === "24h" ? p.newUsers24h : w === "7d" ? p.newUsers7d : p.newUsers30d, growth7dPct: p.growth7dPct, growth30dPct: p.growth30dPct, activationRatePct: p.activationRatePct,
    rank: p.rank, rank7dAgo: p.rank7dAgo, rankDelta7d: p.rankDelta7d, movement: rankMovement(p.rank7dAgo, p.rank),
    trendingRank: p.trendingRank, trendingMovement: rankMovement(p.trendingRank7dAgo, p.trendingRank), trendingScore7d: p.trendingScore7d,
    url: projectUrls(s).page,
  };
}

// Public discovery sections (same rules as /discover), trimmed for agents.
export const discover = query({
  args: { auth: authArg, category: v.optional(v.string()), window: v.optional(windowArg) },
  handler: async (ctx, { auth, category, window = "7d" }) =>
    run(async () => {
      await authenticate(ctx, auth, "mcp", "metrics:read");
      if (category && !CATEGORIES.some((c) => c.slug === category)) fail("bad_request", `category must be one of ${CATEGORIES.map((c) => c.slug).join(", ")}`);
      const pick = async (board: Board, w: Window, extra: { platform?: string } = {}) => (await boardRows(ctx, { board, window: w, verifiedOnly: true, category, limit: 10, ...extra })).map((s) => discoverRow(s, w));
      const base = siteUrlOf();
      return {
        category: category ?? null,
        window,
        sections: { trending: await pick("trending", window), fastestGrowing: await pick("fastest", window), newAndRising: await pick("new-rising", "7d"), hiddenGems: await pick("hidden-gems", "7d"), movers: await pick("movers", "30d"), mobile: await pick("most-new", "30d", { platform: "mobile" }) },
        feed: (await feedItems(ctx, 12, category)).map((i) => ({ id: i.id, kind: i.kind, at: new Date(i.at).toISOString(), title: i.title, detail: i.detail, value: i.value, project: { slug: i.saas.slug, name: i.saas.name, category: i.saas.category, totalUsers: i.saas.totalUsers, verification: i.saas.trust }, url: `${base}/s/${i.saas.slug}` })),
        hiddenGemRules: HIDDEN_GEM_RULES,
        newRisingRules: NEW_RISING_RULES,
        urls: { discover: `${base}/discover${category ? `?category=${category}` : ""}`, hiddenGems: `${base}/hidden-gems`, trending: `${base}/trending` },
      };
    }),
});

// ---- Watchlist ------------------------------------------------------------------------------------------------------

const targetTypeArg = v.union(v.literal("saas"), v.literal("profile"));
const targetRefArg = { targetType: targetTypeArg, targetId: v.optional(v.string()), slug: v.optional(v.string()), username: v.optional(v.string()) };

async function resolveTarget(ctx: QueryCtx | MutationCtx, ref: { targetType: "saas" | "profile"; targetId?: string; slug?: string; username?: string }) {
  if (ref.targetType === "saas") {
    const s = ref.slug ? await ctx.db.query("saas").withIndex("by_slug", (q) => q.eq("slug", ref.slug!)).unique() : ref.targetId ? await ctx.db.get(ref.targetId as Id<"saas">).catch(() => null) : null;
    if (!s || !s.isPublic) fail("not_found", "No public project matches that slug or id");
    return { type: "saas" as const, id: s!._id, slug: s!.slug, name: s!.name, url: projectUrls(s!).page };
  }
  const p = ref.username ? await ctx.db.query("profiles").withIndex("by_username", (q) => q.eq("username", ref.username!.toLowerCase().replace(/^@/, ""))).unique() : ref.targetId ? await ctx.db.get(ref.targetId as Id<"profiles">).catch(() => null) : null;
  if (!p || p.profilePublic === false) fail("not_found", "No public founder matches that username or id");
  return { type: "profile" as const, id: p!._id, username: p!.username, name: p!.displayName, url: `${siteUrlOf()}/u/${p!.username}` };
}

export const followTool = mutation({
  args: { auth: authArg, ...targetRefArg },
  handler: async (ctx, { auth, ...ref }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "follows:write");
      const target = await resolveTarget(ctx, ref);
      const r = await lift(() => followTarget(ctx, profile, target.type, target.id));
      await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "follow", saasId: target.type === "saas" ? (target.id as Id<"saas">) : undefined, ok: true, detail: `${target.type}:${"slug" in target ? target.slug : target.username} ${r.created ? "created" : "existing"}` });
      return { ...r, target, watchlistUrl: `${siteUrlOf()}/app/following` };
    }),
});

export const unfollowTool = mutation({
  args: { auth: authArg, ...targetRefArg },
  handler: async (ctx, { auth, ...ref }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "follows:write");
      const target = await resolveTarget(ctx, ref);
      const r = await lift(() => unfollowTarget(ctx, profile, target.type, target.id));
      await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "unfollow", saasId: target.type === "saas" ? (target.id as Id<"saas">) : undefined, ok: true, detail: `${target.type}:${"slug" in target ? target.slug : target.username} ${r.removed ? "removed" : "not_following"}` });
      return { ...r, target };
    }),
});

const clampDays = (d?: number) => Math.min(Math.max(d ?? 30, 1), 90);
const clampLimit = (l?: number) => Math.min(Math.max(l ?? 60, 1), 200);

// Agent view of the watchlist: compact rows with 7-day movement plus the personal feed.
export const watchlist = query({
  args: { auth: authArg, days: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { auth, days, limit }) => {
    const { profile } = await authenticate(ctx, auth, "mcp", "follows:read");
    const w = await watchlistFeed(ctx, profile._id, clampDays(days), clampLimit(limit));
    const base = siteUrlOf();
    return {
      days: clampDays(days),
      saas: w.saas.map((s) => ({ id: s._id, slug: s.slug, name: s.name, category: s.category, verification: s.trust, totalUsers: s.totalUsers, newUsers7d: s.newUsers7d, newUsers30d: s.newUsers30d, growth7dPct: s.growth7dPct, growth30dPct: s.growth30dPct, rank: s.rank, rank7dAgo: s.rank7dAgo, rankMovement7d: s.rankMovement7d, trendingRank: s.trendingRank, trendingMovement7d: s.trendingMovement7d, via: s.via, followed: s.followed, url: `${base}/s/${s.slug}` })),
      founders: w.founders.map((p) => ({ id: p._id, username: p.username, displayName: p.displayName, followerCount: p.followerCount, url: `${base}/u/${p.username}` })),
      feed: w.feed.map(({ saas, share, ...i }) => ({ ...i, at: new Date(i.at).toISOString(), project: { slug: saas.slug, name: saas.name, category: saas.category, totalUsers: saas.totalUsers, verification: saas.trust }, url: `${base}/s/${saas.slug}${share ? `/${share}` : ""}` })),
      urls: { watchlist: `${base}/app/following` },
      note: w.saas.length || w.founders.length ? undefined : "Nothing followed yet. usertrack_follow_project / usertrack_follow_founder add products and founders to the watchlist.",
    };
  },
});

// REST /following: the API key owner's watchlist with full public projections (private to the key owner, never public).
export const following = query({
  args: { auth: authArg, days: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { auth, days, limit }) => {
    const { profile } = await authenticate(ctx, auth, "api", "metrics:read");
    const w = await watchlistFeed(ctx, profile._id, clampDays(days), clampLimit(limit));
    const saas = [];
    for (const row of w.saas) {
      const s = await ctx.db.get(row._id);
      if (!s || !s.isPublic) continue;
      const owner = await ctx.db.get(s.ownerId);
      saas.push({ ...publicSaas(s), owner: owner ? { username: owner.username, displayName: owner.displayName } : null, via: row.via, followed: row.followed, rankMovement7d: row.rankMovement7d, trendingMovement7d: row.trendingMovement7d });
    }
    return { days: clampDays(days), saas, founders: w.founders.map((p) => ({ username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl, followerCount: p.followerCount })), feed: w.feed.map(({ via, founder, ...i }) => ({ ...i, via, founder })) };
  },
});

// ---- Rank + benchmark history (owner view; private projects allowed) --------------------------------------------------

const rankKindArg = v.union(v.literal("leaderboard"), v.literal("trending"));

export const rankHistoryTool = query({
  args: { auth: authArg, ...refArg, kind: v.optional(rankKindArg), window: v.optional(windowArg), days: v.optional(v.number()) },
  handler: async (ctx, { auth, projectId, slug, kind = "leaderboard", window, days }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const w = window ?? (kind === "trending" ? "7d" : "30d");
      const d = Math.min(Math.max(days ?? 90, 7), 730);
      const since = dayKey(Date.now() - d * DAY);
      const rows = await ctx.db.query("rankHistory").withIndex("by_saas_kind_window_day", (q) => q.eq("saasId", saas._id).eq("kind", kind).eq("window", w).gte("day", since)).collect();
      const current = kind === "trending" ? trendingRankFor(saas, w).rank : saas.rank;
      const ago = kind === "trending" ? saas.trendingRank7dAgo : saas.rank7dAgo;
      return {
        project: { id: saas._id, slug: saas.slug, name: saas.name, isPublic: saas.isPublic },
        kind, window: w, days: d,
        points: rows.map((r) => ({ day: r.day, rank: r.rank, score: r.score })),
        current, best: kind === "trending" ? saas.bestTrendingRank : saas.bestRank, rank7dAgo: ago, movement7d: rankMovement(ago, current),
        note: rows.length ? undefined : saas.isPublic ? "No stored positions yet: ranks are recorded once per UTC day after each rerank." : "The project is not published, so it is not ranked; publish it with usertrack_update_project { isPublic: true }.",
        publicUrl: saas.isPublic ? `${projectUrls(saas).api}/rank-history?kind=${kind}&window=${w}` : undefined,
      };
    }),
});

export const benchmarkHistoryTool = query({
  args: { auth: authArg, ...refArg, weeks: v.optional(v.number()) },
  handler: async (ctx, { auth, projectId, slug, weeks }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "metrics:read");
      const saas = await requireOwnedProject(ctx, profile._id, { id: projectId, slug });
      const n = Math.min(Math.max(weeks ?? 26, 4), 52);
      const history = await benchmarkHistoryFor(ctx, saas, n, false);
      const changes = (await benchmarkCards(ctx, saas)).filter((c) => c.changeInsight).map((c) => ({ cohort: c.groupLabel, cohortKey: c.group, metric: c.metric, metricLabel: c.metricLabel, percentile: c.percentile, previousPercentile: c.previousPercentile, previousWeek: c.previousWeek, band: c.band, changeInsight: c.changeInsight }));
      return {
        project: { id: saas._id, slug: saas.slug, name: saas.name },
        weeks: n,
        history: history.map((h) => ({ ...h, computedAt: new Date(h.computedAt).toISOString() })),
        changes,
        publicView: visibilityOf(saas).benchmarks ? "Top-quarter standings are public on the growth page and /benchmark-history." : "Benchmarks are hidden on the public page (visibility.benchmarks is off); this is the owner's private view.",
        note: history.length ? undefined : "No weekly standings yet: benchmarks refresh daily and need at least " + MIN_SAMPLE + " verified products per cohort.",
      };
    }),
});

// ---- Datasets ---------------------------------------------------------------------------------------------------------

const datasetArg = v.union(...DATASET_NAMES.map((d) => v.literal(d)), v.literal("rankings"));

export const dataset = query({
  args: { auth: authArg, dataset: datasetArg, category: v.optional(v.string()), window: v.optional(windowArg), platform: v.optional(platformArg), limit: v.optional(v.number()), period: v.optional(v.string()), board: v.optional(v.string()) },
  handler: async (ctx, { auth, dataset, category, window, platform, limit, period, board }) =>
    run(async () => {
      await authenticate(ctx, auth, "mcp", "metrics:read");
      if (category && !CATEGORIES.some((c) => c.slug === category)) fail("bad_request", `category must be one of ${CATEGORIES.map((c) => c.slug).join(", ")}`);
      const base = siteUrlOf();
      if (dataset === "rankings") {
        if (!period) {
          const periods = (await ctx.db.query("rankingSnapshots").withIndex("by_period").order("desc").take(200)).map((r) => ({ period: r.period, board: r.board, category: r.category ?? null, sampleSize: r.sampleSize, computedAt: new Date(r.computedAt).toISOString() }));
          return { dataset, periods, hint: "Pass period (YYYY-MM) plus optional board / category for the frozen ranking.", url: `${base}/api/v1/datasets/rankings/history` };
        }
        if (!/^\d{4}-\d{2}$/.test(period)) fail("bad_request", "period must look like YYYY-MM");
        const b = board ?? "most-new";
        const snap = await ctx.db.query("rankingSnapshots").withIndex("by_period_board_category", (q) => q.eq("period", period).eq("board", b).eq("category", category)).unique();
        if (!snap) fail("not_found", `No frozen ranking for ${period} / ${b}${category ? ` / ${category}` : ""}`);
        return { dataset, period, board: b, category: category ?? null, sampleSize: snap!.sampleSize, computedAt: new Date(snap!.computedAt).toISOString(), rows: snap!.rows.map((r) => ({ ...r, url: `${base}/s/${r.slug}` })), url: `${base}/rankings/${period.replace("-", "/")}${category ? `/${category}` : ""}` };
      }
      if (dataset === "category" && !category) fail("bad_request", "The category dataset needs a category slug");
      const def = DATASETS[dataset as DatasetName];
      const w = window ?? def.window;
      const b = (dataset === "category" && board ? board : def.board) as Board;
      const rows = (await boardRows(ctx, { board: b, window: w, verifiedOnly: true, category, platform, limit: Math.min(limit ?? 50, 100) })).map((s, i) => datasetRow(publicSaas(s), i + 1, base));
      const qs = new URLSearchParams({ window: w, ...(category ? { category } : {}), ...(platform ? { platform } : {}) });
      const path = dataset === "category" ? `/api/v1/datasets/categories/${category}` : `/api/v1/datasets/${dataset}`;
      return { dataset, board: b, window: w, category: category ?? null, platform: platform ?? null, rows, updatedAt: await lastSyncedAt(ctx, null), methodology: `${base}${def.methodology}`, urls: { json: `${base}${path}?${qs}`, csv: `${base}${path}?${qs}&format=csv` } };
    }),
});

// ---- Webhooks ---------------------------------------------------------------------------------------------------------

async function requireOwnedEndpoint(ctx: QueryCtx | MutationCtx, profileId: Id<"profiles">, endpointId: string) {
  const ep = await ctx.db.get(endpointId as Id<"webhookEndpoints">).catch(() => null);
  if (!ep || ep.profileId !== profileId) fail("not_found", "Webhook endpoint not found");
  return ep!;
}

const webhookCatalog = () => ({ events: WEBHOOK_EVENTS.map((e) => ({ type: e.type, label: e.label, blurb: e.blurb })), maxEndpoints: MAX_ENDPOINTS, docs: `${siteUrlOf()}/developers/webhooks` });

export const webhooksList = query({
  args: { auth: authArg },
  handler: async (ctx, { auth }) => {
    const { profile } = await authenticate(ctx, auth, "mcp", "webhooks:read");
    const endpoints = await listEndpoints(ctx, profile._id);
    const projects = (await listOwnedProjects(ctx, profile._id)).map((s) => ({ id: s._id, slug: s.slug, name: s.name }));
    return { endpoints: endpoints.map(endpointOut), projects, ...webhookCatalog(), note: endpoints.length ? undefined : "No webhook endpoints yet. usertrack_create_webhook returns the signing secret once." };
  },
});

const endpointOut = <T extends { createdAt: number; updatedAt: number; lastDeliveryAt?: number }>(e: T) => ({ ...e, createdAt: new Date(e.createdAt).toISOString(), updatedAt: new Date(e.updatedAt).toISOString(), lastDeliveryAt: e.lastDeliveryAt === undefined ? undefined : new Date(e.lastDeliveryAt).toISOString() });

export const createWebhookTool = mutation({
  args: { auth: authArg, ...refArg, url: v.string(), events: v.array(v.string()), description: v.optional(v.string()) },
  handler: async (ctx, { auth, projectId, slug, url, events, description }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "webhooks:write");
      const saas = projectId || slug ? await requireOwnedProject(ctx, profile._id, { id: projectId, slug }) : null;
      const r = await lift(() => createEndpoint(ctx, profile._id, { url, events, description, saasId: saas?._id }));
      await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "create_webhook", saasId: saas?._id, ok: true, detail: `${new URL(r.endpoint.url).host} ${r.endpoint.events.join(",")}` });
      return { endpoint: endpointOut(r.endpoint), secret: r.secret, message: "Endpoint created. The signing secret is returned only now — hand it to the founder for their environment; never print or log it. Send a signed test with usertrack_test_webhook.", nextTool: "usertrack_test_webhook", ...webhookCatalog() };
    }),
});

export const updateWebhookTool = mutation({
  args: { auth: authArg, endpointId: v.string(), url: v.optional(v.string()), events: v.optional(v.array(v.string())), description: v.optional(v.string()), status: v.optional(v.union(v.literal("active"), v.literal("disabled"))), projectId: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { auth, endpointId, projectId, ...patch }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "webhooks:write");
      const ep = await requireOwnedEndpoint(ctx, profile._id, endpointId);
      const saasId = projectId === undefined ? undefined : projectId === null ? null : (await requireOwnedProject(ctx, profile._id, { id: projectId }))._id;
      const changed = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined);
      if (projectId !== undefined) changed.push("project");
      if (!changed.length) fail("bad_request", "Nothing to update");
      const endpoint = await lift(() => updateEndpoint(ctx, profile._id, ep._id, { ...patch, saasId }));
      await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "update_webhook", saasId: endpoint.saasId, ok: true, detail: changed.join(",") });
      return { updated: changed, endpoint: endpointOut(endpoint) };
    }),
});

export const rotateWebhookSecretTool = mutation({
  args: { auth: authArg, endpointId: v.string() },
  handler: async (ctx, { auth, endpointId }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "webhooks:write");
      const ep = await requireOwnedEndpoint(ctx, profile._id, endpointId);
      const r = await lift(() => rotateEndpointSecret(ctx, profile._id, ep._id));
      await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "rotate_webhook_secret", saasId: ep.saasId, ok: true, detail: new URL(ep.url).host });
      return { endpoint: endpointOut(r.endpoint), secret: r.secret, message: "Secret rotated; the previous secret stops verifying immediately. Returned only now — never print or log it." };
    }),
});

export const deleteWebhookTool = mutation({
  args: { auth: authArg, endpointId: v.string() },
  handler: async (ctx, { auth, endpointId }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "webhooks:write");
      const ep = await requireOwnedEndpoint(ctx, profile._id, endpointId);
      await lift(() => deleteEndpoint(ctx, profile._id, ep._id));
      await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "delete_webhook", saasId: ep.saasId, ok: true, detail: new URL(ep.url).host });
      return { deleted: true, endpointId: ep._id };
    }),
});

export const testWebhookTool = mutation({
  args: { auth: authArg, endpointId: v.string() },
  handler: async (ctx, { auth, endpointId }) =>
    run(async () => {
      const { token, profile } = await authenticate(ctx, auth, "mcp", "webhooks:write");
      const ep = await requireOwnedEndpoint(ctx, profile._id, endpointId);
      const r = await lift(() => sendTestEvent(ctx, profile._id, ep._id));
      await audit(ctx, { profileId: profile._id, tokenId: token._id, action: "test_webhook", saasId: ep.saasId, ok: true, detail: new URL(ep.url).host });
      return { ...r, endpointId: ep._id, message: "Signed webhook.test event queued. Check the outcome with usertrack_get_webhook_deliveries in a few seconds.", nextTool: "usertrack_get_webhook_deliveries" };
    }),
});

export const webhookDeliveriesTool = query({
  args: { auth: authArg, endpointId: v.string(), limit: v.optional(v.number()), failedOnly: v.optional(v.boolean()) },
  handler: async (ctx, { auth, endpointId, limit, failedOnly }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "webhooks:read");
      const ep = await requireOwnedEndpoint(ctx, profile._id, endpointId);
      const rows = await recentDeliveries(ctx, profile._id, ep._id, limit ?? 25, failedOnly ?? false);
      const iso = (t?: number) => (t === undefined ? undefined : new Date(t).toISOString());
      return { endpoint: { id: ep._id, url: ep.url, status: ep.status, consecutiveFailures: ep.consecutiveFailures }, deliveries: rows.map((d) => ({ ...d, nextAttemptAt: iso(d.nextAttemptAt), createdAt: iso(d.createdAt), lastAttemptAt: iso(d.lastAttemptAt), deliveredAt: iso(d.deliveredAt) })), note: rows.length ? undefined : failedOnly ? "No failed deliveries." : "No deliveries yet; usertrack_test_webhook sends a signed test event." };
    }),
});
