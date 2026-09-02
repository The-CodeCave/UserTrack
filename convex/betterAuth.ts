// Better Auth native integration: credential lifecycle (create / rotate), lifecycle-event ingestion and the live event summary.
// The integration secret is generated here, shown exactly once, and stored only inside integrations.config (server-only).
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOwnedSaas } from "./saas";
import { listIntegrations, stagesOf } from "./domain/integrations";
import { normalizeRole } from "./providers";
import { normalizeBaseUrl } from "./providers/betterAuth";
import { EVENTS_PATH, generateIntegrationSecret, sha256Hex, verify, HEADER_NONCE, HEADER_SIGNATURE, HEADER_TIMESTAMP } from "./lib/betterAuthProtocol";
import { DAY } from "./lib/time";

const EVENT_RETENTION_DAYS = 30;
const PRUNE_BATCH = 500;

export type CreatedCredential = { integrationId: Id<"integrations">; projectId: string; secret: string; secretPrefix: string; url: string; created: boolean; rotated: boolean };

// Shared by the dashboard mutation and the MCP gateway. Idempotent: an existing Better Auth source is returned without a new
// secret unless `rotate` is set (or the caller changes the URL). A different provider on the users role is replaced.
export async function createBetterAuthIntegration(ctx: MutationCtx, saas: Doc<"saas">, input: { url?: string; rotate?: boolean }): Promise<CreatedCredential> {
  const base = normalizeBaseUrl(input.url?.trim() ? input.url : `${saas.websiteUrl.replace(/\/+$/, "")}/api/auth`);
  if (!base.ok) throw new ConvexError({ code: "bad_request", message: base.error });
  const now = Date.now();
  const all = await listIntegrations(ctx, saas._id);
  const current = all.find((i) => normalizeRole(i.role) === "users") ?? null;
  const projectId = String(saas._id);
  if (current?.provider === "better_auth" && !input.rotate) {
    const cfg = current.config as { url: string; secretPrefix: string };
    if (cfg.url !== base.url) await ctx.db.patch(current._id, { config: { ...current.config, url: base.url } });
    return { integrationId: current._id, projectId, secret: "", secretPrefix: cfg.secretPrefix, url: base.url, created: false, rotated: false };
  }
  const { secret, prefix } = generateIntegrationSecret();
  const config = { url: base.url, secret, secretHash: await sha256Hex(secret), secretPrefix: prefix, projectId, createdAt: now };
  const doc = { saasId: saas._id, provider: "better_auth" as const, role: "users" as const, config, status: "error" as const, trust: "pending" as const, lastError: "Waiting for deployment — install @usertrack/better-auth, deploy, then verify.", consecutiveFailures: 0, awaitingVerification: true, connectedAt: undefined, backfilledAt: undefined, verifiedAt: undefined, pluginVersion: undefined, protocolVersion: undefined };
  let id: Id<"integrations">;
  if (current) {
    await ctx.db.patch(current._id, doc);
    id = current._id;
    if (current.provider !== "better_auth") for (const stage of stagesOf("users")) await ctx.scheduler.runAfter(0, internal.cohorts.purgeStage, { saasId: saas._id, stage });
  } else id = await ctx.db.insert("integrations", doc);
  await ctx.db.patch(saas._id, { trust: "pending" });
  return { integrationId: id, projectId, secret, secretPrefix: prefix, url: base.url, created: !current || current.provider !== "better_auth", rotated: Boolean(current && current.provider === "better_auth") };
}

export const createIntegration = mutation({
  args: { saasId: v.id("saas"), url: v.optional(v.string()), rotate: v.optional(v.boolean()) },
  handler: async (ctx, { saasId, url, rotate }) => {
    const { saas } = await requireOwnedSaas(ctx, saasId);
    return createBetterAuthIntegration(ctx, saas, { url, rotate });
  },
});

// Verified inbound events are stored by the action below; this query resolves the integration + secret hash server-side only.
export const integrationForEvents = internalQuery({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const saasId = ctx.db.normalizeId("saas", projectId);
    if (!saasId) return null;
    const integration = (await listIntegrations(ctx, saasId)).find((i) => normalizeRole(i.role) === "users" && i.provider === "better_auth") ?? null;
    if (!integration) return null;
    const cfg = integration.config as { secret: string };
    return { integrationId: integration._id, saasId, secret: cfg.secret };
  },
});

export const storeEvent = internalMutation({
  args: { integrationId: v.id("integrations"), saasId: v.id("saas"), eventId: v.string(), type: v.union(v.literal("user.created"), v.literal("user.deleted")), subject: v.optional(v.string()), occurredAt: v.number() },
  handler: async (ctx, { integrationId, saasId, eventId, type, subject, occurredAt }) => {
    const dup = await ctx.db.query("integrationEvents").withIndex("by_integration_event", (q) => q.eq("integrationId", integrationId).eq("eventId", eventId)).first();
    if (dup) return { stored: false, duplicate: true };
    const now = Date.now();
    await ctx.db.insert("integrationEvents", { integrationId, saasId, eventId, type, subject, occurredAt, receivedAt: now });
    await ctx.db.patch(integrationId, { lastEventAt: now });
    return { stored: true, duplicate: false };
  },
});

