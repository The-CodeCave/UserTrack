import { renderBoardOg } from "@/lib/og/board";
import { OG_SIZE } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Hidden gem SaaS";
export const revalidate = 300;

export default async function Image() {
  return renderBoardOg({
    board: "hidden-gems",
    window: "7d",
    eyebrow: "Hidden gems · 7d",
    path: "/hidden-gems",
    title: "Hidden gem SaaS",
    sub: "Small products under 1,000 users with unusually strong, verified weekly growth.",
  });
}
