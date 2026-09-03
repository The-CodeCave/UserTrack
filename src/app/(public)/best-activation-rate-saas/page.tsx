import type { Metadata } from "next";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
const title = "SaaS with the best activation rate";
const description = "SaaS products ranked by verified activation rate: activated users ÷ total users from a connected product-analytics source. Minimum 50 users.";
export const metadata: Metadata = { title, description, alternates: { canonical: `${SITE_URL}/best-activation-rate-saas` }, openGraph: { title, description, url: `${SITE_URL}/best-activation-rate-saas` } };

export default async function BestActivationPage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = parseBoard(await searchParams, { board: "activation-rate" });
  return (
    <BoardPage
      state={{ ...state, board: "activation-rate", window: "30d" }}
      base="/best-activation-rate-saas"
      lockBoard
      eyebrow="Activation rate"
      title="Best activation rate"
      intro="Signups are cheap; activated users are not. This board ranks products by the share of all users who reached the product's own activation event, synced from a connected analytics source such as PostHog."
      methodology={{
        title: "How activation rate is computed",
        body: (
          <>
            <p>Activation rate is activated users divided by total users, both read from connected sources — the founder defines the activation event in their analytics tool, UserTrack only counts it. Products need at least 50 users and a connected activation source to be listed.</p>
            <p>Verified sources only; self-reported counts are never ranked. Recomputed every 4 hours after each sync cycle.</p>
          </>
        ),
      }}
      related={[{ href: "/leaderboard?board=most-activated", label: "Most activated users" }, { href: "/best-conversion", label: "Best Signup → Converted" }, { href: "/leaderboard", label: "Leaderboard" }]}
    />
  );
}
