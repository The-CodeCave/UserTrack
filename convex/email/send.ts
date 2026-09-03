import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { findAuthUser } from "./users";
import { EMAIL_META, allowedByPreferences, allowedByRecipientStatus, isTransactional, type EmailType } from "./types";
import { renderEmail, type TemplateData } from "./templates";
import { emailConfig, ResendError, sendViaResend } from "./resend";
import { getPreferences, tokenSecret } from "./prefs";
import { signPrefsToken } from "./token";

const MAX_ATTEMPTS = 3;
const RETRY_MS = [0, 5 * 60_000, 30 * 60_000];

export interface EnqueueOptions<T extends EmailType> {
  userId: string;
  type: T;
  dedupeKey: string;
  data: TemplateData[T];
  saasId?: Id<"saas">;
  milestoneId?: Id<"milestones">;
  delayMs?: number;
  // Explicit recipient for callers that already resolved it; otherwise looked up from the auth user.
  to?: string;
}

export type EnqueueResult = { status: "queued"; eventId: Id<"emailEvents"> } | { status: "duplicate" | "skipped"; reason?: string };

async function recipientFor(ctx: MutationCtx, userId: string) {
  const user = await findAuthUser(ctx, userId);
  return user?.email ? { email: user.email, name: user.name } : null;
}

// Single entry point for every non-auth email. Reserves the dedupe key atomically, then hands off to `deliver`.
export async function enqueue<T extends EmailType>(ctx: MutationCtx, o: EnqueueOptions<T>): Promise<EnqueueResult> {
  const existing = await ctx.db.query("emailEvents").withIndex("by_dedupe", (q) => q.eq("dedupeKey", o.dedupeKey)).first();
  if (existing && (existing.status !== "failed" || existing.attempts >= MAX_ATTEMPTS)) return { status: "duplicate" };
  const meta = EMAIL_META[o.type];
  const recipient = o.to ? { email: o.to } : await recipientFor(ctx, o.userId);
  const now = Date.now();
  const base = {
    userId: o.userId,
    emailType: o.type,
    category: meta.category,
    saasId: o.saasId,
    milestoneId: o.milestoneId,
    dedupeKey: o.dedupeKey,
    createdAt: now,
  };
  const skip = async (reason: string) => {
    if (!existing) await ctx.db.insert("emailEvents", { ...base, recipient: recipient?.email ?? "", status: "skipped", attempts: 0, metadata: { reason } });
    return { status: "skipped" as const, reason };
  };
  if (!recipient) return skip("no recipient");
  if (!isTransactional(o.type)) {
    const prefs = await getPreferences(ctx, o.userId);
    if (!allowedByPreferences(o.type, prefs)) return skip(`preference:${meta.pref}`);
  }
  const health = await ctx.db.query("emailRecipients").withIndex("by_email", (q) => q.eq("email", recipient.email)).unique();
  if (!allowedByRecipientStatus(o.type, health?.status)) return skip(`recipient:${health!.status}`);
  const doc = { ...base, recipient: recipient.email, status: "queued" as const, attempts: existing?.attempts ?? 0, scheduledAt: now + (o.delayMs ?? 0), metadata: { data: o.data } };
  let eventId: Id<"emailEvents">;
  if (existing) {
    await ctx.db.patch(existing._id, doc);
    eventId = existing._id;
  } else eventId = await ctx.db.insert("emailEvents", doc);
  await ctx.scheduler.runAfter(o.delayMs ?? 0, internal.email.send.deliver, { eventId });
  return { status: "queued", eventId };
}

export const load = internalQuery({
  args: { eventId: v.id("emailEvents") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    const token = event.userId && !isTransactional(event.emailType as EmailType) ? await signPrefsToken(tokenSecret(), event.userId) : undefined;
    return { event, token };
  },
});

export const markSent = internalMutation({
  args: { eventId: v.id("emailEvents"), providerMessageId: v.string() },
  handler: async (ctx, { eventId, providerMessageId }) => {
    const e = await ctx.db.get(eventId);
    if (!e) return;
    await ctx.db.patch(eventId, { status: "sent", sentAt: Date.now(), providerMessageId, attempts: e.attempts + 1, error: undefined });
  },
});

export const markFailed = internalMutation({
  args: { eventId: v.id("emailEvents"), error: v.string(), retryable: v.boolean() },
  handler: async (ctx, { eventId, error, retryable }) => {
    const e = await ctx.db.get(eventId);
    if (!e) return;
    const attempts = e.attempts + 1;
    await ctx.db.patch(eventId, { status: "failed", error: error.slice(0, 300), attempts });
    if (retryable && attempts < MAX_ATTEMPTS) {
      await ctx.db.patch(eventId, { status: "queued" });
      await ctx.scheduler.runAfter(RETRY_MS[attempts] ?? 30 * 60_000, internal.email.send.deliver, { eventId });
    }
  },
});

