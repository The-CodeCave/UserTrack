import type { Metadata } from "next";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { ArrowRight } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { SearchBox } from "@/components/public/search-box";
import { MiniSaasCard, type SaasRow } from "@/components/public/saas-card";
import { DiscoveryFeed } from "@/components/public/discovery-feed";
import { formatCompact, formatDelta, formatPct, timeAgo } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Discover SaaS",
  description: "Search and discover SaaS products by growth: trending now, fastest growing today and this week, new and rising, biggest movers, hidden gems, top developer tools and AI products.",
  alternates: { canonical: `${SITE_URL}/discover` },
};

const growth24h = (s: SaasRow) => (s.totalUsers - s.newUsers24h > 0 ? (s.newUsers24h / (s.totalUsers - s.newUsers24h)) * 100 : 0);

export default async function DiscoverPage() {
  const d = await fetchQuery(api.public.discover, {});
  const g = d.hiddenGemRules;
  const gemRule = `Under ${formatCompact(g.maxUsers)} users · ≥${g.minNew7d} new this week · ≥${g.minGrowth7dPct}% weekly growth · ${g.minHistoryDays}+ days verified history · trust ≥ ${g.minTrustScore}`;
  type Section = { key: string; title: string; href: string; rows: SaasRow[]; note?: string; metric?: (s: SaasRow) => { label: string; value: string } };
  const sections: Section[] = ([
    { key: "trending", title: "Trending now", href: "/trending", rows: d.trending, metric: (s) => ({ label: "7d", value: formatDelta(s.newUsers7d) }) },
    { key: "today", title: "Fastest growing today", href: "/fastest-growing-saas?window=24h", rows: d.fastestToday, metric: (s) => ({ label: "growth 24h", value: formatPct(growth24h(s)) }) },
    { key: "week", title: "Fastest growing this week", href: "/fastest-growing-saas?window=7d", rows: d.fastestWeek, metric: (s) => ({ label: "growth 7d", value: formatPct(s.growth7dPct ?? 0) }) },
    { key: "new", title: "New & rising", href: "/new-saas", rows: d.newest },
    { key: "verified", title: "Recently verified", href: "/leaderboard", rows: d.recentlyVerified, metric: (s) => ({ label: "verified", value: s.verifiedAt ? timeAgo(s.verifiedAt) : "—" }) },
    { key: "movers", title: "Biggest movers", href: "/trending", rows: d.movers, metric: (s) => ({ label: "trending rank", value: s.movement?.delta ? `↑${s.movement.delta}` : "—" }) },
    { key: "gems", title: "Hidden gems", href: "/fastest-growing-saas?window=7d&size=100-1k", rows: d.hiddenGems, note: gemRule, metric: (s) => ({ label: "growth 7d", value: formatPct(s.growth7dPct ?? 0) }) },
    { key: "dev", title: "Top developer tools", href: "/categories/developer-tools", rows: d.devTools, metric: (s) => ({ label: "30d", value: formatDelta(s.newUsers30d) }) },
    { key: "ai", title: "Top AI SaaS", href: "/categories/ai", rows: d.ai, metric: (s) => ({ label: "30d", value: formatDelta(s.newUsers30d) }) },
  ] as Section[]).filter((s) => s.rows.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <SectionLabel>Discover</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Find SaaS that is actually growing</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Search by product, founder, category or tag. Everything below is computed from verified snapshots — no editorial picks.</p>
      <div className="mt-6"><SearchBox /></div>

      {d.categories.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {d.categories.map((c) => (
            <Link key={c.slug} href={`/categories/${c.slug}`} className="inline-flex items-center gap-1.5 border border-line px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors hover:border-pink hover:text-pink">
              {c.label} <span className="text-muted-foreground">{c.count}</span>
            </Link>
          ))}
        </div>
      )}

      {sections.length === 0 && d.feed.length === 0 && (
        <Panel className="mt-10 p-8 text-center text-sm text-muted-foreground">Discovery sections appear once verified products have a week of history.</Panel>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {sections.map((sec) => (
          <section key={sec.key} className="min-w-0">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">{sec.title}</h2>
              <Link href={sec.href} className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">See all <ArrowRight className="size-3" /></Link>
            </div>
            {sec.note && <p className="mt-1 font-mono text-[11px] text-muted-foreground">{sec.note}</p>}
            <div className="mt-3 space-y-2">
              {sec.rows.map((s) => <MiniSaasCard key={s._id} s={s} metric={sec.metric?.(s)} />)}
            </div>
          </section>
        ))}
      </div>

      {d.feed.length > 0 && (
        <section className="mt-10">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Latest activity</h2>
            <span className="font-mono text-[11px] text-muted-foreground">Milestones, spikes, launches and verifications</span>
          </div>
          <div className="mt-3"><DiscoveryFeed items={d.feed} /></div>
        </section>
      )}
    </div>
  );
}
