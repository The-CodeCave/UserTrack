import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { BADGE_TYPES, renderBadge, renderNotFoundBadge, type BadgeTheme, type BadgeType, type BadgeWindow } from "@/lib/badge";
import { serverTrack } from "@/lib/analytics-server";
import { limit, tooMany } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

// Public metrics only; cached at the edge for an hour, plus a per-IP limit (`badge`) against scrapers hammering uncached variants.
const HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const rl = await limit(req, "badge");
  if (!rl.allowed) return tooMany(rl);
  const slug = (await params).slug.replace(/\.svg$/i, "");
  const q = new URL(req.url).searchParams;
  const type = (BADGE_TYPES as string[]).includes(q.get("type") ?? "") ? (q.get("type") as BadgeType) : "users";
  const theme: BadgeTheme = q.get("theme") === "light" ? "light" : "dark";
  const window: BadgeWindow = q.get("window") === "7d" ? "7d" : "30d";
  const compact = q.get("compact") === "1";
  const s = await fetchQuery(api.public.saasBySlug, { slug });
  if (s) serverTrack(req, "badge_rendered", { type });
  const svg = s
    ? renderBadge({ type, theme, window, compact, name: s.name, totalUsers: s.totalUsers, newUsers7d: s.newUsers7d, newUsers30d: s.newUsers30d, growth7dPct: s.growth7dPct, growth30dPct: s.growth30dPct, trendingRank: s.trendingRank, trustLabel: s.trustLabel, spark: s.spark })
    : renderNotFoundBadge(theme);
  return new Response(svg, { status: s ? 200 : 404, headers: HEADERS });
}
