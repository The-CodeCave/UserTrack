// Outbound webhooks: endpoint management (owner), event dispatch (called from the sync / rank / milestone paths),
// asynchronous signed delivery with retries, and the delivery ledger. URL policy + signing live in lib/webhooks.ts.
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireProfile } from "./profiles";
import { projectUrls } from "./domain/projects";
import { webhookEventType } from "./schema";
import {
  DISABLE_AFTER_FAILURES, MAX_ATTEMPTS, MAX_ENDPOINTS, WEBHOOK_EVENT_TYPES, WEBHOOK_TIMEOUT_MS, buildPayload, checkWebhookUrl, eventIdFor, generateWebhookSecret, maskSecret, newDeliveryId,
  nextAttemptDelay, serializePayload, signPayload, signatureHeaders, type WebhookEventType, type WebhookProject,
} from "./lib/webhooks";
import { resolvePublicHost } from "./lib/ssrf";

type Ctx = QueryCtx | MutationCtx;

// ---- Dispatch (internal) ------------------------------------------------------------------------------------------------

export interface DispatchInput {
  type: Exclude<WebhookEventType, "webhook.test">;
  // Deterministic per source event: the same key never produces a second delivery to the same endpoint.
  key: string;
  saas: Doc<"saas">;
  data: Record<string, unknown>;
  at?: number;
}

export const projectRef = (s: Doc<"saas">): WebhookProject => ({ id: s._id, slug: s.slug, name: s.name, url: projectUrls(s).page, totalUsers: s.totalUsers });

// Fans one event out to every active endpoint of the project owner that subscribed to the type. Never throws.
export async function dispatchEvent(ctx: MutationCtx, e: DispatchInput) {
  if (e.saas.isDemo) return 0;
  const endpoints = await ctx.db.query("webhookEndpoints").withIndex("by_profile", (q) => q.eq("profileId", e.saas.ownerId)).collect();
  const targets = endpoints.filter((ep) => ep.status === "active" && ep.events.includes(e.type) && (!ep.saasId || ep.saasId === e.saas._id));
  if (!targets.length) return 0;
  const at = e.at ?? Date.now();
  const eventId = eventIdFor(e.type, `${e.saas._id}:${e.key}`);
  const payload = buildPayload({ id: eventId, type: e.type, createdAt: at, project: projectRef(e.saas), data: e.data });
  let queued = 0;
  for (const ep of targets) {
    const dup = await ctx.db.query("webhookDeliveries").withIndex("by_endpoint_event", (q) => q.eq("endpointId", ep._id).eq("eventId", eventId)).first();
    if (dup) continue;
    await enqueueDelivery(ctx, ep, { eventId, type: e.type, payload, saasId: e.saas._id });
    queued++;
  }
  return queued;
}

async function enqueueDelivery(ctx: MutationCtx, ep: Doc<"webhookEndpoints">, d: { eventId: string; type: WebhookEventType; payload: unknown; saasId?: Id<"saas"> }) {
  const now = Date.now();
  const id = await ctx.db.insert("webhookDeliveries", { endpointId: ep._id, profileId: ep.profileId, saasId: d.saasId, eventId: d.eventId, deliveryId: newDeliveryId(), type: d.type, payload: d.payload, attempt: 0, status: "pending", nextAttemptAt: now, createdAt: now });
  await ctx.scheduler.runAfter(0, internal.webhooks.deliver, { deliveryId: id });
  return id;
}

// ---- Delivery (internal action + bookkeeping mutation) ----------------------------------------------------------------------

export const loadDelivery = internalQuery({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const d = await ctx.db.get(deliveryId);
    if (!d) return null;
    const ep = await ctx.db.get(d.endpointId);
    return ep ? { delivery: d, endpoint: ep } : null;
  },
});

const RETRYABLE = new Set([408, 425, 429]);

