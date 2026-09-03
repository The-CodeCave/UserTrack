import { renderBoardOg } from "@/lib/og/board";
import { OG_SIZE } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Biggest movers on the SaaS leaderboard";
export const revalidate = 300;

export default async function Image() {
  return renderBoardOg({
    board: "movers",
    window: "30d",
    eyebrow: "Biggest movers · 7d",
    path: "/biggest-movers",
    title: "Biggest movers this week",
    sub: "Largest 7-day climbs on the 30-day leaderboard, from stored daily rank history.",
  });
}
