import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options, withApi } from "@/lib/api/respond";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// Only the public benchmark statement (strong positions, cohort name, sample size) — never cohort members or raw deciles.
export const GET = withApi("benchmarks", async (_req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const s = await fetchQuery(api.public.saasBySlug, { slug });
  if (!s) return fail("not_found", `No public SaaS with slug "${slug}"`, 404);
  const h = await fetchQuery(api.public.benchmarkHighlight, { slug });
  return ok({ slug, highlight: h ? { statement: h.statement, metric: h.metric, cohort: h.cohort, percentile: h.percentile, sampleSize: h.sampleSize } : null, note: h ? undefined : "No public benchmark statement: the product is not verified, or it is not in the top quarter of any cohort with enough members." });
});