export const deliver = internalAction({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const row = await ctx.runQuery(internal.webhooks.loadDelivery, { deliveryId });
    if (!row) return;
    const { delivery, endpoint } = row;
    if (delivery.status === "success" || delivery.status === "exhausted") return;
    if (endpoint.status !== "active") {
      await ctx.runMutation(internal.webhooks.recordAttempt, { deliveryId, ok: false, retryable: false, error: "endpoint disabled", latencyMs: 0 });
      return;
    }
    const url = checkWebhookUrl(endpoint.url);
    if (!url.ok) {
      await ctx.runMutation(internal.webhooks.recordAttempt, { deliveryId, ok: false, retryable: false, error: `blocked url: ${url.reason}`, latencyMs: 0 });
      return;
    }
    const dns = await resolvePublicHost(url.host);
    if (!dns.ok) {
      await ctx.runMutation(internal.webhooks.recordAttempt, { deliveryId, ok: false, retryable: false, error: `blocked: ${dns.reason}`, latencyMs: 0 });
      return;
    }
    const body = serializePayload(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await signPayload(endpoint.secret, timestamp, body);
    const started = Date.now();
    try {
      const res = await fetch(url.url, { method: "POST", headers: signatureHeaders({ signature, timestamp, type: delivery.type, deliveryId: delivery.deliveryId, eventId: delivery.eventId }), body, redirect: "manual", signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS) });
      const latencyMs = Date.now() - started;
      const ok = res.status >= 200 && res.status < 300;
      await ctx.runMutation(internal.webhooks.recordAttempt, { deliveryId, ok, httpStatus: res.status, latencyMs, retryable: !ok && (res.status >= 500 || RETRYABLE.has(res.status)), error: ok ? undefined : `HTTP ${res.status}` });
    } catch (e) {
      const err = e as Error;
      const timeout = err.name === "TimeoutError" || err.name === "AbortError";
      await ctx.runMutation(internal.webhooks.recordAttempt, { deliveryId, ok: false, retryable: true, latencyMs: Date.now() - started, error: (timeout ? `timeout after ${WEBHOOK_TIMEOUT_MS / 1000}s` : err.message).slice(0, 200) });
    }
  },
});

export const recordAttempt = internalMutation({
  args: { deliveryId: v.id("webhookDeliveries"), ok: v.boolean(), retryable: v.boolean(), httpStatus: v.optional(v.number()), latencyMs: v.number(), error: v.optional(v.string()) },
  handler: async (ctx, { deliveryId, ok, retryable, httpStatus, latencyMs, error }) => {
    const d = await ctx.db.get(deliveryId);
    if (!d || d.status === "success" || d.status === "exhausted") return;
    const ep = await ctx.db.get(d.endpointId);
    const now = Date.now();
    const attempt = d.attempt + 1;
    const delay = retryable ? nextAttemptDelay(attempt) : null;
    const status = ok ? "success" : delay === null ? "exhausted" : "failed";
    await ctx.db.patch(deliveryId, { attempt, status, httpStatus, latencyMs, error, lastAttemptAt: now, deliveredAt: ok ? now : undefined, nextAttemptAt: delay === null ? undefined : now + delay });
    if (delay !== null) await ctx.scheduler.runAfter(delay, internal.webhooks.deliver, { deliveryId });
    if (!ep) return;
    const failures = ok ? 0 : ep.consecutiveFailures + 1;
    const disable = !ok && failures >= DISABLE_AFTER_FAILURES && ep.status === "active";
    await ctx.db.patch(ep._id, { lastDeliveryAt: now, lastStatus: httpStatus, lastError: ok ? undefined : error, consecutiveFailures: failures, updatedAt: now, ...(disable ? { status: "disabled", disabledReason: `Disabled automatically after ${failures} consecutive failed deliveries.` } : {}) });
  },
});

// Safety net for deliveries whose scheduled retry was lost (deploy, function error): re-schedule anything overdue.
export const retrySweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const overdue = await ctx.db.query("webhookDeliveries").withIndex("by_status_next", (q) => q.eq("status", "failed").lte("nextAttemptAt", Date.now() - 60_000)).take(100);
    for (const d of overdue) await ctx.scheduler.runAfter(0, internal.webhooks.deliver, { deliveryId: d._id });
    const stuck = await ctx.db.query("webhookDeliveries").withIndex("by_status_next", (q) => q.eq("status", "pending").lte("nextAttemptAt", Date.now() - 10 * 60_000)).take(100);
    for (const d of stuck) await ctx.scheduler.runAfter(0, internal.webhooks.deliver, { deliveryId: d._id });
  },
});

// ---- Owner API (dashboard + gateway) ------------------------------------------------------------------------------------------

export function endpointView(ep: Doc<"webhookEndpoints">) {
  return { id: ep._id, url: ep.url, description: ep.description, events: ep.events, saasId: ep.saasId, status: ep.status, disabledReason: ep.disabledReason, secretMasked: maskSecret(ep.secretPrefix), consecutiveFailures: ep.consecutiveFailures, lastDeliveryAt: ep.lastDeliveryAt, lastStatus: ep.lastStatus, lastError: ep.lastError, createdAt: ep.createdAt, updatedAt: ep.updatedAt };
}

export function deliveryView(d: Doc<"webhookDeliveries">) {
  return { id: d._id, deliveryId: d.deliveryId, eventId: d.eventId, type: d.type, attempt: d.attempt, status: d.status, httpStatus: d.httpStatus, latencyMs: d.latencyMs, error: d.error, nextAttemptAt: d.nextAttemptAt, createdAt: d.createdAt, lastAttemptAt: d.lastAttemptAt, deliveredAt: d.deliveredAt };
}

const eventsArg = v.array(webhookEventType);

