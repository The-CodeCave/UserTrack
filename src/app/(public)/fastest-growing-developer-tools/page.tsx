import type { Metadata } from "next";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
const title = "Fastest growing developer tools";
const description = "Developer tools ranked by verified user growth. Which dev tools are actually gaining users — from connected auth and database sources, not launch posts.";
export const metadata: Metadata = { title, description, alternates: { canonical: `${SITE_URL}/fastest-growing-developer-tools` }, openGraph: { title, description, url: `${SITE_URL}/fastest-growing-developer-tools` } };

export default async function FastestDevToolsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = parseBoard(await searchParams, { board: "fastest", category: "developer-tools" });
  return (
    <BoardPage
      state={{ ...state, board: "fastest", category: "developer-tools" }}
      base="/fastest-growing-developer-tools"
      lockBoard
      lockCategory
      eyebrow={`Developer tools · fastest growing · ${state.window}`}
      title="Fastest growing developer tools"
      intro="Developer tools ranked by verified percentage user growth in the selected window. Every listing syncs its user count read-only from Clerk, Supabase, Firebase, Auth0 or its own domain, so the growth you see is the growth that happened."
      methodology={{
        title: "How this ranking is computed",
        body: (
          <>
            <p>Growth is new users in the window divided by the user base at the start of the window. Products need at least 10 new verified users in the window to be listed, which keeps 1 → 5 stories off the top. Ties break on new users, then total users.</p>
            <p>Only verified sources count; self-reported numbers are labelled and never ranked, and data under review is excluded until the next review. Recomputed every 4 hours after each sync cycle.</p>
          </>
        ),
      }}
      related={[{ href: "/categories/developer-tools", label: "All developer tools" }, { href: "/fastest-growing-saas", label: "All categories" }, { href: "/fastest-growing-ai-saas", label: "Fastest growing AI" }, { href: "/trending", label: "Trending" }]}
    />
  );
}
