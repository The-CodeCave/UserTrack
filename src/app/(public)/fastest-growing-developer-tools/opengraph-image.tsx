import { renderBoardOg } from "@/lib/og/board";
import { OG_SIZE } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Fastest growing developer tools";
export const revalidate = 300;

export default async function Image() {
  return renderBoardOg({
    board: "fastest",
    window: "30d",
    category: "developer-tools",
    eyebrow: "Developer tools · fastest growing",
    path: "/fastest-growing-developer-tools",
    title: "Fastest growing developer tools",
    sub: "Which dev tools are actually gaining users — from connected sources, not press releases.",
  });
}
