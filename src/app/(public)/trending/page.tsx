import type { Metadata } from "next";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Trending SaaS right now",
  description: "SaaS products gaining meaningful traction right now — ranked by the UserTrack Trending Score (new users × growth × acceleration × trust × freshness × history), not by size.",
  alternates: { canonical: `${SITE_URL}/trending` },
};

export default async function TrendingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = parseBoard(await searchParams, { board: "trending", window: "7d" });
  return (
    <BoardPage
      state={{ ...state, board: "trending" }}
      base="/trending"
      lockBoard
      eyebrow={`Trending · ${state.window}`}
      title="Trending SaaS right now"
      intro="Which products are picking up real momentum this week. The score rewards new verified users, relative growth and acceleration — and discounts low-confidence sources."
      related={[{ href: "/leaderboard", label: "Leaderboard" }, { href: "/fastest-growing-saas", label: "Fastest growing" }, { href: "/new-saas", label: "New & rising" }]}
    >
      <Panel id="how" className="mt-10 p-5">
        <SectionLabel>How the trending score works</SectionLabel>
        <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
          <div className="font-mono text-[13px] leading-relaxed">
            score = 100 · <span className="text-pink">volume</span> · growth · acceleration · trust · activation · freshness · history<br />
            volume = log10(1 + new_users)<sup>1.5</sup><br />
            growth = 1 + min(new_users / max(base, 50), 2)<br />
            acceleration = 1 + 0.5 · clamp((new − prev) / max(prev, 10), −0.5, 2)<br />
            trust = 0.5 + 0.5 · trust_score / 100<br />
            activation = 1 + 0.25 · activation_rate<br />
            freshness = 1 while synced ≤ 24h ago → 0.5 at 72h → 0 after<br />
            history = 0.6 + 0.4 · min(1, tracked_days / 14)
          </div>
          <p className="text-muted-foreground">
            Absolute new users are the dominant term, log-dampened so a 100k-user product does not automatically win. Relative growth uses a 50-user floor so a product going 1 → 5 cannot top the board. Acceleration compares this window with the previous one. Trust discounts, never boosts. Freshness fades a source that stops syncing; history needs two weeks of continuous verified data for full weight. No signal (score 0) when there are fewer than 5 new users in the window, the source is stale for more than 72 hours, or the data is under review. Recomputed every 4 hours.
          </p>
        </div>
      </Panel>
    </BoardPage>
  );
}
