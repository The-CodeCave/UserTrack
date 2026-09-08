import { fetchMutation } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { limit, tooMany } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

const KINDS = ["bug", "idea", "question", "other"] as const;
type Kind = (typeof KINDS)[number];

// Anonymous feedback from the FAB on public pages. Signed-in founders call api.feedback.submit directly.
export async function POST(req: Request) {
  const rl = await limit(req, "feedback");
  if (!rl.allowed) return tooMany(rl, "Too many reports from this network — please try again in a few minutes.");
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const message = typeof body?.message === "string" ? body.message : "";
  const kind = KINDS.includes(body?.kind as Kind) ? (body!.kind as Kind) : "other";
  if (message.trim().length < 5) return new Response("Please describe what happened in a sentence or two", { status: 400 });
  const str = (k: string) => (typeof body?.[k] === "string" ? (body[k] as string) : undefined);
  try {
    await fetchMutation(api.feedback.submitAnonymous, {
      gateway: process.env.UT_GATEWAY_SECRET,
      kind,
      message,
      email: str("email"),
      path: str("path"),
      appVersion: str("appVersion"),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
  } catch (e) {
    console.error("[feedback]", e);
    return new Response("Could not send your report", { status: 502 });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
