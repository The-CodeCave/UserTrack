import type { Metadata } from "next";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "SaaS with the most new users",
  description: "SaaS products ranked by absolute verified new users — today, this week and this month.",
  alternates: { canonical: `${SITE_URL}/most-new-users` },
};

export default async function MostNewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = parseBoard(await searchParams, { board: "most-new" });
  return (
    <BoardPage
      state={{ ...state, board: "most-new" }}
      base="/most-new-users"
      lockBoard
      title={`Most new users ${state.window === "24h" ? "today" : state.window === "7d" ? "this week" : "this month"}`}
      intro="Absolute verified new users in the window. Size-neutral growth pages: see Fastest growing and Trending."
      related={[{ href: "/fastest-growing-saas", label: "Fastest growing" }, { href: "/trending", label: "Trending" }]}
    />
  );
}
