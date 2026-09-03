import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options, withApi } from "@/lib/api/respond";
import { benchmarkHistoryDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// Weekly benchmark standings, public projection: top-quarter positions only, and only when the owner publishes benchmarks.
export const GET = withApi("benchmark-history", async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const q = new URL(req.url).searchParams;
  const weeks = q.get("weeks") === null ? 26 : Number(q.get("weeks"));
  if (!Number.isInteger(weeks) || weeks < 4 || weeks > 52) return fail("bad_request", "weeks must be an integer between 4 and 52", 400);
  const h = await fetchQuery(api.public.benchmarkHistory, { slug, weeks });
  if (!h) return fail("not_found", "benchmark history not published: the product is private, unverified, a demo, or its owner hides benchmarks", 404);
  return ok(benchmarkHistoryDto(h));
});