function validateEvents(events: string[]) {
  const set = [...new Set(events)].filter((e) => (WEBHOOK_EVENT_TYPES as string[]).includes(e)) as Exclude<WebhookEventType, "webhook.test">[];
  if (!set.length) throw new Error("Pick at least one event type");
  return set;
}

export async function listEndpoints(ctx: Ctx, profileId: Id<"profiles">) {
  const rows = await ctx.db.query("webhookEndpoints").withIndex("by_profile", (q) => q.eq("profileId", profileId)).collect();
  return rows.sort((a, b) => b.createdAt - a.createdAt).map(endpointView);
}

export async function requireEndpoint(ctx: Ctx, profileId: Id<"profiles">, id: Id<"webhookEndpoints">) {
  const ep = await ctx.db.get(id);
  if (!ep || ep.profileId !== profileId) throw new Error("Webhook endpoint not found");
  return ep;
}

export async function createEndpoint(ctx: MutationCtx, profileId: Id<"profiles">, input: { url: string; events: string[]; description?: string; saasId?: Id<"saas"> }) {
  const url = checkWebhookUrl(input.url);
  if (!url.ok) throw new Error(url.reason);
  const events = validateEvents(input.events);
  const existing = await ctx.db.query("webhookEndpoints").withIndex("by_profile", (q) => q.eq("profileId", profileId)).collect();
  if (existing.length >= MAX_ENDPOINTS) throw new Error(`You can have at most ${MAX_ENDPOINTS} webhook endpoints`);
  if (input.saasId) {
    const s = await ctx.db.get(input.saasId);
    if (!s || s.ownerId !== profileId) throw new Error("Project not found");
  }
  const { secret, prefix } = generateWebhookSecret();
  const now = Date.now();
  const id = await ctx.db.insert("webhookEndpoints", { profileId, url: url.url, description: input.description?.trim().slice(0, 120) || undefined, events, saasId: input.saasId, secret, secretPrefix: prefix, status: "active", consecutiveFailures: 0, createdAt: now, updatedAt: now });
  await ctx.db.insert("auditLogs", { profileId, action: "webhook_created", ok: true, detail: url.host, at: now });
  return { endpoint: endpointView((await ctx.db.get(id))!), secret };
}

export async function updateEndpoint(ctx: MutationCtx, profileId: Id<"profiles">, id: Id<"webhookEndpoints">, patch: { url?: string; events?: string[]; description?: string; saasId?: Id<"saas"> | null; status?: "active" | "disabled" }) {
  const ep = await requireEndpoint(ctx, profileId, id);
  const next: Partial<Doc<"webhookEndpoints">> = { updatedAt: Date.now() };
  if (patch.url !== undefined) {
    const url = checkWebhookUrl(patch.url);
    if (!url.ok) throw new Error(url.reason);
    next.url = url.url;
  }
  if (patch.events !== undefined) next.events = validateEvents(patch.events);
  if (patch.description !== undefined) next.description = patch.description.trim().slice(0, 120) || undefined;
  if (patch.saasId !== undefined) {
    if (patch.saasId) {
      const s = await ctx.db.get(patch.saasId);
      if (!s || s.ownerId !== profileId) throw new Error("Project not found");
    }
    next.saasId = patch.saasId ?? undefined;
  }
  if (patch.status !== undefined) {
    next.status = patch.status;
    if (patch.status === "active") { next.disabledReason = undefined; next.consecutiveFailures = 0; }
    else next.disabledReason = "Disabled by you.";
  }
  await ctx.db.patch(ep._id, next);
  return endpointView((await ctx.db.get(ep._id))!);
}

export async function rotateEndpointSecret(ctx: MutationCtx, profileId: Id<"profiles">, id: Id<"webhookEndpoints">) {
  const ep = await requireEndpoint(ctx, profileId, id);
  const { secret, prefix } = generateWebhookSecret();
  await ctx.db.patch(ep._id, { secret, secretPrefix: prefix, updatedAt: Date.now() });
  await ctx.db.insert("auditLogs", { profileId, action: "webhook_secret_rotated", ok: true, at: Date.now() });
  return { endpoint: endpointView((await ctx.db.get(ep._id))!), secret };
}

export async function deleteEndpoint(ctx: MutationCtx, profileId: Id<"profiles">, id: Id<"webhookEndpoints">) {
  const ep = await requireEndpoint(ctx, profileId, id);
  await ctx.db.delete(ep._id);
  await ctx.scheduler.runAfter(0, internal.webhooks.purgeDeliveries, { endpointId: ep._id });
  await ctx.db.insert("auditLogs", { profileId, action: "webhook_deleted", ok: true, at: Date.now() });
}

