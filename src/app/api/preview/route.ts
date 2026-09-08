import { fetchAction } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { limit } from "@/lib/api/rate-limit";
import { toFailure } from "@/lib/api/gateway";

export const dynamic = "force-dynamic";

// The landing-page preview of a visitor's own site. This route owns the per-IP limit; Convex only sees the
// gateway secret, exactly like /api/feedback.
export async function POST(req: Request) {
  const rl = await limit(req, "preview");
  // One JSON envelope for every answer, including the limit: the only caller is a fetch(), never a form post.
  if (!rl.allowed) {
    return Response.json({ code: "rate_limited", message: "Too many previews from this network — try again in a little while." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), "Cache-Control": "no-store" } });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) return Response.json({ code: "bad_request", message: "Enter your website address" }, { status: 400 });
  try {
    const preview = await fetchAction(api.enrich.previewSite, { gateway: process.env.UT_GATEWAY_SECRET, url });
    return Response.json(preview, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const failure = toFailure(e);
    // Anything without a code is our bug, not the visitor's address: log it and answer with the neutral message.
    if (!failure) console.error("[preview]", e);
    const code = failure?.code ?? "upstream";
    return Response.json(
      { code, message: failure?.message ?? "Could not read that website" },
      { status: code === "bad_request" ? 400 : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
