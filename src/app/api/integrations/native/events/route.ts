// Inbound lifecycle events from native SDKs (@usertrack/node, @usertrack/better-auth). Thin proxy: the signature is verified
// inside Convex with the integration secret; this route only forwards the raw body and the signature headers (never logs them).
import { fetchAction } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { EVENTS_PATH, HEADER_NONCE, HEADER_PROJECT, HEADER_SIGNATURE, HEADER_TIMESTAMP } from "@convex/lib/nativeProtocol";
import { take } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";
const MAX_BODY = 4_096;

export function eventsHandler(path: string) {
  return async function POST(req: Request) {
    const projectId = req.headers.get(HEADER_PROJECT) ?? "";
    if (!projectId || projectId.length > 64) return Response.json({ error: "missing project header" }, { status: 400 });
    const rl = take(`native-events:${projectId}`, Date.now(), 600);
    if (!rl.allowed) return Response.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
    const body = await req.text();
    if (body.length > MAX_BODY) return Response.json({ error: "body too large" }, { status: 413 });
    const r = await fetchAction(api.native.ingestEvent, {
      gateway: process.env.UT_GATEWAY_SECRET,
      projectId,
      body,
      path,
      headers: { timestamp: req.headers.get(HEADER_TIMESTAMP) ?? undefined, nonce: req.headers.get(HEADER_NONCE) ?? undefined, signature: req.headers.get(HEADER_SIGNATURE) ?? undefined },
    });
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status, headers: { "Cache-Control": "no-store" } });
    return Response.json({ ok: true, duplicate: r.duplicate }, { status: r.duplicate ? 200 : 202, headers: { "Cache-Control": "no-store" } });
  };
}

export const POST = eventsHandler(EVENTS_PATH);

export function GET() {
  return Response.json({ error: "POST signed lifecycle events here (see https://usertrack.dev/developers/integrations/native)" }, { status: 405 });
}
