import type { Metadata } from "next";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { BOARD_META } from "@/lib/boards";
import { categoryLabel } from "@/lib/categories";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const s = parseBoard(await searchParams, { board: "most-new" });
  const meta = BOARD_META[s.board];
  const title = `${meta.label}${s.category ? ` · ${categoryLabel(s.category)}` : ""} · ${s.window}`;
  return { title, description: `SaaS leaderboard — ${meta.blurb}`, alternates: { canonical: `${SITE_URL}/leaderboard` } };
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = parseBoard(await searchParams, { board: "most-new" });
  return (
    <BoardPage
      state={state}
      base="/leaderboard"
      title="Who is gaining users right now"
      intro="Growth, not size. Every number is pulled read-only from a connected source every 4 hours; self-reported products are labelled and never ranked."
      related={[{ href: "/trending", label: "Trending" }, { href: "/fastest-growing-saas", label: "Fastest growing" }, { href: "/new-saas", label: "New on UserTrack" }, { href: "/compare", label: "Compare" }]}
    />
  );
}
