"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, Flame, Plus, Trophy } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { MovementTag } from "@/components/blueprint/movement";
import { BenchmarkCards } from "@/components/app/benchmark-cards";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDelta, formatPct, formatRate } from "@/lib/format";

export default function OverviewPage() {
  const list = useQuery(api.saas.listMine);
  const digest = useQuery(api.digest.latest);
  const primary = list?.[0];
  const detail = useQuery(api.saas.getMine, primary ? { id: primary._id } : "skip");
  const totals = list?.reduce((a, s) => ({ users: a.users + s.totalUsers, new7: a.new7 + s.newUsers7d, new30: a.new30 + s.newUsers30d }), { users: 0, new7: 0, new30: 0 });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <SectionLabel>Overview</SectionLabel>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your growth at a glance</h1>
        </div>
        <Button size="sm" render={<Link href="/app/saas/new" />}><Plus className="size-4" /> Add SaaS</Button>
      </div>

      {list === undefined && <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
      {list?.length === 0 && (
        <Panel className="p-6">
          <div className="text-lg font-medium">No products yet</div>
          <p className="mt-1 text-sm text-muted-foreground">Add your SaaS and connect a read-only source to get a public growth page, rankings and milestones.</p>
          <Button className="mt-4" render={<Link href="/app/saas/new" />}>Add your SaaS <ArrowRight className="size-4" /></Button>
        </Panel>
      )}

      {totals && list && list.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Panel className="p-4"><div className="text-label">Users</div><div className="mt-1 text-2xl font-semibold text-pink sm:text-3xl">{formatCompact(totals.users)}</div></Panel>
          <Panel className="p-4"><div className="text-label">New · 7d</div><div className="mt-1 text-2xl font-semibold sm:text-3xl">{formatDelta(totals.new7)}</div></Panel>
          <Panel className="p-4"><div className="text-label">New · 30d</div><div className="mt-1 text-2xl font-semibold sm:text-3xl">{formatDelta(totals.new30)}</div></Panel>
        </div>
      )}

      {list && list.length > 0 && (
        <section className="space-y-3">
          <SectionLabel>Products</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((s) => (
              <Link key={s._id} href={`/app/saas/${s._id}`} className="group">
                <Panel className="h-full p-4 transition-colors group-hover:border-line-strong">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{s.isPublic ? "public" : "draft"}{s.rank ? ` · #${s.rank}` : ""}{s.trendingRank ? ` · trending #${s.trendingRank}` : ""}</div>
                    </div>
                    <TrustBadge trust={s.trust} />
                  </div>
                  <div className="mt-4 grid grid-cols-[1fr_auto_auto] items-end gap-6">
                    <div><div className="text-label">Users</div><div className="tabular text-2xl font-semibold">{formatCompact(s.totalUsers)}</div></div>
                    <div className="text-right"><div className="text-label">7d</div><div className="font-mono text-sm text-pink">{formatDelta(s.newUsers7d)}</div><div className="font-mono text-[10px] text-muted-foreground">{formatPct(s.growth7dPct ?? 0)}</div></div>
                    <div className="text-right"><div className="text-label">Rank</div><div className="flex items-center justify-end gap-1 font-mono text-sm">{s.rank ? `#${s.rank}` : "—"}<MovementTag m={s.rank ? (s.prevRank !== undefined ? { kind: s.prevRank > s.rank ? "up" : s.prevRank < s.rank ? "down" : "same", delta: s.prevRank - s.rank } : { kind: "new", delta: 0 }) : null} /></div></div>
                  </div>
                  {s.activationRatePct !== undefined && <div className="mt-2 font-mono text-[11px] text-muted-foreground">{formatRate(s.activationRatePct)} activation · {formatCompact(s.activatedUsers ?? 0)} activated</div>}
                </Panel>
              </Link>
            ))}
          </div>
        </section>
      )}

      {primary && (
        <section className="space-y-3">
          <div className="flex items-center gap-2"><SectionLabel>Benchmarks · {primary.name}</SectionLabel></div>
          <BenchmarkCards saasId={primary._id} />
        </section>
      )}

      {detail && detail.milestones.length > 0 && (
        <section className="space-y-3">
          <SectionLabel>Recent milestones · {detail.name}</SectionLabel>
          <div className="grid gap-2 md:grid-cols-2">
            {detail.milestones.slice(0, 4).map((m) => (
              <Link key={m._id} href={`/s/${detail.slug}/share/milestone-${m._id}`} className="group">
                <Panel className="flex items-center gap-3 p-3 transition-colors group-hover:border-line-strong">
                  <Trophy className="size-4 shrink-0 text-pink" />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{m.title}</div><div className="truncate text-xs text-muted-foreground">{m.copy}</div></div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Share</span>
                </Panel>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        <Panel className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><Flame className="size-4 text-pink" /> Weekly digest</div>
          <p className="mt-1 text-xs text-muted-foreground">{digest?.length ? `Latest: week ${digest[0].weekKey}.` : "Your first digest is generated on Monday morning, or preview one now."}</p>
          <Button variant="outline" size="sm" className="mt-3" render={<Link href="/app/digest" />}>Open digest</Button>
        </Panel>
        <Panel className="p-4">
          <div className="text-sm font-medium">Following</div>
          <p className="mt-1 text-xs text-muted-foreground">Follow products and founders to get their milestones and weekly movement in one feed.</p>
          <Button variant="outline" size="sm" className="mt-3" render={<Link href="/app/following" />}>Open feed</Button>
        </Panel>
      </section>
    </div>
  );
}
