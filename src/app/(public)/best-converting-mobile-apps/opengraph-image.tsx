import { renderBoardOg } from "@/lib/og/board";
import { OG_SIZE } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Best converting mobile apps";
export const revalidate = 300;

export default async function Image() {
  return renderBoardOg({
    board: "best-conversion",
    window: "30d",
    platform: "mobile",
    eyebrow: "Mobile · signup → converted",
    path: "/best-converting-mobile-apps",
    title: "Best converting mobile apps",
    sub: "Mobile apps with the highest published signup → converted rate. Users, never revenue.",
  });
}
