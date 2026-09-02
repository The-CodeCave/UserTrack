"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { MovementTag } from "@/components/blueprint/movement";
import { MilestoneRow } from "@/components/public/milestones";
import { SaasLogo } from "@/components/public/saas-card";
import { FollowButton } from "@/components/public/follow-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDelta, formatPct } from "@/lib/format";

export default function FollowingPage() {
  const feed = useQuery(api.follows.feed);
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <SectionLabel>Following</SectionLabel>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Products you track</h1>
        <p className="mt-1 text-sm text-muted-foreground">Weekly movement and milestones from every SaaS and founder you follow. They also feed your weekly digest.</p>
      </div>
      {feed === undefined && <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
      {feed && feed.saas.length === 0 && feed.founders.length === 0 && (
        <Panel className="p-6">
          <div className="text-lg font-medium">You are not following anything yet</div>
          <p className="mt-1 text-sm text-muted-foreground">Hit “Follow” on any product or founder page.</p>
          <div className="mt-4 flex gap-2"><Button render={<Link href="/trending" />}>Trending <ArrowRight className="size-4" /></Button><Button variant="outline" render={<Link href="/discover" />}>Discover</Button></div>
        </Panel>
      )}
      {feed && feed.saas.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>This week</SectionLabel>
          {feed.saas.map((s) => (
            <Panel key={s._id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3 sm:grid-cols-[auto_1fr_6rem_6rem_auto]">
              <SaasLogo name={s.name} logoUrl={s.logoUrl} size={36} />
              <div className="min-w-0">
                <Link href={`/s/${s.slug}`} className="flex items-center gap-2 font-medium hover:underline"><span className="truncate">{s.name}</span><TrustBadge trust={s.trust} className="hidden sm:inline-flex" /></Link>
                <div className="font-mono text-[11px] text-muted-foreground">{formatCompact(s.totalUsers)} users{s.rank ? ` · #${s.rank}` : ""}</div>
              </div>
              <div className="text-right sm:text-left"><div className="font-semibold text-pink">{formatDelta(s.newUsers7d)}</div><div className="font-mono text-[11px] text-muted-foreground">{formatPct(s.growth7dPct)} · 7d</div></div>
              <div className="hidden items-center gap-1 font-mono text-sm sm:flex">{s.trendingRank ? `T#${s.trendingRank}` : "—"}<MovementTag m={s.trendingRank ? (s.prevTrendingRank !== undefined ? { kind: s.prevTrendingRank > s.trendingRank ? "up" : s.prevTrendingRank < s.trendingRank ? "down" : "same", delta: s.prevTrendingRank - s.trendingRank } : { kind: "new", delta: 0 }) : null} /></div>
              <div className="col-span-3 sm:col-span-1">{s.followed && <FollowButton targetType="saas" targetId={s._id} />}</div>
            </Panel>
          ))}
        </section>
      )}
      {feed && feed.founders.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>Founders</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {feed.founders.map((p) => (
              <Panel key={p._id} className="flex items-center gap-3 p-3">
                <div className="grid size-9 place-items-center border border-line bg-background font-mono text-sm">{p.displayName.slice(0, 1).toUpperCase()}</div>
                <Link href={`/u/${p.username}`} className="min-w-0 flex-1 hover:underline"><div className="truncate font-medium">{p.displayName}</div><div className="font-mono text-[11px] text-muted-foreground">@{p.username}</div></Link>
                <FollowButton targetType="profile" targetId={p._id} />
              </Panel>
            ))}
          </div>
        </section>
      )}
      {feed && feed.milestones.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>Milestones · last 7 days</SectionLabel>
          <div className="grid gap-2 md:grid-cols-2">{feed.milestones.map((m) => <MilestoneRow key={m._id} m={m} slug={m.slug} name={m.name} compact />)}</div>
        </section>
      )}
    </div>
  );
}
