import { renderBoardOg } from "@/lib/og/board";
import { OG_SIZE } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Fastest growing mobile apps";
export const revalidate = 300;

export default async function Image() {
  return renderBoardOg({
    board: "fastest",
    window: "30d",
    platform: "mobile",
    eyebrow: "Mobile · fastest growing",
    path: "/fastest-growing-mobile-apps",
    title: "Fastest growing mobile apps",
    sub: "Mobile apps ranked by verified registered-user growth.",
  });
}
