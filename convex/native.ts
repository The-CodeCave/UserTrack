// Native SDK integrations: credential lifecycle (create / rotate), lifecycle-event ingestion and the live event summary.
// The integration secret is generated here, shown exactly once, and stored only inside integrations.config (server-only).
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOwnedSaas } from "./saas";
import { listIntegrations, stagesOf } from "./domain/integrations";
import { normalizeRole } from "./providers";
import { defaultBasePath, normalizeBaseUrl, sourceLabel } from "./providers/native";
import { EVENTS_PATH, EVENT_TYPES, generateIntegrationSecret, HEADER_NONCE, HEADER_SIGNATURE, HEADER_TIMESTAMP, LEGACY_EVENTS_PATH, NATIVE_PACKAGE, NATIVE_SOURCES, type NativeSource, normalizeSource, sha256Hex, verify } from "./lib/nativeProtocol";
import { DAY } from "./lib/time";
import { gatewayMatches } from "./lib/gateway";
import { decryptValue, encryptConfig } from "./lib/secrets";
import { native as nativeProvider } from "./providers/native";

const EVENT_RETENTION_DAYS = 30;
const PRUNE_BATCH = 500;
export const nativeSourceArg = v.union(...NATIVE_SOURCES.map((s) => v.literal(s)));
export const eventTypeArg = v.union(...EVENT_TYPES.map((t) => v.literal(t)));

export type CreatedCredential = { integrationId: Id<"integrations">; projectId: string; source: NativeSource; secret: string; secretPrefix: string; url: string; created: boolean; rotated: boolean };

const isNative = (i: Doc<"integrations">) => i.provider === "native" || i.provider === "better_auth";

// Shared by the dashboard mutation and the MCP gateway. Idempotent: an existing native users source is returned without a new
// secret unless `rotate` is set (URL / source changes are patched in place). A different provider on the users role is replaced.
// Rotation also re-keys the activation / conversion rows attached to the same credential.
export async function createNativeIntegration(ctx: MutationCtx, saas: Doc<"saas">, input: { url?: string; source?: string; rotate?: boolean }): Promise<CreatedCredential> {
  const source = normalizeSource(input.source ?? "better-auth");
  const base = normalizeBaseUrl(input.url?.trim() ? input.url : `${saas.websiteUrl.replace(/\/+$/, "")}${defaultBasePath(source)}`, source);
  if (!base.ok) throw new ConvexError({ code: "bad_request", message: base.error });
  const now = Date.now();
  const all = await listIntegrations(ctx, saas._id);
  const current = all.find((i) => normalizeRole(i.role) === "users") ?? null;
  const projectId = String(saas._id);
  if (current && isNative(current) && !input.rotate) {
    const cfg = current.config as { url: string; source?: string; secretPrefix: string };
    if (cfg.url !== base.url || cfg.source !== source || current.provider !== "native") {
      const config = { ...current.config, url: base.url, source };
      await ctx.db.patch(current._id, { provider: "native", config, publicConfig: nativeProvider.publicConfig(config) });
    }
    return { integrationId: current._id, projectId, source, secret: "", secretPrefix: cfg.secretPrefix, url: base.url, created: false, rotated: false };
  }
  const { secret, prefix } = generateIntegrationSecret();
  const credential = { secret, secretHash: await sha256Hex(secret), secretPrefix: prefix, projectId, createdAt: now };
  const config = { url: base.url, source, ...credential };
  const stored = await encryptConfig("native", config);
  const doc = { saasId: saas._id, provider: "native" as const, role: "users" as const, config: stored, publicConfig: nativeProvider.publicConfig(config), status: "error" as const, trust: "pending" as const, lastError: `Waiting for deployment — install ${NATIVE_PACKAGE[source]}, deploy, then verify.`, consecutiveFailures: 0, awaitingVerification: true, connectedAt: undefined, backfilledAt: undefined, verifiedAt: undefined, pluginVersion: undefined, protocolVersion: undefined };
  let id: Id<"integrations">;
  if (current) {
    await ctx.db.patch(current._id, doc);
    id = current._id;
    if (!isNative(current)) for (const stage of stagesOf("users")) await ctx.scheduler.runAfter(0, internal.cohorts.purgeStage, { saasId: saas._id, stage });
  } else id = await ctx.db.insert("integrations", doc);
  for (const sibling of all) if (sibling._id !== id && isNative(sibling)) await ctx.db.patch(sibling._id, { provider: "native", config: { ...sibling.config, ...stored }, publicConfig: nativeProvider.publicConfig(config) });
  await ctx.db.patch(saas._id, { trust: "pending" });
  return { integrationId: id, projectId, source, secret, secretPrefix: prefix, url: base.url, created: !current || !isNative(current), rotated: Boolean(current && isNative(current)) };
}

