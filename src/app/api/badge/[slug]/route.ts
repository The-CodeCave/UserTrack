import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { BADGE_TYPES, renderBadge, renderNotFoundBadge, type BadgeTheme, type BadgeType } from "@/lib/badge";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  "Access-Control-Allow-Origin": "*",
};

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug.replace(/\.svg$/i, "");
  const q = new URL(req.url).searchParams;
  const type = (BADGE_TYPES as string[]).includes(q.get("type") ?? "") ? (q.get("type") as BadgeType) : "users";
  const theme: BadgeTheme = q.get("theme") === "light" ? "light" : "dark";
  const s = await fetchQuery(api.public.saasBySlug, { slug });
  const svg = s
    ? renderBadge({ type, theme, name: s.name, totalUsers: s.totalUsers, newUsers30d: s.newUsers30d, growth30dPct: s.growth30dPct, trendingRank: s.trendingRank, trustLabel: s.trustLabel })
    : renderNotFoundBadge(theme);
  return new Response(svg, { headers: HEADERS });
}
