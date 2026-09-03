import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { fail, ok, options, withApi } from "@/lib/api/respond";
import { bearer, gatewayAuth, STATUS, toFailure } from "@/lib/api/gateway";
import { feedItemDto, saasDto } from "@/lib/api/dto";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const OPTIONS = options;

// The API key owner's watchlist. Private to the key owner, never cached, never public: an API key is required.
export const GET = withApi("following", async (req: Request) => {
  const key = bearer(req);
  if (!key) return fail("unauthorized", "An API key is required: send Authorization: Bearer ut_api_… (create one at /app/developer). The watchlist is private to the key owner.", 401);
  const q = new URL(req.url).searchParams;
  const days = q.get("days") === null ? 30 : Number(q.get("days"));
  if (!Number.isInteger(days) || days < 1 || days > 90) return fail("bad_request", "days must be an integer between 1 and 90", 400);
  const limit = q.get("limit") === null ? 60 : Number(q.get("limit"));
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return fail("bad_request", "limit must be an integer between 1 and 200", 400);
  let w;
  try {
    w = await fetchQuery(api.gateway.following, { auth: gatewayAuth(key), days, limit });
  } catch (e) {
    const f = toFailure(e);
    if (!f) throw e;
    return fail(f.code, f.message, STATUS[f.code]);
  }
  return ok(
    {
      days: w.days,
      saas: w.saas.map((s) => ({ ...saasDto(s), via: s.via, followed: s.followed, rankMovement7d: s.rankMovement7d, trendingMovement7d: s.trendingMovement7d })),
      founders: w.founders.map((f) => ({ username: f.username, displayName: f.displayName, avatarUrl: f.avatarUrl, followers: f.followerCount, urls: { profile: `${SITE_URL}/u/${f.username}` } })),
      feed: w.feed.map((i) => ({ ...feedItemDto(i), via: i.via, founder: i.founder })),
    },
    { private: true },
    "private, no-store",
  );
});
