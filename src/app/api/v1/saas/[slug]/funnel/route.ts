import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options, withApi } from "@/lib/api/respond";
import { funnelDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
const TIMEFRAMES = ["7d", "30d", "90d"] as const;

// Public funnel: only stages the owner shares; each stage carries its own provenance.
export const GET = withApi("funnel", async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const tf = new URL(req.url).searchParams.get("timeframe") ?? "30d";
  if (!(TIMEFRAMES as readonly string[]).includes(tf)) return fail("bad_request", `timeframe must be one of ${TIMEFRAMES.join(", ")}`, 400);
  const f = await fetchQuery(api.public.funnel, { slug, timeframe: tf as (typeof TIMEFRAMES)[number] });
  if (!f) return fail("not_found", `No public SaaS with slug "${slug}"`, 404);
  return ok(funnelDto(f));
});
