import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { Flame, Rocket, ShieldCheck, Trophy, Zap } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Panel } from "@/components/blueprint/panel";
import { SaasLogo } from "@/components/public/saas-card";
import { MILESTONE_ICON } from "@/components/public/milestones";
import { timeAgo } from "@/lib/format";

export type FeedItem = FunctionReturnType<typeof api.public.feed>[number];

const KIND_ICON: Record<Exclude<FeedItem["kind"], "milestone">, typeof Flame> = { spike: Flame, activation_spike: Zap, launched: Rocket, verified: ShieldCheck };

// Server-safe activity list: one compact row per milestone/spike/launch/verification.
export function DiscoveryFeed({ items }: { items: FeedItem[] }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {items.map((i) => {
        const Icon = i.kind === "milestone" ? (MILESTONE_ICON[i.subkind] ?? Trophy) : KIND_ICON[i.kind];
        return (
          <Panel key={i.id} className="flex items-center gap-3 p-3">
            <div className="grid size-9 shrink-0 place-items-center border border-pink/50 text-pink"><Icon className="size-4" /></div>
            <SaasLogo name={i.saas.name} logoUrl={i.saas.logoUrl} size={28} className="hidden sm:block" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-2 text-sm">
                <Link href={`/s/${i.saas.slug}`} className="shrink-0 font-medium hover:text-pink">{i.saas.name}</Link>
                <span className="min-w-0 truncate text-foreground/80">{i.title}</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">{i.detail}</div>
            </div>
            <div className="shrink-0 text-right font-mono text-[11px] text-muted-foreground">
              <div>{timeAgo(i.at)}</div>
              {i.share && <Link href={`/s/${i.saas.slug}/${i.share}`} className="text-pink hover:underline">Share</Link>}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
