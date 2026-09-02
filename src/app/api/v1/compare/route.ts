import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options, withApi } from "@/lib/api/respond";
import { compareDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";
export const OPTIONS = options;
const DAYS = [7, 30, 90, 365, 0] as const;

// GET /compare?s=a,b,c&days=30 — up to four public products, absolute + indexed (100 at window start) series.
export const GET = withApi("compare", async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const slugs = (q.get("s") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (slugs.length < 2 || slugs.length > 4) return fail("bad_request", "s must list 2 to 4 slugs, comma separated", 400);
  const daysRaw = q.get("days");
  const days = daysRaw === null ? 30 : daysRaw === "all" ? 0 : Number(daysRaw);
  if (!(DAYS as readonly number[]).includes(days)) return fail("bad_request", "days must be one of 7, 30, 90, 365, all", 400);
  const items = await fetchQuery(api.public.compare, { slugs, days: days as (typeof DAYS)[number] });
  if (items.length < 2) return fail("not_found", "Fewer than two of the requested products are public", 404);
  return ok(compareDto(items, days));
});
