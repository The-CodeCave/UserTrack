import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options } from "@/lib/api/respond";
import { limit } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

// Widget refresh payload: public numbers only, visibility applied, cached a minute. Shares the per-IP `embed` limit with the iframe.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const rl = await limit(req, "embed");
  if (!rl.allowed) return fail("rate_limited", `Burst limit of ${rl.limit} requests per minute exceeded`, 429, { "Retry-After": String(rl.retryAfterSec) });
  const slug = (await params).slug.replace(/\.json$/i, "");
  const data = await fetchQuery(api.public.widget, { slug });
  if (!data) return fail("not_found", "Unknown or private project", 404);
  return ok(data, {}, "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
}

export const OPTIONS = options;
