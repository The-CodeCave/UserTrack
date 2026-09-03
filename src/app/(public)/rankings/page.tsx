import type { Metadata } from "next";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { BOARD_META, periodLabel, rankingPath } from "@/lib/boards";
import { categoryLabel } from "@/lib/categories";
import { formatDate } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Monthly SaaS rankings archive",
  description: "Frozen monthly rankings of the fastest growing, most new users and trending SaaS products, overall and per category. Snapshotted on the 1st of each month from verified data and never rewritten.",
  alternates: { canonical: `${SITE_URL}/rankings` },
};

export default async function RankingsPage() {
  const periods = await fetchQuery(api.public.rankingPeriods, {});
  // Group by period, then one row per category with its available boards.
  const byPeriod = new Map<string, Map<string | null, typeof periods>>();
  for (const r of periods) {
    const cats = byPeriod.get(r.period) ?? new Map();
    cats.set(r.category, [...(cats.get(r.category) ?? []), r]);
    byPeriod.set(r.period, cats);
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <SectionLabel>Archive</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Monthly rankings</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Every month the live boards are frozen into a permanent snapshot: most new users, fastest growing and trending, overall and per category. Frozen rankings never change, so you can cite them.</p>

      {byPeriod.size === 0 && <Panel className="mt-8 p-8 text-center text-sm text-muted-foreground">Monthly rankings are frozen on the 1st of each month — the first archive appears after the first full month.</Panel>}

      <div className="mt-8 space-y-8">
        {[...byPeriod.entries()].map(([period, cats]) => (
          <section key={period}>
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">{periodLabel(period)}</h2>
              <span className="font-mono text-[11px] text-muted-foreground">Frozen {formatDate(Math.max(...[...cats.values()].flat().map((r) => r.computedAt)))}</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {[...cats.entries()].sort((a, b) => (a[0] === null ? -1 : b[0] === null ? 1 : a[0].localeCompare(b[0]))).map(([category, boards]) => (
                <Panel key={category ?? "all"} className="p-3">
                  <Link href={rankingPath(period, category)} className="font-medium hover:text-pink">{category ? categoryLabel(category) : "All categories"}</Link>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                    {boards.map((b) => <Link key={b.board} href={`${rankingPath(period, category)}${b.board === "most-new" ? "" : `?board=${b.board}`}`} className="hover:text-foreground">{BOARD_META[b.board]?.short ?? b.board} · {b.sampleSize}</Link>)}
                  </div>
                </Panel>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-12 border-t border-line pt-6">
        <SectionLabel>Live boards</SectionLabel>
        <div className="mt-3 flex flex-wrap gap-2">
          {[["/leaderboard", "Most new users"], ["/fastest-growing-saas", "Fastest growing"], ["/trending", "Trending"], ["/biggest-movers", "Biggest movers"], ["/categories", "Categories"]].map(([href, label]) => (
            <Link key={href} href={href} className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:border-line-strong hover:text-foreground">{label}</Link>
          ))}
        </div>
      </div>
    </div>
  );
}
