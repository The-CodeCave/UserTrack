import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options, withApi } from "@/lib/api/respond";
import { cohortsDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// Cohort view built from pseudonymous identity links; counts are null when the owner publishes rates only.
export const GET = withApi("cohorts", async (_req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const c = await fetchQuery(api.cohorts.publicCohorts, { slug });
  if (!c) return fail("not_found", `No public SaaS with slug "${slug}"`, 404);
  return ok(cohortsDto(slug, c));
});
