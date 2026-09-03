import { renderBoardOg } from "@/lib/og/board";
import { OG_SIZE } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Best activation rate SaaS";
export const revalidate = 300;

export default async function Image() {
  return renderBoardOg({
    board: "activation-rate",
    window: "30d",
    eyebrow: "Activation rate",
    path: "/best-activation-rate-saas",
    title: "SaaS with the best activation rate",
    sub: "Activated ÷ total users from a connected activation source. Minimum 50 users.",
  });
}
