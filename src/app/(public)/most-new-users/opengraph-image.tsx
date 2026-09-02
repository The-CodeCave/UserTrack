import { renderBoardOg } from "@/lib/og/board";
import { OG_SIZE } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "SaaS with the most new users";
export const revalidate = 300;

export default async function Image() {
  return renderBoardOg({
    board: "most-new",
    window: "30d",
    eyebrow: "Most new users · 30 days",
    path: "/most-new-users",
    title: "SaaS with the most new users",
    sub: "Absolute verified new users in the window. Size-neutral boards: trending and fastest growing.",
  });
}
