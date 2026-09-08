// In-app feedback and bug reports (the FAB). Signed-in founders write straight to Convex; anonymous visitors go
// through /api/feedback, which owns the per-IP rate limit and passes the gateway secret.
import { v } from "convex/values";
import { internalAction, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { feedbackKind } from "./schema";
import { getProfileForUser } from "./profiles";
import { requireGateway } from "./lib/gateway";
import { DEFAULT_REPLY_TO, emailConfig, sendViaResend } from "./email/resend";
import { esc } from "./email/templates/layout";

export const MIN_MESSAGE = 5;
export const MAX_MESSAGE = 4000;
const PER_HOUR = 10;
const HOUR = 3_600_000;

const trim = (s: string | undefined, max: number) => {
  const t = s?.trim();
  return t ? t.slice(0, max) : undefined;
};

const shared = {
  kind: feedbackKind,
  message: v.string(),
  email: v.optional(v.string()),
  path: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  appVersion: v.optional(v.string()),
};
type Shared = { kind: "bug" | "idea" | "question" | "other"; message: string; email?: string; path?: string; userAgent?: string; appVersion?: string };

async function insertFeedback(ctx: MutationCtx, args: Shared, who: { profileId?: Id<"profiles">; userId?: string }) {
  const message = args.message.trim();
  if (message.length < MIN_MESSAGE) throw new Error("Please describe what happened in a sentence or two");
  const id = await ctx.db.insert("feedback", {
    ...who,
    kind: args.kind,
    message: message.slice(0, MAX_MESSAGE),
    email: trim(args.email, 200),
    path: trim(args.path, 300),
    userAgent: trim(args.userAgent, 300),
    appVersion: trim(args.appVersion, 40),
    status: "new",
    at: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.feedback.notify, { id });
  return { id };
}

export const submit = mutation({
  args: shared,
  handler: async (ctx, args) => {
    const { user, profile } = await getProfileForUser(ctx);
    if (!user) throw new Error("Not signed in");
    if (profile) {
      const recent = await ctx.db
        .query("feedback")
        .withIndex("by_profile_time", (q) => q.eq("profileId", profile._id).gt("at", Date.now() - HOUR))
        .take(PER_HOUR);
      if (recent.length >= PER_HOUR) throw new Error(`Thanks — that is ${PER_HOUR} reports this hour. Please continue by email: ${DEFAULT_REPLY_TO}`);
    }
    return insertFeedback(ctx, args, { profileId: profile?._id, userId: user._id });
  },
});

export const submitAnonymous = mutation({
  args: { ...shared, gateway: v.optional(v.string()) },
  handler: async (ctx, { gateway, ...args }) => {
    requireGateway(gateway);
    return insertFeedback(ctx, args, {});
  },
});

export const load = internalQuery({
  args: { id: v.id("feedback") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;
    const profile = row.profileId ? await ctx.db.get(row.profileId) : null;
    return { ...row, founder: profile ? { username: profile.username, displayName: profile.displayName } : null };
  },
});

// Operator alert. Goes to one internal inbox, never to a user, so it skips the preference/dedupe machinery in email/send.ts.
export const notify = internalAction({
  args: { id: v.id("feedback") },
  handler: async (ctx, { id }) => {
    const cfg = emailConfig();
    if (!cfg) return;
    const row = await ctx.runQuery(internal.feedback.load, { id });
    if (!row) return;
    const to = process.env.FEEDBACK_EMAIL || DEFAULT_REPLY_TO;
    const from = row.founder ? `@${row.founder.username} (${row.founder.displayName})` : row.email || "anonymous";
    const lines = [row.message, "", `from: ${from}`, `kind: ${row.kind}`, `path: ${row.path ?? "-"}`, `email: ${row.email ?? "-"}`, `version: ${row.appVersion ?? "-"}`, `agent: ${row.userAgent ?? "-"}`];
    try {
      await sendViaResend(
        { ...cfg, replyTo: row.email || cfg.replyTo },
        {
          to,
          subject: `[UserTrack ${row.kind}] ${row.message.slice(0, 60).replace(/\s+/g, " ")}`,
          text: lines.join("\n"),
          html: `<pre style="font:14px/1.6 ui-monospace,monospace;white-space:pre-wrap">${esc(lines.join("\n"))}</pre>`,
          idempotencyKey: `feedback:${id}`,
        },
      );
    } catch (e) {
      // The report is already stored; a mail failure must not lose it.
      console.error("[feedback] notify failed", e);
    }
  },
});
