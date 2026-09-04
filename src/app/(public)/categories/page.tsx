import type { Metadata } from "next";
import Link from "next/link";
import { EMPTY_STATS, publicData, publicQuery } from "@/lib/convex-public";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { CATEGORIES } from "@/lib/categories";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;
export const metadata: Metadata = { title: "SaaS categories", description: "Browse SaaS user-growth leaderboards by category.", alternates: { canonical: `${SITE_URL}/categories` } };

export default async function CategoriesPage() {
  const stats = (await publicData(() => publicQuery(api.public.stats, {}))) ?? EMPTY_STATS;
  const counts = new Map(stats.categories.map((c) => [c.slug, c.count]));
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <SectionLabel>Categories</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Growth leaderboards by category</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Every category has its own trending, fastest-growing and most-users boards.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c) => (
          <Link key={c.slug} href={`/categories/${c.slug}`} className="group">
            <Panel className="flex h-full items-center justify-between p-4 transition-colors group-hover:border-line-strong">
              <div>
                <div className="font-medium">{c.label}</div>
                <div className="font-mono text-[11px] text-muted-foreground">/categories/{c.slug}</div>
              </div>
              <div className="font-mono text-sm text-pink">{counts.get(c.slug) ?? 0}</div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
