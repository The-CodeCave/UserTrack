import type { Metadata } from "next";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;
const title = "Biggest movers on the SaaS leaderboard this week";
const description = "SaaS products that climbed the most places on the 30-day user-growth leaderboard in the last 7 days, computed from stored daily rank history.";
export const metadata: Metadata = { title, description, alternates: { canonical: `${SITE_URL}/biggest-movers` }, openGraph: { title, description, url: `${SITE_URL}/biggest-movers` } };

export default async function BiggestMoversPage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = parseBoard(await searchParams, { board: "movers" });
  return (
    <BoardPage
      state={{ ...state, board: "movers", window: "30d" }}
      base="/biggest-movers"
      lockBoard
      eyebrow="Biggest movers · 7d"
      title="Biggest movers this week"
      intro="Who climbed the leaderboard the most over the last seven days. Every move compares today's position with the stored position from exactly seven days ago — never the previous 4-hour refresh."
      methodology={{
        title: "How movers are computed",
        body: (
          <>
            <p>Each rerank appends every ranked product&apos;s position to an immutable daily rank history. A product&apos;s move is its position 7 days ago minus its position today on the 30-day &ldquo;most new users&rdquo; leaderboard; only climbs (positive moves) are listed, largest first, ties broken by the better current rank.</p>
            <p>Only verified, non-demo products with a current rank qualify. A product that was unranked a week ago shows as &ldquo;new&rdquo; and is not counted as a mover. Recomputed every 4 hours after each sync cycle; the first movers appear once seven days of history exist.</p>
          </>
        ),
      }}
      related={[{ href: "/leaderboard", label: "Leaderboard" }, { href: "/trending", label: "Trending" }, { href: "/hidden-gems", label: "Hidden gems" }, { href: "/rankings", label: "Monthly archive" }]}
    />
  );
}
