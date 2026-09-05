import Link from "next/link";
import { Award, Flame, Rocket, ShieldCheck, Sprout, TrendingDown, TrendingUp, Trophy, Zap } from "lucide-react";
import { MILESTONE_ICON } from "@/components/public/milestones";
import { SaasLogo } from "@/components/public/saas-card";
import { timeAgo } from "@/lib/format";

const ICON: Record<string, typeof Trophy> = { milestone: Trophy, spike: Flame, activation_spike: Zap, launched: Rocket, new_project: Rocket, verified: ShieldCheck, rank_jump: TrendingUp, rank_change: TrendingUp, traction: Sprout, benchmark: Award };

export interface WatchlistFeedItemData { id: string; kind: string; subkind: string; at: number; title: string; detail: string; share?: string; founder?: { username: string; displayName: string }; saas: { slug: string; name: string; logoUrl?: string } }

// One row of the watchlist feed (/app/following and the dashboard's "From your watchlist" section).
export function WatchlistFeedItem({ item: e }: { item: WatchlistFeedItemData }) {
  const Icon = (e.kind === "milestone" && MILESTONE_ICON[e.subkind]) || ICON[e.kind] || Trophy;
  const down = (e.kind === "rank_change" || e.kind === "rank_jump") && e.subkind === "down";
  return (
    <div className="flex items-start gap-3 p-3">
      {down ? <TrendingDown className="mt-1 size-4 shrink-0 text-muted-foreground" /> : <Icon className="mt-1 size-4 shrink-0 text-pink" />}
      <SaasLogo name={e.saas.name} logoUrl={e.saas.logoUrl} size={28} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-sm"><Link href={`/s/${e.saas.slug}`} className="font-medium hover:underline">{e.saas.name}</Link> <span className="text-muted-foreground">—</span> {e.title}</div>
        {e.detail && <div className="mt-0.5 text-xs text-muted-foreground">{e.detail}</div>}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted-foreground">
          <span>{timeAgo(e.at)}</span>
          {e.founder && <span>· via <Link href={`/u/${e.founder.username}`} className="hover:text-foreground">@{e.founder.username}</Link></span>}
          {e.share && <Link href={`/s/${e.saas.slug}/${e.share}`} className="text-pink hover:underline">Share</Link>}
        </div>
      </div>
    </div>
  );
}
