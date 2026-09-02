import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options, withApi } from "@/lib/api/respond";
import { engagementDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

export const GET = withApi("engagement", async (_req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const s = await fetchQuery(api.public.saasBySlug, { slug });
  if (!s) return fail("not_found", `No public SaaS with slug "${slug}"`, 404);
  return ok(engagementDto(s));
});
