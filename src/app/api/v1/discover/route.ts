import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options, withApi } from "@/lib/api/respond";
import { feedItemDto, saasDto } from "@/lib/api/dto";
import { CATEGORY_SLUGS } from "@/lib/categories";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// Discovery sections + the real, deduplicated activity feed.
export const GET = withApi("discover", async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const category = q.get("category") ?? undefined;
  if (category !== undefined && !CATEGORY_SLUGS.has(category)) return fail("bad_request", `category must be one of ${[...CATEGORY_SLUGS].join(", ")}`, 400);
  const limit = q.get("limit") === null ? 30 : Number(q.get("limit"));
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return fail("bad_request", "limit must be an integer between 1 and 100", 400);
  const [d, feed] = await Promise.all([fetchQuery(api.public.discover, {}), fetchQuery(api.public.feed, { limit, category })]);
  const rows = (list: typeof d.trending) => list.map((s) => ({ movement: s.movement ?? null, ...saasDto(s) }));
  return ok({
    sections: {
      trending: rows(d.trending),
      fastestToday: rows(d.fastestToday),
      fastestWeek: rows(d.fastestWeek),
      newAndRising: rows(d.newest),
      recentlyVerified: rows(d.recentlyVerified),
      biggestMovers: rows(d.movers),
      hiddenGems: rows(d.hiddenGems),
    },
    hiddenGemRules: d.hiddenGemRules,
    categories: d.categories.map((c) => ({ slug: c.slug, label: c.label, count: c.count })),
    feed: feed.map(feedItemDto),
  });
});
