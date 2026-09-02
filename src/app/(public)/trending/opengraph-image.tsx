import { renderBoardOg } from "@/lib/og/board";
import { OG_SIZE } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Trending SaaS on UserTrack";
export const revalidate = 300;

export default async function Image() {
  return renderBoardOg({
    board: "trending",
    window: "7d",
    eyebrow: "Trending · this week",
    path: "/trending",
    title: "Trending SaaS right now",
    sub: "Momentum, not size: new users × growth × acceleration, discounted by trust and freshness.",
  });
}
