import { ConvexError, v } from "convex/values";
import { action, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOwnedSaas } from "./saas";
import { connectIntegration, requestSync } from "./domain/integrations";
import { integrationRole, providerKind } from "./schema";
import { describeProvider, getProvider, ProviderError, verificationLevel, type ProviderCapabilities, type ProviderMetrics, type Role, type Trust, type VerificationLevel } from "./providers";
import type { ColumnInfo, TableInfo } from "./providers/postgres";
import { fetchMetrics } from "./providerRun";
import { defaultSsl, parseConnectionString, splitTable } from "./providers/postgres";

// One integration per SaaS per role. Replacing it keeps historical snapshots (provenance lives on each snapshot).
export const connect = mutation({
  args: { saasId: v.id("saas"), role: v.optional(integrationRole), provider: providerKind, config: v.any() },
  handler: async (ctx, { saasId, role = "users", provider, config }) => {
    const { saas } = await requireOwnedSaas(ctx, saasId);
    return connectIntegration(ctx, saas, role, provider, config);
  },
});

export const syncNow = mutation({
  args: { saasId: v.id("saas"), role: v.optional(integrationRole) },
  handler: async (ctx, { saasId, role }) => {
    await requireOwnedSaas(ctx, saasId);
    await requestSync(ctx, saasId, role);
  },
});

export const disconnect = mutation({
  args: { saasId: v.id("saas"), role: v.optional(integrationRole) },
  handler: async (ctx, { saasId, role = "users" }) => {
    await requireOwnedSaas(ctx, saasId);
    const all = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).collect();
    for (const i of all.filter((i) => (i.role ?? "users") === role)) await ctx.db.delete(i._id);
    if (role === "activation") await ctx.db.patch(saasId, { activatedUsers: undefined, activated24h: undefined, activated7d: undefined, activated30d: undefined, activationRatePct: undefined });
    if (role === "traffic") await ctx.db.patch(saasId, { visitors30d: undefined, sessions30d: undefined, visitorsPrev30d: undefined, showTraffic: false });
    if (role === "revenue") await ctx.db.patch(saasId, { payingUsers: undefined, mrr: undefined, showRevenue: false });
  },
});

export const getForSync = internalQuery({
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, { integrationId }) => {
    const integration = await ctx.db.get(integrationId);
    if (!integration) return null;
    const saas = await ctx.db.get(integration.saasId);
    if (!saas) return null;
    return { integration, websiteUrl: saas.websiteUrl };
  },
});

export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("integrations").collect()).map((i) => i._id),
});

// Live "test connection" for the dashboard wizards: validates, fetches once, returns counts + what the source can do. Nothing is stored.
export type TestResult =
  | { ok: true; detected?: number; metrics: ProviderMetrics; trust: Trust; verification: VerificationLevel; capabilities: ProviderCapabilities; durationMs: number; publicConfig: Record<string, string> }
  | { ok: false; error: string; retryable: boolean };

export const test = action({
  args: { saasId: v.id("saas"), role: v.optional(integrationRole), provider: providerKind, config: v.any() },
  handler: async (ctx, { saasId, role = "users", provider, config }): Promise<TestResult> => {
    const saas = await ctx.runQuery(internal.saas.ownedForAction, { id: saasId });
    const p = getProvider(provider);
    if (!p.roles.includes(role)) return { ok: false as const, error: `${p.label} cannot provide ${role} data`, retryable: false };
    const validated = p.validate(config, role as Role);
    if (!validated.ok) return { ok: false as const, error: validated.error, retryable: false };
    const started = Date.now();
    try {
      const metrics = await fetchMetrics(ctx, provider, validated.config, role as Role);
      const trust = p.trust(validated.config, saas.websiteUrl);
      const capabilities = describeProvider(p, validated.config, role as Role);
      const detected = role === "users" ? metrics.totalUsers : role === "activation" ? metrics.activatedUsers : role === "traffic" ? metrics.visitors30d : metrics.payingUsers;
      return { ok: true as const, detected, metrics, trust, verification: verificationLevel(provider, trust, capabilities, role as Role), capabilities, durationMs: Date.now() - started, publicConfig: p.publicConfig(validated.config) };
    } catch (e) {
      const err = e as Error;
      return { ok: false as const, error: err.message.slice(0, 300), retryable: err instanceof ProviderError ? err.retryable : true };
    }
  },
});

// Postgres wizard: list readable tables, or the columns of one table with a suggested mapping and a preview count. No row data.
export type IntrospectResult =
  | { ok: true; server: string; tables: TableInfo[] }
  | { ok: true; server: string; columns: ColumnInfo[]; suggested: { idColumn?: string; createdAtColumn?: string; createdAtKind?: "timestamp" | "epoch_ms" | "epoch_s"; deletedAtColumn?: string }; total: number }
  | { ok: false; error: string };

export const introspectPostgres = action({
  args: { saasId: v.id("saas"), connectionString: v.string(), ssl: v.optional(v.union(v.literal("require"), v.literal("disable"))), table: v.optional(v.string()) },
  handler: async (ctx, { saasId, connectionString, ssl, table }): Promise<IntrospectResult> => {
    await ctx.runQuery(internal.saas.ownedForAction, { id: saasId });
    const conn = parseConnectionString(connectionString);
    if (!conn.ok) return { ok: false as const, error: conn.error };
    const split = table ? splitTable(table) : null;
    if (table && !split) return { ok: false as const, error: "Use schema.table" };
    try {
      const result: Omit<Extract<IntrospectResult, { ok: true }>, "ok"> = await ctx.runAction(internal.node.postgres.introspect, { connectionString: conn.url.toString(), ssl: ssl ?? defaultSsl(conn.url.hostname, conn.url.searchParams), schema: split?.schema, table: split?.table });
      return { ok: true, ...result } as IntrospectResult;
    } catch (e) {
      const d = e instanceof ConvexError ? (e.data as { message?: string }) : null;
      return { ok: false as const, error: d?.message ?? (e as Error).message.slice(0, 200) };
    }
  },
});
