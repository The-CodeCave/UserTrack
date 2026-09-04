import type { Metadata } from "next";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Fastest growing SaaS",
  description: "The fastest growing SaaS products by verified percentage user growth — today, this week and this month. Live data from connected auth providers.",
  alternates: { canonical: `${SITE_URL}/fastest-growing-saas` },
};

export default async function FastestPage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = parseBoard(await searchParams, { board: "fastest" });
  return (
    <BoardPage
      state={{ ...state, board: "fastest" }}
      base="/fastest-growing-saas"
      lockBoard
      title={`Fastest growing SaaS ${state.window === "24h" ? "today" : state.window === "7d" ? "this week" : "this month"}`}
      intro="Ranked by percentage growth of verified user counts. Products need at least 10 new users in the window so tiny bases don't dominate."
      related={[{ href: "/fastest-growing-ai-saas", label: "Fastest growing AI SaaS" }, { href: "/most-new-users", label: "Most new users" }, { href: "/trending", label: "Trending" }]}
    />
  );
}
