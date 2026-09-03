import type { Metadata } from "next";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
const title = "Fastest growing mobile apps";
const description = "Mobile apps ranked by verified registered-user growth. Real signups from connected auth backends — not store download estimates.";
export const metadata: Metadata = { title, description, alternates: { canonical: `${SITE_URL}/fastest-growing-mobile-apps` }, openGraph: { title, description, url: `${SITE_URL}/fastest-growing-mobile-apps` } };

export default async function FastestMobilePage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = parseBoard(await searchParams, { board: "fastest", platform: "mobile" });
  return (
    <BoardPage
      state={{ ...state, board: "fastest", platform: "mobile" }}
      base="/fastest-growing-mobile-apps"
      lockBoard
      lockPlatform
      eyebrow={`Mobile · fastest growing · ${state.window}`}
      title="Fastest growing mobile apps"
      intro="Mobile apps ranked by verified registered-user growth. Downloads are not users: every number here is a real account synced read-only from the app's auth backend, so the ranking reflects people who actually signed up."
      methodology={{
        title: "How this ranking is computed",
        body: (
          <>
            <p>Only products listed as mobile apps qualify (hybrid web + mobile products have their own filter). Growth is new registered users in the window divided by the base at the start of the window; at least 10 new verified users are required in the window.</p>
            <p>Sources are connected read-only (Clerk, Supabase, Firebase, Auth0 or a verified endpoint). Store links are shown but never used for counting. Recomputed every 4 hours after each sync cycle.</p>
          </>
        ),
      }}
      related={[{ href: "/best-converting-mobile-apps", label: "Best converting mobile apps" }, { href: "/fastest-growing-saas", label: "Fastest growing SaaS" }, { href: "/leaderboard?platform=mobile", label: "Mobile leaderboard" }, { href: "/discover", label: "Discover" }]}
    />
  );
}
