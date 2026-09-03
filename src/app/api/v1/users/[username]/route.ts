import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options, withApi } from "@/lib/api/respond";
import { founderMetricsDto, profileDto, saasDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

export const GET = withApi("users", async (_req: Request, { params }: { params: Promise<{ username: string }> }) => {
  const { username } = await params;
  const p = await fetchQuery(api.public.profileByUsername, { username: username.toLowerCase() });
  if (!p) return fail("not_found", `No founder with username "${username}"`, 404);
  return ok({ ...profileDto(p), metrics: founderMetricsDto(p.aggregates), saas: p.saas.map((s) => saasDto(s)) });
});
