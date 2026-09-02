import type { Metadata } from "next";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Best signup to converted rate",
  description: "SaaS products with the highest verified signup → converted rate. Only products that chose to publish their conversion rate are listed; user counts, never revenue.",
  alternates: { canonical: `${SITE_URL}/best-conversion` },
};

export default async function BestConversionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = parseBoard(await searchParams, { board: "best-conversion" });
  return (
    <BoardPage
      state={{ ...state, board: "best-conversion" }}
      base="/best-conversion"
      lockBoard
      title="Best Signup → Converted"
      intro="Converted users ÷ total users, from a connected conversion source. Products need at least 50 users and must have published their conversion rate — connecting a source alone never lists you here."
      related={[{ href: "/leaderboard?board=best-trial-conversion", label: "Best Trial → Converted" }, { href: "/leaderboard?board=converted-growth", label: "Fastest growing converted users" }, { href: "/leaderboard?board=activation-rate", label: "Highest activation rate" }]}
    />
  );
}
