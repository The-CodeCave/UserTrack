import type { Metadata } from "next";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "New SaaS on UserTrack",
  description: "Recently listed SaaS products, ranked by their first week of verified user growth. Discover new tools before they hit the main leaderboard.",
  alternates: { canonical: `${SITE_URL}/new-saas` },
};

export default async function NewSaasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = parseBoard(await searchParams, { board: "new-rising", window: "7d" });
  return (
    <BoardPage
      state={{ ...state, board: "new-rising", window: "7d" }}
      base="/new-saas"
      lockBoard
      eyebrow="New & rising · last 30 days"
      title="New on UserTrack"
      intro="Products that started tracking in the last 30 days, ranked by new users in the last 7 days."
      related={[{ href: "/trending", label: "Trending" }, { href: "/leaderboard", label: "Leaderboard" }]}
    />
  );
}
