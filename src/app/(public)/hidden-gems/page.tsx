import type { Metadata } from "next";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;
const title = "Hidden gem SaaS: small products with verified traction";
const description = "SaaS products under 1,000 users that gained at least 10 new users and 10% this week from a verified source. Small, real and growing — before anyone else notices.";
export const metadata: Metadata = { title, description, alternates: { canonical: `${SITE_URL}/hidden-gems` }, openGraph: { title, description, url: `${SITE_URL}/hidden-gems` } };

export default async function HiddenGemsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = parseBoard(await searchParams, { board: "hidden-gems", window: "7d" });
  return (
    <BoardPage
      state={{ ...state, board: "hidden-gems", window: "7d" }}
      base="/hidden-gems"
      lockBoard
      eyebrow="Hidden gems · 7d"
      title="Hidden gems"
      intro="Products that are still small but growing unusually fast this week, with enough verified history and trust to make the number believable. Ranked by 7-day growth, not by size or hype."
      methodology={{
        title: "How hidden gems are picked",
        body: (
          <>
            <p>A product qualifies when it has fewer than 1,000 users, gained at least 10 new users and grew at least 10% in the last 7 days, has 7 or more days of verified snapshot history, and holds a trust score of 60 or higher. The list is sorted by 7-day growth percentage; ties break on 30-day new users.</p>
            <p>Only read-only connected sources count (Clerk, Supabase, Firebase, Auth0 or a verified endpoint on the product&apos;s own domain). Self-reported numbers and data under review are excluded. Demo listings never appear. Recomputed every 4 hours after each sync cycle.</p>
          </>
        ),
      }}
      related={[{ href: "/new-saas", label: "New & rising" }, { href: "/fastest-growing-saas?window=7d", label: "Fastest growing · 7d" }, { href: "/biggest-movers", label: "Biggest movers" }, { href: "/discover", label: "Discover" }]}
    />
  );
}
