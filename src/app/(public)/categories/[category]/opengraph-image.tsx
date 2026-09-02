import { renderBoardOg } from "@/lib/og/board";
import { OG_SIZE } from "@/lib/og/frame";
import { CATEGORIES } from "@/lib/categories";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "SaaS category leaderboard on UserTrack";
export const revalidate = 300;

export default async function Image({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const c = CATEGORIES.find((x) => x.slug === category);
  return renderBoardOg({
    board: "most-new",
    window: "30d",
    category: c?.slug,
    eyebrow: `${c?.label ?? "Category"} · 30 days`,
    title: `Top ${c?.label ?? "SaaS"} by user growth`,
    sub: `The fastest growing ${c?.seo ?? "SaaS"} on UserTrack, ranked by verified new users from connected sources.`,
    path: `/categories/${category}`,
  });
}
