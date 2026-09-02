// Data-source rules shared by the dashboard and the MCP server: connect, sync, and the secret-free view.
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { describeProvider, getProvider, normalizeRole, verificationLevel, ROLE_STAGE, type Role } from "../providers";
import { dayKey } from "../lib/time";
import { DomainError } from "./projects";

export const SYNC_COOLDOWN_MS = 60_000;
export const stagesOf = (role: Role) => (role === "conversion" ? (["trial", "converted"] as const) : [ROLE_STAGE[role]]);

export async function listIntegrations(ctx: QueryCtx | MutationCtx, saasId: Id<"saas">) {
  return ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).collect();
}

export function integrationView(i: Doc<"integrations">) {
  const role = normalizeRole(i.role);
  const p = getProvider(i.provider);
  const capabilities = describeProvider(p, i.config, role);
  return {
    id: i._id,
    role,
    provider: i.provider,
    label: p.label,
    status: i.status,
    trust: i.trust,
    verification: verificationLevel(i.provider, i.trust, capabilities, role),
    capabilities,
    lastError: i.lastError,
    lastSyncAt: i.lastSyncAt,
    lastSuccessAt: i.lastSuccessAt,
    lastFailureAt: i.lastFailureAt,
    consecutiveFailures: i.consecutiveFailures ?? 0,
    connectedAt: i.connectedAt ?? i._creationTime,
    publicConfig: getProvider(i.provider).publicConfig(i.config),
    awaitingVerification: i.awaitingVerification ?? false,
    verifiedAt: i.verifiedAt,
    pluginVersion: i.pluginVersion,
    protocolVersion: i.protocolVersion,
    lastEventAt: i.lastEventAt,
  };
}

// One integration per SaaS per role. Replacing keeps historical snapshots (provenance lives on each snapshot).
export async function connectIntegration(ctx: MutationCtx, saas: Doc<"saas">, role: Role, provider: string, config: unknown) {
  const p = getProvider(provider);
  if (!p.roles.includes(role)) throw new DomainError("bad_request", `${p.label} cannot provide ${role} data`);
  const validated = p.validate(config, role);
  if (!validated.ok) throw new DomainError("bad_request", validated.error);
  const saasId = saas._id;
  const existing = await ctx.db.query("integrations").withIndex("by_saas_role", (q) => q.eq("saasId", saasId).eq("role", role)).first();
  const legacy = !existing ? await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).filter((q) => q.eq(q.field("role"), role === "users" ? undefined : "revenue")).first() : null;
  const current = existing ?? legacy;
  const now = Date.now();
  const doc = {
    saasId,
    provider: p.kind,
    role,
    config: validated.config,
    status: "running" as const,
    trust: p.trust(validated.config, saas.websiteUrl),
    lastError: undefined,
    consecutiveFailures: 0,
    connectedAt: now,
    backfilledAt: undefined,
  };
  let id: Id<"integrations">;
  if (current) {
    await ctx.db.patch(current._id, doc);
    id = current._id;
    if (role === "users") {
      const day = dayKey(now);
      const dup = await ctx.db.query("events").withIndex("by_saas_kind_day", (q) => q.eq("saasId", saasId).eq("kind", "reconnect").eq("day", day)).first();
      if (!dup) await ctx.db.insert("events", { saasId, kind: "reconnect", day, at: now, title: "Source reconnected", detail: `Switched to ${p.label}${current.provider !== p.kind ? ` from ${getProvider(current.provider).label}` : ""}.` });
    }
  } else id = await ctx.db.insert("integrations", doc);
  if (role === "users") await ctx.db.patch(saasId, { trust: "pending" });
  // A replaced source may use a different id space: drop that stage's identity links (bounded batches, cohorts rebuild after).
  if (current && current.provider !== p.kind) for (const stage of stagesOf(role)) await ctx.scheduler.runAfter(0, internal.cohorts.purgeStage, { saasId, stage });
  await ctx.scheduler.runAfter(0, internal.sync.runOne, { integrationId: id, attempt: 1 });
  return id;
}

// Immediate sync with a per-integration cooldown so agents and buttons cannot hammer provider APIs.
export async function requestSync(ctx: MutationCtx, saasId: Id<"saas">, role?: Role) {
  const all = await listIntegrations(ctx, saasId);
  const targets = (role ? all.filter((i) => normalizeRole(i.role) === role) : all).filter((i) => !i.awaitingVerification);
  if (!targets.length) throw new DomainError("bad_request", all.some((i) => i.awaitingVerification) ? "Verify the integration first — deploy the plugin, then click Verify" : "No data source connected");
  for (const integration of targets) {
    if (integration.lastSyncAt && Date.now() - integration.lastSyncAt < SYNC_COOLDOWN_MS) {
      const wait = Math.ceil((SYNC_COOLDOWN_MS - (Date.now() - integration.lastSyncAt)) / 1000);
      throw new DomainError("rate_limited", "Please wait a minute between syncs", wait);
    }
  }
  for (const integration of targets) {
    await ctx.db.patch(integration._id, { status: "running" });
    await ctx.scheduler.runAfter(0, internal.sync.runOne, { integrationId: integration._id, attempt: 1 });
  }
  return targets.map((i) => i._id);
}