function links(siteUrl: string, token: string | undefined) {
  if (!token) return {};
  const convexSite = process.env.CONVEX_SITE_URL ?? "";
  return {
    prefsUrl: `${siteUrl}/email/preferences?token=${encodeURIComponent(token)}`,
    unsubscribeUrl: `${siteUrl}/email/preferences?token=${encodeURIComponent(token)}&unsubscribe=1`,
    oneClick: convexSite ? `${convexSite}/email/unsubscribe?token=${encodeURIComponent(token)}` : undefined,
  };
}

export function buildMail(event: Pick<Doc<"emailEvents">, "emailType" | "recipient" | "metadata" | "dedupeKey" | "category">, token: string | undefined, siteUrl: string, data?: unknown) {
  const type = event.emailType as EmailType;
  const l = links(siteUrl, token);
  const rendered = renderEmail(type, (data ?? event.metadata?.data) as never, { siteUrl, prefsUrl: l.prefsUrl, unsubscribeUrl: l.unsubscribeUrl });
  const headers: Record<string, string> = {};
  if (l.oneClick) {
    headers["List-Unsubscribe"] = `<${l.oneClick}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return { to: event.recipient, subject: rendered.subject, html: rendered.html, text: rendered.text, headers, tags: [{ name: "type", value: type }, { name: "category", value: event.category }], idempotencyKey: event.dedupeKey };
}

export const deliver = internalAction({
  args: { eventId: v.id("emailEvents") },
  handler: async (ctx, { eventId }) => {
    const loaded = await ctx.runQuery(internal.email.send.load, { eventId });
    if (!loaded || loaded.event.status !== "queued") return;
    const cfg = emailConfig();
    if (!cfg) {
      console.warn(`email ${loaded.event.emailType} → ${loaded.event.dedupeKey}: RESEND_API_KEY not configured, not sent`);
      await ctx.runMutation(internal.email.send.markFailed, { eventId, error: "email not configured", retryable: false });
      return;
    }
    const siteUrl = process.env.SITE_URL ?? "";
    try {
      const { id } = await sendViaResend(cfg, buildMail(loaded.event, loaded.token, siteUrl));
      await ctx.runMutation(internal.email.send.markSent, { eventId, providerMessageId: id });
      console.log(`email sent type=${loaded.event.emailType} key=${loaded.event.dedupeKey} resend=${id}`);
    } catch (e) {
      const err = e as Error;
      const retryable = err instanceof ResendError ? err.retryable : true;
      console.error(`email failed type=${loaded.event.emailType} key=${loaded.event.dedupeKey}: ${err.message}`);
      await ctx.runMutation(internal.email.send.markFailed, { eventId, error: err.message, retryable });
    }
  },
});

// Auth emails carry one-time URLs, so the data is passed straight to the action and never persisted.
export const reserveTransactional = internalMutation({
  args: { userId: v.optional(v.string()), to: v.string(), type: v.string(), dedupeKey: v.string() },
  handler: async (ctx, { userId, to, type, dedupeKey }) => {
    return ctx.db.insert("emailEvents", { userId, emailType: type, category: "transactional", recipient: to, dedupeKey, status: "queued", attempts: 0, scheduledAt: Date.now(), createdAt: Date.now() });
  },
});

export const deliverTransactional = internalAction({
  args: { userId: v.optional(v.string()), to: v.string(), type: v.union(v.literal("welcome"), v.literal("verify-email"), v.literal("reset-password"), v.literal("account-deleted")), data: v.any(), dedupeKey: v.string() },
  handler: async (ctx, { userId, to, type, data, dedupeKey }) => {
    const eventId = await ctx.runMutation(internal.email.send.reserveTransactional, { userId, to, type, dedupeKey });
    const cfg = emailConfig();
    if (!cfg) {
      console.warn(`email ${type}: RESEND_API_KEY not configured, not sent`);
      await ctx.runMutation(internal.email.send.markFailed, { eventId, error: "email not configured", retryable: false });
      return;
    }
    try {
      const { id } = await sendViaResend(cfg, buildMail({ emailType: type, recipient: to, dedupeKey, category: "transactional", metadata: undefined }, undefined, process.env.SITE_URL ?? "", data));
      await ctx.runMutation(internal.email.send.markSent, { eventId, providerMessageId: id });
      console.log(`email sent type=${type} resend=${id}`);
    } catch (e) {
      const err = e as Error;
      console.error(`email failed type=${type}: ${err.message}`);
      await ctx.runMutation(internal.email.send.markFailed, { eventId, error: err.message, retryable: false });
    }
  },
});

// Owner-facing log for the settings page.
export const recentForUser = internalQuery({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit = 20 }) =>
    (await ctx.db.query("emailEvents").withIndex("by_user_time", (q) => q.eq("userId", userId)).order("desc").take(limit)).map((e) => ({
      _id: e._id, emailType: e.emailType, category: e.category, status: e.status, createdAt: e.createdAt, sentAt: e.sentAt, error: e.error,
    })),
});