export type IngestResult = { ok: true; duplicate: boolean } | { ok: false; status: number; error: string };

// Called by the Next.js route /api/integrations/better-auth/events with the raw body + signature headers. Verifies the
// HMAC with the integration secret (WebCrypto → action), dedupes by eventId, never stores raw ids.
export const ingestEvent = action({
  args: { gateway: v.optional(v.string()), projectId: v.string(), body: v.string(), headers: v.object({ timestamp: v.optional(v.string()), nonce: v.optional(v.string()), signature: v.optional(v.string()) }) },
  handler: async (ctx, { gateway, projectId, body, headers }): Promise<IngestResult> => {
    const expected = process.env.UT_GATEWAY_SECRET;
    if (expected && gateway !== expected) return { ok: false, status: 401, error: "gateway secret mismatch" };
    const target = await ctx.runQuery(internal.betterAuth.integrationForEvents, { projectId });
    if (!target) return { ok: false, status: 404, error: "unknown project or no Better Auth integration" };
    const sig = await verify(target.secret, { [HEADER_TIMESTAMP]: headers.timestamp, [HEADER_NONCE]: headers.nonce, [HEADER_SIGNATURE]: headers.signature }, { method: "REQUEST", path: EVENTS_PATH, body });
    if (!sig.ok) return { ok: false, status: 401, error: sig.reason === "stale" ? "stale timestamp" : "invalid signature" };
    let event: { protocolVersion?: number; eventId?: string; type?: string; subject?: string; occurredAt?: string; projectId?: string };
    try {
      event = JSON.parse(body);
    } catch {
      return { ok: false, status: 400, error: "body is not JSON" };
    }
    if (event.protocolVersion !== 1) return { ok: false, status: 400, error: "unsupported protocolVersion" };
    if (event.projectId !== projectId) return { ok: false, status: 400, error: "projectId mismatch" };
    if (typeof event.eventId !== "string" || event.eventId.length < 8 || event.eventId.length > 64) return { ok: false, status: 400, error: "eventId missing" };
    if (event.type !== "user.created" && event.type !== "user.deleted") return { ok: false, status: 400, error: "unsupported event type" };
    const occurredAt = Date.parse(String(event.occurredAt));
    if (!Number.isFinite(occurredAt)) return { ok: false, status: 400, error: "occurredAt missing" };
    const subject = typeof event.subject === "string" && /^[0-9a-f]{16,64}$/.test(event.subject) ? event.subject : undefined;
    const r = await ctx.runMutation(internal.betterAuth.storeEvent, { integrationId: target.integrationId, saasId: target.saasId, eventId: event.eventId, type: event.type, subject, occurredAt });
    return { ok: true, duplicate: r.duplicate };
  },
});

// Owner view: what arrived since the last successful sync, for the integration panel.
export const eventSummary = query({
  args: { saasId: v.id("saas") },
  handler: async (ctx, { saasId }) => {
    await requireOwnedSaas(ctx, saasId);
    const integration = (await listIntegrations(ctx, saasId)).find((i) => normalizeRole(i.role) === "users" && i.provider === "better_auth");
    if (!integration) return null;
    const since = integration.lastSuccessAt ?? 0;
    const recent = await ctx.db.query("integrationEvents").withIndex("by_integration_time", (q) => q.eq("integrationId", integration._id).gte("receivedAt", since)).collect();
    const today = await ctx.db.query("integrationEvents").withIndex("by_integration_time", (q) => q.eq("integrationId", integration._id).gte("receivedAt", Date.now() - DAY)).collect();
    return {
      lastEventAt: integration.lastEventAt,
      sinceLastSync: { created: recent.filter((e) => e.type === "user.created").length, deleted: recent.filter((e) => e.type === "user.deleted").length },
      last24h: { created: today.filter((e) => e.type === "user.created").length, deleted: today.filter((e) => e.type === "user.deleted").length },
    };
  },
});

// Daily sweep: events older than 30 days carry no value (snapshots are the source of truth).
export const pruneEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - EVENT_RETENTION_DAYS * DAY;
    const old = await ctx.db.query("integrationEvents").withIndex("by_time", (q) => q.lt("receivedAt", cutoff)).take(PRUNE_BATCH);
    for (const e of old) await ctx.db.delete(e._id);
    if (old.length === PRUNE_BATCH) await ctx.scheduler.runAfter(1000, internal.betterAuth.pruneEvents, {});
  },
});
