"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { MovementTag } from "@/components/blueprint/movement";
import { SaasLogo } from "@/components/public/saas-card";
import { FollowButton } from "@/components/public/follow-button";
import { WatchlistFeedItem } from "@/components/app/watchlist-feed-item";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDelta, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAYS = [7, 30, 90] as const;

export default function FollowingPage() {
  const [days, setDays] = useState<(typeof DAYS)[number]>(30);
  const feed = useQuery(api.follows.feed, { days });
  const markSeen = useMutation(api.follows.markFeedSeen);
  // Once per visit: clears the unseen count in the sidebar and on the dashboard.
  useEffect(() => { void markSeen().catch(() => undefined); }, [markSeen]);
  const nothing = feed && feed.saas.length === 0 && feed.founders.length === 0;
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <SectionLabel>Following</SectionLabel>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your SaaS intelligence feed</h1>
        <p className="mt-1 text-sm text-muted-foreground">Milestones, spikes and rank moves from every product and founder you follow. Email alerts are configured in <Link href="/app/settings/notifications" className="text-foreground underline-offset-2 hover:underline">notification settings</Link>.</p>
      </div>
      {feed === undefined && <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
      {nothing && (
        <Panel className="p-6">
          <div className="text-lg font-medium">You are not following anything yet</div>
          <p className="mt-1 text-sm text-muted-foreground">Hit “Follow” on any product or founder page and their notable moments land here.</p>
          <div className="mt-4 flex gap-2"><Button render={<Link href="/discover" />}>Discover <ArrowRight className="size-4" /></Button><Button variant="outline" render={<Link href="/trending" />}>Trending</Button></div>
        </Panel>
      )}
      {feed && feed.saas.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>Products you track</SectionLabel>
          <Panel className="divide-y divide-line p-0">
            {feed.saas.map((s) => (
              <div key={s._id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 p-3 sm:grid-cols-[auto_1fr_5.5rem_7rem_6rem_auto]">
                <SaasLogo name={s.name} logoUrl={s.logoUrl} size={36} />
                <div className="min-w-0">
                  <Link href={`/s/${s.slug}`} className="flex min-w-0 items-center gap-2 font-medium hover:underline"><span className="truncate">{s.name}</span><TrustBadge trust={s.trust} label={s.trustLabel} className="hidden sm:inline-flex" /></Link>
                  <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted-foreground">
                    <span>{formatCompact(s.totalUsers)} users</span>
                    {s.via === "founder" && <span className="border border-line px-1 text-[10px]">via founder</span>}
                  </div>
                </div>
                <div className="text-right sm:text-left"><div className="tabular font-semibold text-pink">{formatDelta(s.newUsers7d)}</div><div className="font-mono text-[11px] text-muted-foreground">{formatPct(s.growth7dPct)} · 7d</div></div>
                <div className="col-span-3 flex items-center gap-3 font-mono text-[11px] sm:col-span-1 sm:block sm:text-sm">
                  <span className="inline-flex items-center gap-1"><span className="text-muted-foreground sm:hidden">rank</span> {s.rank ? `#${s.rank}` : "—"} {s.rank && <MovementTag m={s.rankMovement7d} />}</span>
                  <span className="text-muted-foreground sm:hidden">·</span>
                  <span className="inline-flex items-center gap-1 sm:hidden"><span className="text-muted-foreground">trending</span> {s.trendingRank ? `#${s.trendingRank}` : "—"} {s.trendingRank && <MovementTag m={s.trendingMovement7d} />}</span>
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground max-sm:hidden">rank · 7d</span>
                </div>
                <div className="hidden font-mono text-sm sm:block">
                  <span className="inline-flex items-center gap-1">{s.trendingRank ? `T#${s.trendingRank}` : "—"} {s.trendingRank && <MovementTag m={s.trendingMovement7d} />}</span>
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">trending</span>
                </div>
                <div className="col-span-3 sm:col-span-1">{s.followed && <FollowButton targetType="saas" targetId={s._id} className="w-full sm:w-auto" />}</div>
              </div>
            ))}
          </Panel>
        </section>
      )}
      {feed && feed.founders.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>Founders</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {feed.founders.map((p) => (
              <Panel key={p._id} className="flex items-center gap-3 p-3">
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatarUrl} alt="" className="size-9 shrink-0 border border-line object-cover" />
                ) : (
                  <div className="grid size-9 shrink-0 place-items-center border border-line bg-background font-mono text-sm">{p.displayName.slice(0, 1).toUpperCase()}</div>
                )}
                <Link href={`/u/${p.username}`} className="min-w-0 flex-1 hover:underline"><div className="truncate font-medium">{p.displayName}</div><div className="truncate font-mono text-[11px] text-muted-foreground">@{p.username} · {p.followerCount} {p.followerCount === 1 ? "follower" : "followers"}</div></Link>
                <FollowButton targetType="profile" targetId={p._id} />
              </Panel>
            ))}
          </div>
        </section>
      )}
      {feed && !nothing && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>Feed · last {days} days</SectionLabel>
            <div className="flex border border-line font-mono text-[11px]">
              {DAYS.map((d) => <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={cn("px-2.5 py-1", days === d ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{d}d</button>)}
            </div>
          </div>
          {feed.feed.length === 0 ? (
            <Panel className="p-4 text-sm text-muted-foreground">Nothing notable yet — milestones, spikes and rank moves appear here as they happen.</Panel>
          ) : (
            <Panel className="divide-y divide-line p-0">
              {feed.feed.map((e) => <WatchlistFeedItem key={e.id} item={e} />)}
            </Panel>
          )}
        </section>
      )}
    </div>
  );
}
