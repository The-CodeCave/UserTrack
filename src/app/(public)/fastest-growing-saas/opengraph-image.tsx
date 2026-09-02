import { renderBoardOg } from "@/lib/og/board";
import { OG_SIZE } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Fastest growing SaaS";
export const revalidate = 300;

export default async function Image() {
  return renderBoardOg({
    board: "fastest",
    window: "30d",
    eyebrow: "Fastest growing · 30 days",
    path: "/fastest-growing-saas",
    title: "Fastest growing SaaS",
    sub: "Ranked by verified percentage user growth. At least 10 new users in the window.",
  });
}