export const purgeDeliveries = internalMutation({
  args: { endpointId: v.id("webhookEndpoints") },
  handler: async (ctx, { endpointId }) => {
    const rows = await ctx.db.query("webhookDeliveries").withIndex("by_endpoint_time", (q) => q.eq("endpointId", endpointId)).take(200);
    for (const r of rows) await ctx.db.delete(r._id);
    if (rows.length === 200) await ctx.scheduler.runAfter(500, internal.webhooks.purgeDeliveries, { endpointId });
  },
});

// A clearly marked test event, delivered through the normal pipeline (signature, retries, log) regardless of subscriptions.
export async function sendTestEvent(ctx: MutationCtx, profileId: Id<"profiles">, id: Id<"webhookEndpoints">) {
  const ep = await requireEndpoint(ctx, profileId, id);
  const now = Date.now();
  const saas = ep.saasId ? await ctx.db.get(ep.saasId) : (await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", profileId)).first());
  const eventId = `evt_test_${now.toString(36)}`;
  const payload = buildPayload({ id: eventId, type: "webhook.test", createdAt: now, test: true, project: saas ? projectRef(saas) : undefined, data: { message: "Test event from UserTrack. Your endpoint received a signed payload — verify the UserTrack-Signature header and respond 2xx.", endpointId: ep._id, sample: { type: "milestone.reached", milestone: { kind: "users", metric: "totalUsers", value: 10_000, title: "10,000 users" } } } });
  const deliveryId = await enqueueDelivery(ctx, ep, { eventId, type: "webhook.test", payload, saasId: saas?._id });
  return { deliveryId, eventId };
}

export async function recentDeliveries(ctx: Ctx, profileId: Id<"profiles">, id: Id<"webhookEndpoints">, limit = 25, failedOnly = false) {
  await requireEndpoint(ctx, profileId, id);
  const rows = await ctx.db.query("webhookDeliveries").withIndex("by_endpoint_time", (q) => q.eq("endpointId", id)).order("desc").take(Math.min(Math.max(limit, 1), 100) * (failedOnly ? 4 : 1));
  return rows.filter((d) => !failedOnly || d.status === "failed" || d.status === "exhausted").slice(0, limit).map(deliveryView);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx);
    const endpoints = await listEndpoints(ctx, profile._id);
    const projects = (await ctx.db.query("saas").withIndex("by_owner", (q) => q.eq("ownerId", profile._id)).collect()).map((s) => ({ id: s._id, name: s.name, slug: s.slug }));
    return { endpoints, projects, maxEndpoints: MAX_ENDPOINTS, maxAttempts: MAX_ATTEMPTS };
  },
});

export const create = mutation({
  args: { url: v.string(), events: eventsArg, description: v.optional(v.string()), saasId: v.optional(v.id("saas")) },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    return createEndpoint(ctx, profile._id, args);
  },
});

export const update = mutation({
  args: { id: v.id("webhookEndpoints"), url: v.optional(v.string()), events: v.optional(eventsArg), description: v.optional(v.string()), saasId: v.optional(v.union(v.id("saas"), v.null())), status: v.optional(v.union(v.literal("active"), v.literal("disabled"))) },
  handler: async (ctx, { id, ...patch }) => {
    const { profile } = await requireProfile(ctx);
    return updateEndpoint(ctx, profile._id, id, patch);
  },
});

export const rotateSecret = mutation({
  args: { id: v.id("webhookEndpoints") },
  handler: async (ctx, { id }) => {
    const { profile } = await requireProfile(ctx);
    return rotateEndpointSecret(ctx, profile._id, id);
  },
});

export const remove = mutation({
  args: { id: v.id("webhookEndpoints") },
  handler: async (ctx, { id }) => {
    const { profile } = await requireProfile(ctx);
    await deleteEndpoint(ctx, profile._id, id);
  },
});

export const sendTest = mutation({
  args: { id: v.id("webhookEndpoints") },
  handler: async (ctx, { id }) => {
    const { profile } = await requireProfile(ctx);
    return sendTestEvent(ctx, profile._id, id);
  },
});

export const deliveries = query({
  args: { id: v.id("webhookEndpoints"), limit: v.optional(v.number()), failedOnly: v.optional(v.boolean()) },
  handler: async (ctx, { id, limit, failedOnly }) => {
    const { profile } = await requireProfile(ctx);
    return recentDeliveries(ctx, profile._id, id, limit ?? 25, failedOnly ?? false);
  },
});

export const retry = mutation({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const { profile } = await requireProfile(ctx);
    const d = await ctx.db.get(deliveryId);
    if (!d || d.profileId !== profile._id) throw new Error("Delivery not found");
    if (d.status === "success") return;
    await ctx.db.patch(deliveryId, { status: "pending", attempt: Math.max(0, MAX_ATTEMPTS - 2), nextAttemptAt: Date.now(), error: undefined });
    await ctx.scheduler.runAfter(0, internal.webhooks.deliver, { deliveryId });
  },
});
