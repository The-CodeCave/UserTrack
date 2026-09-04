import type { Metadata } from "next";
import { BoardPage, parseBoard, type SP } from "@/components/public/board-page";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;
const title = "Best converting mobile apps";
const description = "Mobile apps with the highest published signup → converted rate. Converted users ÷ registered users from a connected source — user counts, never revenue.";
export const metadata: Metadata = { title, description, alternates: { canonical: `${SITE_URL}/best-converting-mobile-apps` }, openGraph: { title, description, url: `${SITE_URL}/best-converting-mobile-apps` } };

export default async function BestConvertingMobilePage({ searchParams }: { searchParams: Promise<SP> }) {
  const state = parseBoard(await searchParams, { board: "best-conversion", platform: "mobile" });
  return (
    <BoardPage
      state={{ ...state, board: "best-conversion", platform: "mobile", window: "30d" }}
      base="/best-converting-mobile-apps"
      lockBoard
      lockPlatform
      eyebrow="Mobile · signup → converted"
      title="Best converting mobile apps"
      intro="Mobile apps ranked by the share of registered users who converted to a paid plan, from a connected billing or subscription source. Only apps whose founders chose to publish the rate are listed."
      methodology={{
        title: "How this ranking is computed",
        body: (
          <>
            <p>Conversion rate is converted users divided by total registered users. Apps need at least 50 users, a connected conversion source, and must have published the rate in their visibility settings — connecting a payment provider alone never lists an app here.</p>
            <p>Mobile apps only; hybrid products are ranked under the web boards with the platform filter. Counts, not revenue. Recomputed every 4 hours after each sync cycle.</p>
          </>
        ),
      }}
      related={[{ href: "/fastest-growing-mobile-apps", label: "Fastest growing mobile apps" }, { href: "/best-conversion", label: "Best converting SaaS" }, { href: "/leaderboard?board=best-trial-conversion", label: "Best Trial → Converted" }]}
    />
  );
}
