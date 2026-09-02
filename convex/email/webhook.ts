import { v } from "convex/values";
import { httpAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { verifySvixSignature } from "./webhookSig";

// Resend → Svix event envelope. Only the fields we use.
interface ResendEvent {
  type: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string; subType?: string; message?: string }; reason?: string };
}

export const handle = httpAction(async (ctx, req) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook not configured", { status: 503 });
  const body = await req.text();
  const ok = await verifySvixSignature(secret, { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") }, body);
  if (!ok) return new Response("invalid signature", { status: 401 });
  let event: ResendEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const to = Array.isArray(event.data?.to) ? event.data?.to[0] : event.data?.to;
  await ctx.runMutation(internal.email.webhook.record, {
    type: event.type,
    messageId: event.data?.email_id,
    recipient: typeof to === "string" ? to.toLowerCase() : undefined,
    bounceType: event.data?.bounce?.type,
    detail: event.data?.bounce?.message ?? event.data?.reason,
  });
  return new Response("ok", { status: 200 });
});

export const record = internalMutation({
  args: { type: v.string(), messageId: v.optional(v.string()), recipient: v.optional(v.string()), bounceType: v.optional(v.string()), detail: v.optional(v.string()) },
  handler: async (ctx, { type, messageId, recipient, bounceType, detail }) => {
    const now = Date.now();
    const event = messageId ? await ctx.db.query("emailEvents").withIndex("by_provider_message", (q) => q.eq("providerMessageId", messageId)).first() : null;
    const email = recipient ?? event?.recipient;
    const patchStatus = async (status: "delivered" | "bounced" | "complained" | "failed") => {
      if (event) await ctx.db.patch(event._id, { status, ...(status === "delivered" ? { deliveredAt: now } : { error: detail?.slice(0, 300) }) });
    };
    const setRecipient = async (status: "bounced" | "complained" | "suppressed", reason?: string) => {
      if (!email) return;
      const row = await ctx.db.query("emailRecipients").withIndex("by_email", (q) => q.eq("email", email)).unique();
      if (row) await ctx.db.patch(row._id, { status, reason, updatedAt: now });
      else await ctx.db.insert("emailRecipients", { email, status, reason, updatedAt: now });
    };
    switch (type) {
      case "email.delivered":
        await patchStatus("delivered");
        break;
      case "email.bounced": {
        await patchStatus("bounced");
        // Soft bounces (mailbox full, greylisting) do not suppress.
        if ((bounceType ?? "Permanent").toLowerCase() !== "transient") await setRecipient("bounced", detail?.slice(0, 200));
        break;
      }
      case "email.complained":
        await patchStatus("complained");
        await setRecipient("complained", "spam complaint");
        break;
      case "email.failed":
        await patchStatus("failed");
        break;
      default:
        break;
    }
    console.log(`resend webhook ${type} message=${messageId ?? "?"} matched=${Boolean(event)}`);
  },
});
