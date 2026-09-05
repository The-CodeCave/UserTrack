"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Award, Check, Copy, ExternalLink, Flame, Sparkles, Trophy, Undo2, X } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareButton } from "@/components/share/share-button";
import { SHARE_CATEGORY_META, type ShareCategory } from "@convex/lib/shareRules";
import { shareLinkUrl, shareUrl } from "@/lib/site";
import { xDraft, type DraftKind } from "@/lib/x-drafts";
import { xIntentUrl } from "@/lib/social";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICON: Record<string, typeof Trophy> = { users: Trophy, top10: Award, top100: Award, rank: Award, trending_top10: Flame, benchmark: Sparkles, spike: Flame };
type Tab = "ready" | "shared" | "dismissed";

export default function ShareCenterPage() {
  const [tab, setTab] = useState<Tab>("ready");
  const events = useQuery(api.share.mine, { status: tab });
  const dismiss = useMutation(api.share.dismiss);
  const restore = useMutation(api.share.restore);
  const markShared = useMutation(api.share.markShared);
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionLabel>Share Center</SectionLabel>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Ready to share</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">Every meaningful growth event becomes a card automatically — milestones, records, rank entries, top-10% benchmarks. One click to download or post; nothing is ever posted without you.</p>
        </div>
        <div role="tablist" className="flex border border-line">
          {(["ready", "shared", "dismissed"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("min-h-[36px] px-3 font-mono text-[11px] uppercase tracking-wider", tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{t}</button>
          ))}
        </div>
      </div>

      {events === undefined && <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>}
      {events?.length === 0 && (
        <Panel className="p-6">
          <div className="text-lg font-medium">{tab === "ready" ? "Nothing new to share yet" : `No ${tab} cards`}</div>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">{tab === "ready" ? "Cards appear here when a product crosses 100 / 1K / 10K users, enters the Top 100 or Top 10, sets a record week, spikes 3× or lands in the top 10% of a benchmark. Until then, any metric can be shared from its card." : "Cards you shared or dismissed show up here."}</p>
          <Button variant="outline" className="mt-4" render={<Link href="/app/saas" />}>Open a product <ExternalLink className="size-3.5" /></Button>
        </Panel>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {events?.map((e) => {
          const page = shareUrl(e.saas.slug, e.cardKind);
          const Icon = ICON[e.kind] ?? Trophy;
          const text = xDraft({ kind: e.kind as DraftKind, name: e.saas.name, value: e.value, title: e.title, totalUsers: e.saas.totalUsers, newUsers30d: e.saas.newUsers30d, growth30dPct: e.saas.growth30dPct, rank: e.rank, percentile: e.percentile, verified: e.saas.trust === "verified", author: "founder", seed: e.key });
          const cat = SHARE_CATEGORY_META[e.category as ShareCategory];
          return (
            <Panel key={e._id} className="flex flex-col p-3">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center border border-pink/50 text-pink"><Icon className="size-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{e.saas.name} · {e.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{e.detail}</div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{cat?.label ?? e.category} · {timeAgo(e.createdAt)}{e.status === "shared" && e.sharedAt ? ` · shared ${timeAgo(e.sharedAt)}` : ""}</div>
                </div>
                {e.status === "ready" ? (
                  <button onClick={() => dismiss({ id: e._id })} aria-label="Dismiss" title="Dismiss" className="grid size-8 place-items-center text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
                ) : e.status === "dismissed" ? (
                  <button onClick={() => restore({ id: e._id })} aria-label="Restore" title="Restore" className="grid size-8 place-items-center text-muted-foreground hover:text-foreground"><Undo2 className="size-4" /></button>
                ) : null}
              </div>
              <div className="mt-3 aspect-[1200/630] w-full overflow-hidden border border-line bg-background">
                {e.saas.isPublic ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${page}/card`} alt={`${e.title} share card`} loading="lazy" className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center p-4 text-center text-xs text-muted-foreground">Publish {e.saas.name} to render this card.</div>
                )}
              </div>
              <div className={cn("mt-3 flex flex-wrap items-center gap-2", !e.saas.isPublic && "pointer-events-none opacity-50")}>
                <ShareButton variant="button" className="h-9 flex-1 sm:flex-none" target={{ page, slug: e.saas.slug, kind: e.cardKind, label: `${e.saas.name} · ${e.title}`, trust: e.saas.trust, text, shareEventId: e._id }}>Preview & download</ShareButton>
                <Button size="sm" variant="outline" className="h-9" onClick={async () => { await navigator.clipboard.writeText(shareLinkUrl(e.saas.slug, e.cardKind, "link")); setCopied(e._id); setTimeout(() => setCopied(null), 1500); }}>
                  {copied === e._id ? <Check className="size-3.5 text-pink" /> : <Copy className="size-3.5" />} Copy link
                </Button>
                <Button size="sm" variant="outline" className="h-9 sm:ml-auto" render={<a href={xIntentUrl(text, shareLinkUrl(e.saas.slug, e.cardKind, "x"))} target="_blank" rel="noreferrer" />} onClick={() => { if (e.status === "ready") void markShared({ id: e._id }).catch(() => toast.error("Could not update")); }}>
                  <span className="font-semibold">𝕏</span> Post to X
                </Button>
              </div>
            </Panel>
          );
        })}
      </div>

      <p className="font-mono text-[11px] text-muted-foreground">Auto-posting is off by default. Turn it on per category in <Link href="/app/settings/social" className="text-foreground hover:text-pink">Settings → Social</Link> once an X account is connected.</p>
    </div>
  );
}
