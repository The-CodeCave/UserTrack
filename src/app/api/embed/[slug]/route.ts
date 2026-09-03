import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options } from "@/lib/api/respond";
import { take } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

const BURST_PER_MINUTE = 120;

// Widget refresh payload: public numbers only, visibility applied, cached a minute. Same burst bucket policy as badges.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = take(`embed-json:${ip}`, Date.now(), BURST_PER_MINUTE);
  if (!rl.allowed) return fail("rate_limited", `Burst limit of ${BURST_PER_MINUTE} requests per minute exceeded`, 429, { "Retry-After": String(rl.retryAfterSec) });
  const slug = (await params).slug.replace(/\.json$/i, "");
  const data = await fetchQuery(api.public.widget, { slug });
  if (!data) return fail("not_found", "Unknown or private project", 404);
  return ok(data, {}, "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
}

export const OPTIONS = options;
