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
  const [d, feed] = await Promise.all([fetchQuery(api.public.discover, { category }), fetchQuery(api.public.feed, { limit, category })]);
  const rows = (list: typeof d.trending) => list.map((s) => ({ movement: s.movement ?? null, ...saasDto(s) }));
  return ok({
    category: d.category,
    sections: {
      trending: rows(d.trending),
      fastestToday: rows(d.fastestToday),
      fastestWeek: rows(d.fastestWeek),
      fastestMonth: rows(d.fastestMonth),
      newAndRising: rows(d.newest),
      recentlyVerified: rows(d.recentlyVerified),
      // Movement over 7 stored days (rank7dAgo → rank), never the previous 4-hour refresh.
      biggestMovers: d.movers.map((s) => ({ movement: s.movement ?? null, rank7dAgo: s.rank7dAgo, rankDelta7d: s.rankDelta7d, ...saasDto(s) })),
      hiddenGems: rows(d.hiddenGems),
      mobile: rows(d.mobile),
    },
    hiddenGemRules: d.hiddenGemRules,
    newRisingRules: d.newRisingRules,
    categories: d.categories.map((c) => ({ slug: c.slug, label: c.label, count: c.count })),
    feed: feed.map(feedItemDto),
    updatedAt: d.updatedAt === null ? null : new Date(d.updatedAt).toISOString(),
  });
});
