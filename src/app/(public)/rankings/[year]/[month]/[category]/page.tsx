import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cachedQuery } from "@/lib/convex-public";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { SaasLogo } from "@/components/public/saas-card";
import { BOARD_META, periodLabel, rankingPath } from "@/lib/boards";
import { CATEGORIES } from "@/lib/categories";
import { formatCompact, formatDate, formatDelta, formatPct } from "@/lib/format";
import { SITE_URL, saasUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

export const revalidate = 300;

const SNAPSHOT_BOARDS = ["most-new", "fastest", "trending"] as const;
type SnapshotBoard = (typeof SNAPSHOT_BOARDS)[number];
type Params = Promise<{ year: string; month: string; category: string }>;
type Search = Promise<{ board?: string | string[] }>;

// Resolves the route into (period, category, board) or null when the URL is malformed.
async function resolve(params: Params, searchParams?: Search) {
  const { year, month, category } = await params;
  const sp = await searchParams;
  const b = Array.isArray(sp?.board) ? sp.board[0] : sp?.board;
  if (!/^\d{4}$/.test(year) || !/^(0[1-9]|1[0-2])$/.test(month)) return null;
  if (category !== "all" && !CATEGORIES.some((c) => c.slug === category)) return null;
  const board: SnapshotBoard = SNAPSHOT_BOARDS.includes(b as SnapshotBoard) ? (b as SnapshotBoard) : "most-new";
  return { period: `${year}-${month}`, category: category === "all" ? undefined : category, board };
}

// "Fastest growing AI SaaS — August 2026"
function titleFor(board: SnapshotBoard, category: string | undefined, period: string) {
  const what = CATEGORIES.find((c) => c.slug === category)?.seo ?? "SaaS";
  const lead = board === "most-new" ? `Most new users · ${what}` : `${BOARD_META[board].label} ${what}`;
  return `${lead} — ${periodLabel(period)}`;
}

const valueFor = (board: SnapshotBoard, v: number) => (board === "fastest" ? formatPct(v) : board === "trending" ? v.toFixed(1) : formatDelta(v));
const valueLabel: Record<SnapshotBoard, string> = { "most-new": "New · 30d", fastest: "Growth · 30d", trending: "Score · 30d" };
const liveBoard: Record<SnapshotBoard, string> = { "most-new": "/leaderboard", fastest: "/fastest-growing-saas", trending: "/trending?window=30d" };

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const r = await resolve(params, searchParams);
  if (!r) return { title: "Not found" };
  const title = titleFor(r.board, r.category, r.period);
  const path = rankingPath(r.period, r.category);
  const canonical = `${SITE_URL}${path}${r.board === "most-new" ? "" : `?board=${r.board}`}`;
  const description = `${title}: frozen monthly ranking from verified user data, snapshotted on the 1st and never rewritten.`;
  return { title, description, alternates: { canonical }, openGraph: { title, description, url: canonical } };
}

export default async function RankingSnapshotPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const r = await resolve(params, searchParams);
  if (!r) notFound();
  const snap = await cachedQuery(api.public.rankingSnapshot, { period: r.period, board: r.board, category: r.category });
  if (!snap) notFound();
  const title = titleFor(r.board, r.category, r.period);
  const path = rankingPath(r.period, r.category);
  const catLabel = CATEGORIES.find((c) => c.slug === r.category)?.label;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    url: `${SITE_URL}${path}`,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: snap.rows.length,
    itemListElement: snap.rows.slice(0, 10).map((s) => ({ "@type": "ListItem", position: s.rank, item: { "@type": "SoftwareApplication", name: s.name, url: saasUrl(s.slug) } })),
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SectionLabel><Link href="/rankings" className="hover:text-foreground">Archive</Link> · {periodLabel(r.period)}</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">The {BOARD_META[r.board].label.toLowerCase()} board{catLabel ? ` for ${catLabel}` : ""} as it stood at the end of {periodLabel(r.period)}, computed from verified 30-day figures. {snap.sampleSize} products qualified.</p>
      <div className="mt-2 font-mono text-[11px] text-muted-foreground">Frozen on {formatDate(snap.computedAt)}</div>

      <div className="mt-6 flex border border-line w-max max-w-full overflow-x-auto">
        {SNAPSHOT_BOARDS.map((b) => (
          <Link key={b} href={`${path}${b === "most-new" ? "" : `?board=${b}`}`} className={cn("whitespace-nowrap px-3 py-2 font-mono text-[11px] uppercase tracking-wider", r.board === b ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{BOARD_META[b].short}</Link>
        ))}
      </div>

      <Panel className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-line text-left">
              <th className="px-3 py-2 font-normal">#</th><th className="px-3 py-2 font-normal">Product</th><th className="px-3 py-2 text-right font-normal">{valueLabel[r.board]}</th><th className="px-3 py-2 text-right font-normal">Users</th><th className="px-3 py-2 text-right font-normal">New · 30d</th><th className="px-3 py-2 text-right font-normal">Growth · 30d</th><th className="px-3 py-2 font-normal">Trust</th>
            </tr>
          </thead>
          <tbody>
            {snap.rows.map((s) => (
              <tr key={s.slug} className="border-b border-line last:border-0">
                <td className={cn("px-3 py-2 font-mono", s.rank <= 3 ? "text-pink" : "text-muted-foreground")}>{String(s.rank).padStart(2, "0")}</td>
                <td className="px-3 py-2"><Link href={`/s/${s.slug}`} className="flex items-center gap-2 hover:text-pink"><SaasLogo name={s.name} logoUrl={s.logoUrl} size={24} /><span className="font-medium">{s.name}</span>{s.category && !r.category && <span className="font-mono text-[11px] text-muted-foreground">{CATEGORIES.find((c) => c.slug === s.category)?.label ?? s.category}</span>}</Link></td>
                <td className="px-3 py-2 text-right font-semibold text-pink">{valueFor(r.board, s.value)}</td>
                <td className="px-3 py-2 text-right">{formatCompact(s.totalUsers)}</td>
                <td className="px-3 py-2 text-right">{formatDelta(s.newUsers30d)}</td>
                <td className="px-3 py-2 text-right">{formatPct(s.growth30dPct)}</td>
                <td className="px-3 py-2"><TrustBadge trust={s.trust} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel id="methodology" className="mt-8 p-5">
        <SectionLabel>How this archive is built</SectionLabel>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>On the 1st of each month the live board is sorted exactly as on the site — {BOARD_META[r.board].blurb.toLowerCase()} — over products that were public, verified and not under review at that moment, and the top 100 are written to an immutable snapshot. A board is only frozen when at least 3 products qualify.</p>
          <p>Only read-only connected sources count; self-reported numbers are never ranked. The frozen list is never rewritten, even if a product later changes its data or is delisted. The live version of this board keeps moving every 4 hours.</p>
        </div>
      </Panel>

      <div className="mt-12 border-t border-line pt-6">
        <SectionLabel>Explore</SectionLabel>
        <div className="mt-3 flex flex-wrap gap-2">
          {[[liveBoard[r.board], `Live ${BOARD_META[r.board].label.toLowerCase()} board`], ...(r.category ? [[`/categories/${r.category}`, `${catLabel} SaaS today`]] : []), ["/rankings", "All months"], ...(r.category ? [[rankingPath(r.period, null), `All categories · ${periodLabel(r.period)}`]] : [])].map(([href, label]) => (
            <Link key={href} href={href} className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:border-line-strong hover:text-foreground">{label}</Link>
          ))}
        </div>
      </div>
    </div>
  );
}
