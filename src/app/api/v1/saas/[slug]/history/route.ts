import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options, withApi } from "@/lib/api/respond";
import { historySeriesDto } from "@/lib/api/dto";
import { RANGES, type Range } from "@/lib/format";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

export const GET = withApi("history", async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const range = new URL(req.url).searchParams.get("range") ?? "30d";
  if (!RANGES.includes(range as Range)) return fail("bad_request", `range must be one of ${RANGES.join(", ")}`, 400);
  const h = await fetchQuery(api.public.history, { slug, range: range as Range });
  if (!h) return fail("not_found", `No public SaaS with slug "${slug}"`, 404);
  return ok(historySeriesDto(h));
});
