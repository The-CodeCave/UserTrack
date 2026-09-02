import type { Metadata } from "next";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { ArrowRight } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { SearchBox } from "@/components/public/search-box";
import { MiniSaasCard, type SaasRow } from "@/components/public/saas-card";
import { MilestoneRow } from "@/components/public/milestones";
import { formatDelta, formatPct } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Discover SaaS",
  description: "Search and discover SaaS products by growth: trending now, fastest growing this week, new on UserTrack, hidden gems, top developer tools and AI products.",
  alternates: { canonical: `${SITE_URL}/discover` },
};

export default async function DiscoverPage() {
  const d = await fetchQuery(api.public.discover, {});
  type Section = { key: string; title: string; href: string; rows: SaasRow[]; metric?: (s: SaasRow) => { label: string; value: string } };
  const sections: Section[] = ([
    { key: "trending", title: "Trending now", href: "/trending", rows: d.trending, metric: (s) => ({ label: "7d", value: formatDelta(s.newUsers7d) }) },
    { key: "fastest", title: "Fastest growing this week", href: "/fastest-growing-saas?window=7d", rows: d.fastestWeek, metric: (s) => ({ label: "growth 7d", value: formatPct(s.growth7dPct ?? 0) }) },
    { key: "new", title: "New on UserTrack", href: "/new-saas", rows: d.newest },
    { key: "gems", title: "Hidden gems", href: "/fastest-growing-saas?window=7d&size=100-1k", rows: d.hiddenGems, metric: (s) => ({ label: "growth 7d", value: formatPct(s.growth7dPct ?? 0) }) },
    { key: "dev", title: "Top developer tools", href: "/categories/developer-tools", rows: d.devTools, metric: (s) => ({ label: "30d", value: formatDelta(s.newUsers30d) }) },
    { key: "ai", title: "Top AI SaaS", href: "/categories/ai", rows: d.ai, metric: (s) => ({ label: "30d", value: formatDelta(s.newUsers30d) }) },
  ] as Section[]).filter((s) => s.rows.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <SectionLabel>Discover</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Find SaaS that is actually growing</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Search by product, founder, category or tag. Everything below is computed from verified snapshots — no editorial picks.</p>
      <div className="mt-6"><SearchBox /></div>

      {sections.length === 0 && d.milestones.length === 0 && (
        <Panel className="mt-10 p-8 text-center text-sm text-muted-foreground">Discovery sections appear once verified products have a week of history.</Panel>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {sections.map((sec) => (
          <section key={sec.key}>
            <div className="flex items-end justify-between">
              <h2 className="text-lg font-semibold tracking-tight">{sec.title}</h2>
              <Link href={sec.href} className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">See all <ArrowRight className="size-3" /></Link>
            </div>
            <div className="mt-3 space-y-2">
              {sec.rows.map((s) => <MiniSaasCard key={s._id} s={s} metric={sec.metric?.(s)} />)}
            </div>
          </section>
        ))}
        {d.milestones.length > 0 && (
          <section className="lg:col-span-2">
            <h2 className="text-lg font-semibold tracking-tight">Recently crossed milestones</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {d.milestones.map((m) => <MilestoneRow key={m._id} m={m} slug={m.slug} name={m.name} compact />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
