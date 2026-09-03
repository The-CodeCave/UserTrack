import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { RANGES, type Range } from "@convex/lib/time";
import { fail, ok, options, withApi } from "@/lib/api/respond";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// Aggregate user growth across the founder's public projects (daily, forward-filled per project).
export const GET = withApi("users", async (req: Request, { params }: { params: Promise<{ username: string }> }) => {
  const { username } = await params;
  const range = (new URL(req.url).searchParams.get("range") ?? "30d") as Range;
  if (!(RANGES as readonly string[]).includes(range) || range === "24h") return fail("bad_request", `range must be one of ${RANGES.filter((r) => r !== "24h").join(", ")}`, 400);
  const h = await fetchQuery(api.public.founderHistory, { username: username.toLowerCase(), range });
  if (!h) return fail("not_found", `No founder with username "${username}"`, 404);
  return ok({
    username: username.toLowerCase(),
    range,
    projects: h.projects.map((p) => ({ slug: p.slug, name: p.name })),
    points: h.points.map((p) => ({ t: new Date(p.t).toISOString(), totalUsers: p.total, newUsers: p.delta, byProject: p.byProject })),
    method: "Daily totals summed across public projects; a project without a row for a day keeps its last known total (forward fill) and contributes 0 before its first day.",
  });
});
