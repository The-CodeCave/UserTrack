import { renderBoardOg } from "@/lib/og/board";
import { OG_SIZE } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Fastest growing AI SaaS";
export const revalidate = 300;

export default async function Image() {
  return renderBoardOg({
    board: "fastest",
    window: "30d",
    category: "ai",
    eyebrow: "AI · fastest growing",
    path: "/fastest-growing-ai-saas",
    title: "Fastest growing AI SaaS",
    sub: "Which AI tools are actually gaining users — from connected sources, not press releases.",
  });
}
