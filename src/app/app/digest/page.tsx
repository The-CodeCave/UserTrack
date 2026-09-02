"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Loader2, Mail, RefreshCw } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDelta, formatDate } from "@/lib/format";

type Row = { slug: string; name: string; totalUsers: number; newUsers7d: number; rank?: number; prevRank?: number; trendingRank?: number };

export default function DigestPage() {
  const prefs = useQuery(api.email.prefs.mine);
  const digests = useQuery(api.digest.latest);
  const preview = useMutation(api.digest.previewMine);
  const update = useMutation(api.email.prefs.update);
  const [busy, setBusy] = useState(false);
  const latest = digests?.[0];
  const optIn = prefs?.weeklyDigest ?? false;

  async function generate() {
    setBusy(true);
    try {
      await preview();
      toast.success("Building this week's digest…");
      setTimeout(() => setBusy(false), 2500);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionLabel>Weekly digest</SectionLabel>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your growth week</h1>
          <p className="mt-1 text-sm text-muted-foreground">Generated every Monday 08:00 UTC: your products, followed movers, milestones and what is trending.</p>
        </div>
        <Button variant="outline" size="sm" onClick={generate} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Preview this week</Button>
      </div>

      <Panel className="flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3"><Mail className="size-4 text-pink" /><div><div className="text-sm font-medium">Email me the digest</div><div className="text-xs text-muted-foreground">Optional. Sent Monday mornings when there is something to report. Manage all email in <Link href="/app/settings/notifications" className="underline-offset-4 hover:underline">Settings → Notifications</Link>.</div></div></div>
        <Switch checked={optIn} onCheckedChange={(v) => update({ weeklyDigest: v })} />
      </Panel>

      {digests === undefined && <Skeleton className="h-64" />}
      {digests && !latest && <Panel className="p-6 text-sm text-muted-foreground">No digest yet. Hit “Preview this week” to build one now.</Panel>}
      {latest && (
        <Panel className="space-y-6 p-5">
          <div className="flex items-center justify-between"><div className="text-label">Week {latest.weekKey}</div><div className="font-mono text-[11px] text-muted-foreground">{latest.sentAt ? `emailed ${formatDate(latest.sentAt)}` : "in-app"}</div></div>
          <Section title="Your products" rows={latest.payload.own} />
          <Section title="Products you follow" rows={latest.payload.followed} empty="Follow products to see their week here." />
          {latest.payload.milestones.length > 0 && (
            <div>
              <div className="text-label">Milestones</div>
              <div className="mt-2 space-y-2">{latest.payload.milestones.map((m, i) => <div key={i} className="border-b border-line pb-2 last:border-0"><Link href={`/s/${m.slug}`} className="text-sm font-medium hover:underline">{m.title}</Link><div className="text-xs text-muted-foreground">{m.copy}</div></div>)}</div>
            </div>
          )}
          <Section title="Leaderboard movers" rows={latest.payload.movers} />
          <Section title="Trending now" rows={latest.payload.trending} />
        </Panel>
      )}
    </div>
  );
}

function Section({ title, rows, empty }: { title: string; rows: Row[]; empty?: string }) {
  if (rows.length === 0 && !empty) return null;
  return (
    <div>
      <div className="text-label">{title}</div>
      {rows.length === 0 ? <div className="mt-2 text-xs text-muted-foreground">{empty}</div> : (
        <div className="mt-2 space-y-2">
          {rows.map((r) => (
            <div key={r.slug} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
              <Link href={`/s/${r.slug}`} className="text-sm font-medium hover:underline">{r.name}</Link>
              <div className="font-mono text-[11px] text-muted-foreground">{formatCompact(r.totalUsers)} · <span className="text-pink">{formatDelta(r.newUsers7d)}</span> 7d{r.rank ? ` · #${r.rank}${r.prevRank && r.prevRank !== r.rank ? ` (was #${r.prevRank})` : ""}` : ""}{r.trendingRank ? ` · T#${r.trendingRank}` : ""}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
