import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options, withApi } from "@/lib/api/respond";
import { conversionDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// Conversion metrics only when the owner published them; never amounts.
export const GET = withApi("conversion", async (_req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const s = await fetchQuery(api.public.saasBySlug, { slug });
  if (!s) return fail("not_found", `No public SaaS with slug "${slug}"`, 404);
  return ok(conversionDto(s));
});
