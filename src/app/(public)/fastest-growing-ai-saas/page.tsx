import type { Metadata } from "next";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Fastest growing AI SaaS",
  description: "AI SaaS products ranked by verified user growth. Which AI tools are actually gaining users — from connected sources, not press releases.",
  alternates: { canonical: `${SITE_URL}/fastest-growing-ai-saas` },
};

export default async function FastestAiPage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = parseBoard(await searchParams, { board: "fastest", category: "ai" });
  return (
    <BoardPage
      state={{ ...state, board: "fastest", category: "ai" }}
      base="/fastest-growing-ai-saas"
      lockBoard
      lockCategory
      eyebrow={`AI · fastest growing · ${state.window}`}
      title="Fastest growing AI SaaS"
      intro="AI products ranked by verified percentage user growth. Every listing syncs its user count read-only from Clerk, Supabase, Firebase, Auth0 or its own domain."
      related={[{ href: "/categories/ai", label: "All AI SaaS" }, { href: "/fastest-growing-saas", label: "All categories" }, { href: "/trending", label: "Trending" }]}
    />
  );
}
