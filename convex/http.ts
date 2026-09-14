import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { handle as resendWebhook } from "./email/webhook";
import { withVouchedClientIp } from "./lib/gateway";

const http = httpRouter();

authComponent.registerRoutes(http, (ctx) => {
  const auth = createAuth(ctx);
  return { ...auth, handler: async (req: Request) => auth.handler(await withVouchedClientIp(req)) };
});

http.route({ path: "/webhooks/resend", method: "POST", handler: resendWebhook });

// RFC 8058 one-click unsubscribe target (mail clients POST here); GET shows a plain confirmation page.
const unsubscribe = httpAction(async (ctx, req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ok = await ctx.runMutation(internal.email.prefs.unsubscribeByToken, { token });
  const site = process.env.SITE_URL ?? "";
  if (req.method === "POST") return new Response(ok ? "unsubscribed" : "invalid token", { status: ok ? 200 : 400 });
  const body = ok
    ? `<p>You will no longer receive growth and setup emails from UserTrack. Account and security messages still arrive.</p><p><a href="${site}/email/preferences?token=${encodeURIComponent(token)}">Fine-tune your preferences</a></p>`
    : `<p>This link is invalid or has expired.</p><p><a href="${site}/app/settings/notifications">Sign in to manage email preferences</a></p>`;
  return new Response(`<!doctype html><meta charset="utf-8"><title>UserTrack</title><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#0b0c0e;color:#f4f4f5;padding:40px;max-width:520px;margin:auto"><h1 style="font-size:20px">UserTrack email</h1>${body}</body>`, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
});
http.route({ path: "/email/unsubscribe", method: "POST", handler: unsubscribe });
http.route({ path: "/email/unsubscribe", method: "GET", handler: unsubscribe });

export default http;
