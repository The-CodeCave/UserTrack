import { renderBoardOg } from "@/lib/og/board";
import { OG_SIZE } from "@/lib/og/frame";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Best signup to converted rate";
export const revalidate = 300;

export default async function Image() {
  return renderBoardOg({
    board: "best-conversion",
    window: "30d",
    eyebrow: "Signup → converted",
    path: "/best-conversion",
    title: "Best Signup → Converted",
    sub: "Converted users ÷ total users, from a connected conversion source. Users, never revenue.",
  });
}