export const createIntegration = mutation({
  args: { saasId: v.id("saas"), url: v.optional(v.string()), source: v.optional(nativeSourceArg), rotate: v.optional(v.boolean()) },
  handler: async (ctx, { saasId, url, source, rotate }) => {
    const { saas } = await requireOwnedSaas(ctx, saasId);
    return createNativeIntegration(ctx, saas, { url, source, rotate });
  },
});

// Verified inbound events are stored by the action below; this query resolves the integration + secret server-side only.
export const integrationForEvents = internalQuery({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const saasId = ctx.db.normalizeId("saas", projectId);
    if (!saasId) return null;
    const integration = (await listIntegrations(ctx, saasId)).find((i) => normalizeRole(i.role) === "users" && isNative(i)) ?? null;
    if (!integration) return null;
    const cfg = integration.config as { secret: string };
    return { integrationId: integration._id, saasId, secret: cfg.secret };
  },
});

export const storeEvent = internalMutation({
  args: { integrationId: v.id("integrations"), saasId: v.id("saas"), eventId: v.string(), type: eventTypeArg, subject: v.optional(v.string()), occurredAt: v.number() },
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

// Called by the Next.js events route with the raw body + signature headers. Verifies the HMAC with the integration secret
// (WebCrypto → action), dedupes by eventId, never stores raw ids. `path` is the signed path: the native one, or the legacy
// Better Auth 0.1.x one.
export const ingestEvent = action({
  args: { gateway: v.optional(v.string()), projectId: v.string(), body: v.string(), path: v.optional(v.string()), headers: v.object({ timestamp: v.optional(v.string()), nonce: v.optional(v.string()), signature: v.optional(v.string()) }) },
  handler: async (ctx, { gateway, projectId, body, path, headers }): Promise<IngestResult> => {
    if (!gatewayMatches(gateway)) return { ok: false, status: 401, error: "gateway secret mismatch" };
    const signedPath = path === LEGACY_EVENTS_PATH ? LEGACY_EVENTS_PATH : EVENTS_PATH;
    const target = await ctx.runQuery(internal.native.integrationForEvents, { projectId });
    if (!target) return { ok: false, status: 404, error: "unknown project or no native integration" };
    const sig = await verify(await decryptValue(target.secret), { [HEADER_TIMESTAMP]: headers.timestamp, [HEADER_NONCE]: headers.nonce, [HEADER_SIGNATURE]: headers.signature }, { method: "REQUEST", path: signedPath, body });
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
    if (!EVENT_TYPES.includes(event.type as (typeof EVENT_TYPES)[number])) return { ok: false, status: 400, error: "unsupported event type" };
    const occurredAt = Date.parse(String(event.occurredAt));
    if (!Number.isFinite(occurredAt)) return { ok: false, status: 400, error: "occurredAt missing" };
    const subject = typeof event.subject === "string" && /^[0-9a-f]{16,64}$/.test(event.subject) ? event.subject : undefined;
    const r = await ctx.runMutation(internal.native.storeEvent, { integrationId: target.integrationId, saasId: target.saasId, eventId: event.eventId, type: event.type as (typeof EVENT_TYPES)[number], subject, occurredAt });
    return { ok: true, duplicate: r.duplicate };
  },
});

const tally = (events: { type: string }[]) => ({
  created: events.filter((e) => e.type === "user.created").length,
  deleted: events.filter((e) => e.type === "user.deleted").length,
  activated: events.filter((e) => e.type === "user.activated").length,
  trials: events.filter((e) => e.type === "trial.started").length,
  converted: events.filter((e) => e.type === "user.converted").length,
});

// Owner view: what arrived since the last successful sync, for the integration panel.
export const eventSummary = query({
  args: { saasId: v.id("saas") },
  handler: async (ctx, { saasId }) => {
    await requireOwnedSaas(ctx, saasId);
    const integration = (await listIntegrations(ctx, saasId)).find((i) => normalizeRole(i.role) === "users" && isNative(i));
    if (!integration) return null;
    const since = integration.lastSuccessAt ?? 0;
    const recent = await ctx.db.query("integrationEvents").withIndex("by_integration_time", (q) => q.eq("integrationId", integration._id).gte("receivedAt", since)).collect();
    const today = await ctx.db.query("integrationEvents").withIndex("by_integration_time", (q) => q.eq("integrationId", integration._id).gte("receivedAt", Date.now() - DAY)).collect();
    return { source: sourceLabel((integration.config as { source?: NativeSource }).source), lastEventAt: integration.lastEventAt, sinceLastSync: tally(recent), last24h: tally(today) };
  },
});

// Daily sweep: events older than 30 days carry no value (snapshots are the source of truth).
export const pruneEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - EVENT_RETENTION_DAYS * DAY;
    const old = await ctx.db.query("integrationEvents").withIndex("by_time", (q) => q.lt("receivedAt", cutoff)).take(PRUNE_BATCH);
    for (const e of old) await ctx.db.delete(e._id);
    if (old.length === PRUNE_BATCH) await ctx.scheduler.runAfter(1000, internal.native.pruneEvents, {});
  },
});
