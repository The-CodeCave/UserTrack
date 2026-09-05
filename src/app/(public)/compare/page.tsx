import type { Metadata } from "next";
import Link from "next/link";
import { cachedQuery } from "@/lib/convex-public";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { CompareChart, COMPARE_COLORS } from "@/components/charts/compare-chart";
import { ComparePicker } from "@/components/public/compare-picker";
import { SaasLogo } from "@/components/public/saas-card";
import { ShareButtons } from "@/components/public/share-buttons";
import { formatCompact, formatDelta, formatPct, formatRate } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;

type Days = 7 | 30 | 90 | 365 | 0;
const WINDOWS: { days: Days; label: string; title: string }[] = [
  { days: 7, label: "7D", title: "last 7 days" }, { days: 30, label: "30D", title: "last 30 days" }, { days: 90, label: "90D", title: "last 90 days" }, { days: 365, label: "1Y", title: "last year" }, { days: 0, label: "ALL", title: "all history" },
];
const parse = (s?: string | string[]) => (Array.isArray(s) ? s.join(",") : s ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 4);
const parseDays = (d?: string): Days => (d === "all" ? 0 : (WINDOWS.find((w) => w.days && String(w.days) === d)?.days ?? 30));
const daysParam = (d: Days) => (d === 0 ? "all" : String(d));
const href = (slugs: string[], d: Days) => `/compare?s=${slugs.join(",")}&days=${daysParam(d)}`;
// Growth over the window: last total / first total − 1 (series is already cut to the window by the query).
const windowGrowth = (series: { total: number }[]) => (series.length >= 2 && series[0].total > 0 ? formatPct((series[series.length - 1].total / series[0].total - 1) * 100) : "—");

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ s?: string; days?: string }> }): Promise<Metadata> {
  const sp = await searchParams;
  const slugs = parse(sp.s);
  const days = parseDays(sp.days);
  const title = slugs.length ? `Compare ${slugs.join(" vs ")}` : "Compare SaaS growth";
  const description = "Compare user growth, activation and trending scores of up to four SaaS products side by side.";
  // Only set `images` when there is a live comparison — an explicit `undefined` would suppress the opengraph-image file.
  const images = slugs.length >= 2 ? { images: [`${SITE_URL}/compare/og?s=${slugs.join(",")}&days=${daysParam(days)}`] } : {};
  return { title, description, alternates: { canonical: `${SITE_URL}/compare` }, openGraph: { title, description, ...images }, twitter: { card: "summary_large_image", title, description, ...images } };
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ s?: string; days?: string }> }) {
  const sp = await searchParams;
  const slugs = parse(sp.s);
  const days = parseDays(sp.days);
  const win = WINDOWS.find((w) => w.days === days)!;
  const items = slugs.length ? await cachedQuery(api.public.compare, { slugs, days }) : [];
  const rows: { label: string; get: (s: (typeof items)[number]) => string; accent?: boolean }[] = [
    { label: "Total users", get: (s) => formatCompact(s.totalUsers), accent: true },
    { label: "New · 7d", get: (s) => formatDelta(s.newUsers7d) },
    { label: "New · 30d", get: (s) => formatDelta(s.newUsers30d) },
    { label: "Growth · 30d", get: (s) => formatPct(s.growth30dPct) },
    { label: `Growth · ${win.title}`, get: (s) => windowGrowth(s.series) },
    { label: "Activation rate", get: (s) => formatRate(s.activationRatePct) },
    { label: "Trending score · 7d", get: (s) => (s.trendingScore7d ? String(Math.round(s.trendingScore7d)) : "—") },
    { label: "Leaderboard rank", get: (s) => (s.rank ? `#${s.rank}` : "—") },
    { label: "Trending rank", get: (s) => (s.trendingRank ? `#${s.trendingRank}` : "—") },
  ];
  const current = items.map((i) => i.slug);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <SectionLabel>Compare</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Compare SaaS growth</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Up to four products on one chart. “Indexed” rebases every product to 100 at the start of the window so a 500-user product and a 50k-user product are comparable.</p>
      <div className="mt-6"><ComparePicker selected={items.map((i) => ({ slug: i.slug, name: i.name, logoUrl: i.logoUrl }))} days={days} /></div>

      {items.length === 0 ? (
        <Panel className="mt-8 p-8 text-center text-sm text-muted-foreground">Add products above, or start from the <Link href="/leaderboard" className="underline underline-offset-4">leaderboard</Link>.</Panel>
      ) : (
        <>
          <Panel className="mt-6 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>Users · {win.title}</SectionLabel>
              <div className="flex border border-line">
                {WINDOWS.map((w) => <Link key={w.days} href={href(current, w.days)} className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider ${days === w.days ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{w.label}</Link>)}
              </div>
            </div>
            <CompareChart items={items} days={days} />
          </Panel>
          <Panel className="mt-3 overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="p-3 text-left text-label font-normal">Metric</th>
                  {items.map((s, i) => (
                    <th key={s.slug} className="p-3 text-left font-normal">
                      <Link href={`/s/${s.slug}`} className="flex items-center gap-2 hover:underline">
                        <span className="h-0.5 w-3 shrink-0" style={{ background: COMPARE_COLORS[i] }} />
                        <SaasLogo name={s.name} logoUrl={s.logoUrl} size={24} />
                        <span className="font-medium">{s.name}</span>
                        <TrustBadge trust={s.trust} label={s.trustLabel} className="hidden md:inline-flex" />
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-line last:border-0">
                    <td className="p-3 text-label">{r.label}</td>
                    {items.map((s) => <td key={s.slug} className={`tabular p-3 font-mono ${r.accent ? "text-pink" : ""}`}>{r.get(s)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SectionLabel>Share this comparison</SectionLabel>
            <ShareButtons url={`${SITE_URL}${href(current, days)}`} text={`Comparing ${items.map((i) => i.name).join(" vs ")} on UserTrack`} kind="compare" />
          </div>
        </>
      )}
    </div>
  );
}
