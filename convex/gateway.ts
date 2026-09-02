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
import { describeProvider, getProvider, ProviderError, verificationLevel, type Role } from "./providers";
import { fetchMetrics } from "./providerRun";
import { DomainError, createProject, findOwnedByDomain, listOwnedProjects, projectSummary, projectUrls, requireOwnedProject, updateProject } from "./domain/projects";
import { connectIntegration, integrationView, listIntegrations, requestSync } from "./domain/integrations";
import { TIMEFRAMES, metricsSummary, milestonesFor, seriesFor, shareData } from "./domain/metrics";
import { INTEGRATION_CATALOG, integrationSetup, recommendIntegrations } from "./lib/integrationSetup";
import { publicProfile } from "./public";

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
    return rows.sort((a, b) => b._creationTime - a._creationTime).map(projectSummary);
  },
});

async function fullProject(ctx: QueryCtx | MutationCtx, saas: Doc<"saas">, username: string) {
  const integrations = (await listIntegrations(ctx, saas._id)).map(integrationView);
  const users = integrations.find((i) => i.role === "users");
  const flags = await ctx.db.query("fraudFlags").withIndex("by_saas_open", (q) => q.eq("saasId", saas._id).eq("resolvedAt", undefined)).collect();
  return {
    ...projectSummary(saas),
    urls: projectUrls(saas, username),
    integrations,
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

export const supportedIntegrations = query({
  args: { auth: authArg, detectedProviders: v.optional(v.array(v.string())), framework: v.optional(v.string()) },
  handler: async (ctx, { auth, detectedProviders, framework }) => {
    await authenticate(ctx, auth, "mcp", "integrations:read");
    return {
      providers: INTEGRATION_CATALOG.map(({ credentials, ...c }) => ({ ...c, credentialKeys: credentials.map((x) => ({ key: x.key, secret: x.secret, optional: x.optional ?? false, roles: x.roles })) })),
      recommendation: recommendIntegrations({ detectedProviders, framework }),
    };
  },
});

export const setupInstructions = query({
  args: { auth: authArg, ...refArg, provider: v.string(), role: v.optional(integrationRole), framework: v.optional(v.string()), detectedProviders: v.optional(v.array(v.string())) },
  handler: async (ctx, { auth, projectId, slug, provider, role, framework, detectedProviders }) =>
    run(async () => {
      const { profile } = await authenticate(ctx, auth, "mcp", "integrations:read");
      const saas = projectId || slug ? await requireOwnedProject(ctx, profile._id, { id: projectId, slug }) : null;
      const setup = integrationSetup({ provider, role, framework, detectedProviders, websiteUrl: saas?.websiteUrl, projectId: saas?._id });
      if (!setup) return fail("bad_request", `Unknown provider or role: ${provider}${role ? `/${role}` : ""}`, { supported: INTEGRATION_CATALOG.map((c) => ({ provider: c.provider, roles: c.roles })) });
      return { project: saas ? { id: saas._id, slug: saas.slug, websiteUrl: saas.websiteUrl } : null, ...setup };
    }),
});

export const configureIntegration = mutation({
  args: { auth: authArg, ...refArg, provider: providerKind, role: v.optional(integrationRole), config: v.any() },
  handler: async (ctx, { auth, projectId, slug, provider, role = "users", config }) =>
    run(async () => {
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
  handler: async (ctx, { auth, projectId, slug, role = "users", provider, config }) => {
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
      const detected = role === "users" ? metrics.totalUsers : role === "activation" ? metrics.activatedUsers : role === "traffic" ? metrics.visitors30d : metrics.payingUsers;
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
      const ids = await requestSync(ctx, saas._id, role);
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
