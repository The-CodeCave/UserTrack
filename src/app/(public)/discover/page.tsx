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
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { StackChip } from "@/components/public/stack-chip";
import { normalizeStackEntry, techLabel } from "@/lib/tech-stack";
import { formatCompact, formatDelta, formatPct, timeAgo } from "@/lib/format";
import { SITE_URL, saasUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
type Search = Promise<{ category?: string | string[]; stack?: string | string[] }>;

// `?category=` narrows to a category, `?stack=` to products built with one technology (canonical page: /stacks/<slug>).
async function filtersOf(searchParams: Search) {
  const sp = await searchParams;
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const c = one(sp.category);
  const st = one(sp.stack);
  return { category: c && CATEGORIES.some((x) => x.slug === c) ? c : undefined, stack: st ? normalizeStackEntry(st) : undefined };
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { category, stack } = await filtersOf(searchParams);
  const what = stack ? `SaaS built with ${techLabel(stack)}` : CATEGORIES.find((c) => c.slug === category)?.seo;
  const title = what ? `Discover ${what}` : "Discover SaaS";
  const description = `Search and discover ${what ?? "SaaS products"} by growth: trending now, fastest growing today, this week and this month, new and rising, hidden gems, biggest movers${what ? "" : ", mobile apps, developer tools and AI"}.`;
  const url = stack ? `${SITE_URL}/stacks/${stack}` : `${SITE_URL}/discover${category ? `?category=${category}` : ""}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url } };
}

const growth24h = (s: SaasRow) => (s.totalUsers - s.newUsers24h > 0 ? (s.newUsers24h / (s.totalUsers - s.newUsers24h)) * 100 : 0);
const chip = "inline-flex shrink-0 items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors";

export default async function DiscoverPage({ searchParams }: { searchParams: Search }) {
  const { category, stack } = await filtersOf(searchParams);
  const d = await fetchQuery(api.public.discover, { category, stack });
  const g = d.hiddenGemRules;
  const n = d.newRisingRules;
  const q = category ? `?category=${category}` : "";
  const gemRule = `Under ${formatCompact(g.maxUsers)} users · ≥${g.minNew7d} new this week · ≥${g.minGrowth7dPct}% weekly growth · ${g.minHistoryDays}+ days verified history · trust ≥ ${g.minTrustScore}`;
  const newRule = `Listed in the last ${n.maxAgeDays} days · ≥${n.minNew7d} new users this week · ranked by 7-day new users`;
  type Section = { key: string; title: string; href: string; rows: SaasRow[]; note?: string; metric?: (s: SaasRow) => { label: string; value: string } };
  const sections: Section[] = ([
    { key: "trending", title: "Trending now", href: `/trending${q}`, rows: d.trending, metric: (s) => ({ label: "7d", value: formatDelta(s.newUsers7d) }) },
    { key: "today", title: "Fastest growing today", href: `/fastest-growing-saas?window=24h${category ? `&category=${category}` : ""}`, rows: d.fastestToday, metric: (s) => ({ label: "growth 24h", value: formatPct(growth24h(s)) }) },
    { key: "week", title: "Fastest growing this week", href: `/fastest-growing-saas?window=7d${category ? `&category=${category}` : ""}`, rows: d.fastestWeek, metric: (s) => ({ label: "growth 7d", value: formatPct(s.growth7dPct ?? 0) }) },
    { key: "month", title: "Fastest growing this month", href: `/fastest-growing-saas${q}`, rows: d.fastestMonth, metric: (s) => ({ label: "growth 30d", value: formatPct(s.growth30dPct) }) },
    { key: "new", title: "New & rising", href: `/new-saas${q}`, rows: d.newest, note: newRule },
    { key: "gems", title: "Hidden gems", href: `/hidden-gems${q}`, rows: d.hiddenGems, note: gemRule, metric: (s) => ({ label: "growth 7d", value: formatPct(s.growth7dPct ?? 0) }) },
    { key: "movers", title: "Biggest movers", href: `/biggest-movers${q}`, rows: d.movers, note: "Leaderboard position 7 days ago → today, from stored daily rank history", metric: (s) => ({ label: "7d", value: `#${s.rank7dAgo ?? "—"} → #${s.rank ?? "—"}` }) },
    { key: "verified", title: "Recently verified", href: `/leaderboard${q}`, rows: d.recentlyVerified, metric: (s) => ({ label: "verified", value: s.verifiedAt ? timeAgo(s.verifiedAt) : "—" }) },
    { key: "mobile", title: "Popular mobile apps", href: "/fastest-growing-mobile-apps", rows: d.mobile, metric: (s) => ({ label: "30d", value: formatDelta(s.newUsers30d) }) },
    { key: "dev", title: "Top developer tools", href: "/fastest-growing-developer-tools", rows: d.devTools, metric: (s) => ({ label: "30d", value: formatDelta(s.newUsers30d) }) },
    { key: "ai", title: "Top AI SaaS", href: "/fastest-growing-ai-saas", rows: d.ai, metric: (s) => ({ label: "30d", value: formatDelta(s.newUsers30d) }) },
  ] as Section[]).filter((s) => s.rows.length > 0);
  const jsonLd = d.trending.length > 0 && {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Trending ${category ? `${categoryLabel(category)} ` : ""}SaaS right now`,
    url: `${SITE_URL}/discover${q}`,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: d.trending.length,
    itemListElement: d.trending.map((s, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "SoftwareApplication", name: s.name, url: saasUrl(s.slug), applicationCategory: categoryLabel(s.category) } })),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      <SectionLabel>Discover{category ? ` · ${categoryLabel(category)}` : ""}{stack ? ` · ${techLabel(stack)}` : ""}</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{stack ? `SaaS built with ${techLabel(stack)} that is actually growing` : category ? `${categoryLabel(category)} SaaS that is actually growing` : "Find SaaS that is actually growing"}</h1>
      {stack && <div className="mt-3 flex flex-wrap items-center gap-2"><StackChip slug={stack} /><Link href="/discover" className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">Clear</Link></div>}
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Search by product, founder, category or tag. Everything below is computed from verified snapshots — no editorial picks.</p>
      <div className="mt-6"><SearchBox /></div>

      {d.categories.length > 0 && (
        <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <Link href="/discover" className={cn(chip, !category ? "border-pink text-pink" : "border-line hover:border-pink hover:text-pink")}>All</Link>
          {d.categories.map((c) => (
            <Link key={c.slug} href={`/discover?category=${c.slug}`} className={cn(chip, category === c.slug ? "border-pink text-pink" : "border-line hover:border-pink hover:text-pink")}>
              {c.label} <span className="text-muted-foreground">{c.count}</span>
            </Link>
          ))}
        </div>
      )}

      <p className="mt-4 font-mono text-[11px] text-muted-foreground">
        Every list is computed from read-only snapshots of connected sources, refreshed every 4 hours{d.updatedAt ? ` · Updated ${timeAgo(d.updatedAt)}` : ""}. Methodology:{" "}
        <Link href="/trending#how" className="underline underline-offset-4 hover:text-foreground">trending</Link> ·{" "}
        <Link href="/hidden-gems#methodology" className="underline underline-offset-4 hover:text-foreground">hidden gems</Link> ·{" "}
        <Link href="/biggest-movers#methodology" className="underline underline-offset-4 hover:text-foreground">movers</Link> ·{" "}
        <Link href="/rankings" className="underline underline-offset-4 hover:text-foreground">monthly archive</Link>
      </p>

      {sections.length === 0 && d.feed.length === 0 && (
        <Panel className="mt-10 p-8 text-center text-sm text-muted-foreground">{category ? `No verified ${categoryLabel(category)} product has a week of history yet.` : "Discovery sections appear once verified products have a week of history."}</Panel>
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
            <span className="font-mono text-[11px] text-muted-foreground">Milestones, spikes, launches, rank jumps, traction and benchmarks</span>
          </div>
          <div className="mt-3"><DiscoveryFeed items={d.feed} /></div>
        </section>
      )}
    </div>
  );
}
