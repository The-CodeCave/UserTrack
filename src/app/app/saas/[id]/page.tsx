"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ExternalLink, Trash2, Copy, Check } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { MetricCard } from "@/components/blueprint/metric-card";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { SaasForm } from "@/components/app/saas-form";
import { ConnectSource, SourceStatus } from "@/components/app/connect-source";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { saasUrl } from "@/lib/site";
import { formatPct } from "@/lib/format";

export default function ManageSaasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const saasId = id as Id<"saas">;
  const router = useRouter();
  const saas = useQuery(api.saas.getMine, { id: saasId });
  const setPublic = useMutation(api.saas.setPublic);
  const remove = useMutation(api.saas.remove);
  const [replacing, setReplacing] = useState(false);
  const [copied, setCopied] = useState(false);

  if (saas === undefined) return <div className="mx-auto max-w-5xl space-y-4 p-6"><Skeleton className="h-8 w-56" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (saas === null) return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;

  const url = saasUrl(saas.slug);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionLabel><Link href="/app/saas" className="hover:text-foreground">My SaaS</Link> / {saas.name}</SectionLabel>
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold tracking-tight">{saas.name} <TrustBadge trust={saas.trust} /></h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={saas.isPublic} onCheckedChange={(v) => setPublic({ id: saasId, isPublic: v })} />
            {saas.isPublic ? "Public" : "Draft"}
          </label>
          <Button variant="outline" size="sm" render={<a href={url} target="_blank" rel="noreferrer" />} disabled={!saas.isPublic}>
            <ExternalLink className="size-4" /> View page
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total users" value={saas.totalUsers} accent />
        <MetricCard label="New · 24h" value={saas.newUsers24h} />
        <MetricCard label="New · 7d" value={saas.newUsers7d} />
        <MetricCard label="New · 30d" value={saas.newUsers30d}>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{formatPct(saas.growth30dPct)} · rank {saas.rank ?? "—"}</div>
        </MetricCard>
      </div>

      <section className="space-y-3">
        <SectionLabel>Data source</SectionLabel>
        {saas.integration && !replacing ? (
          <>
            <SourceStatus saasId={saasId} integration={saas.integration} totalUsers={saas.totalUsers} trust={saas.trust} />
            <Button variant="ghost" size="sm" onClick={() => setReplacing(true)}>Replace source</Button>
          </>
        ) : (
          <Panel className="p-4">
            <ConnectSource saasId={saasId} current={saas.integration ?? undefined} onConnected={() => setReplacing(false)} />
            {saas.integration && <Button variant="ghost" size="sm" className="mt-3" onClick={() => setReplacing(false)}>Cancel</Button>}
          </Panel>
        )}
      </section>

      <section className="space-y-3">
        <SectionLabel>Share</SectionLabel>
        <div className="flex items-center gap-2 border border-line bg-card px-3 py-2 font-mono text-sm">
          <span className="truncate">{url}</span>
          <button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground" aria-label="Copy link">
            {copied ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Details</SectionLabel>
        <Panel className="p-5"><SaasForm initial={saas} submitLabel="Save changes" /></Panel>
      </section>

      <section className="space-y-3">
        <SectionLabel>Danger zone</SectionLabel>
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/50 text-destructive hover:bg-destructive/10"
          onClick={async () => {
            if (!confirm(`Delete ${saas.name} and all its history?`)) return;
            await remove({ id: saasId });
            toast.success("Deleted");
            router.push("/app/saas");
          }}
        >
          <Trash2 className="size-4" /> Delete SaaS
        </Button>
      </section>
    </div>
  );
}
