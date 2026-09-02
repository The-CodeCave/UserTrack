import { renderBoardOg } from "@/lib/og/board";
import { OG_SIZE } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "New SaaS on UserTrack";
export const revalidate = 300;

export default async function Image() {
  return renderBoardOg({
    board: "new-rising",
    window: "7d",
    eyebrow: "New & rising · 30 days",
    path: "/new-saas",
    title: "New on UserTrack",
    sub: "Products that started tracking in the last 30 days, ranked by new users this week.",
  });
}
