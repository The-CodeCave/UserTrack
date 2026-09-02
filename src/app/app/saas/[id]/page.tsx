"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ExternalLink, Trash2, Copy, Check, Eye, Trophy } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { MetricCard } from "@/components/blueprint/metric-card";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { SaasForm } from "@/components/app/saas-form";
import { ConnectSource, SourceStatus } from "@/components/app/connect-source";
import { BenchmarkCards } from "@/components/app/benchmark-cards";
import { SaasGrowth } from "@/components/public/saas-growth";
import { Funnel } from "@/components/public/funnel";
import { EmbedBadge } from "@/components/public/embed-badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { saasUrl, shareUrl } from "@/lib/site";
import { formatCompact, formatDelta, formatMoney, formatPct, formatRate, timeAgo } from "@/lib/format";
import { ROLE_META, type Role } from "@/lib/providers-ui";
import { cn } from "@/lib/utils";

export default function ManageSaasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const saasId = id as Id<"saas">;
  const router = useRouter();
  const saas = useQuery(api.saas.getMine, { id: saasId });
  const setPublic = useMutation(api.saas.setPublic);
  const setDisplay = useMutation(api.saas.setDisplay);
  const remove = useMutation(api.saas.remove);
  const [replacing, setReplacing] = useState<Role | null>(null);
  const [adding, setAdding] = useState<Role | null>(null);
  const [copied, setCopied] = useState(false);

  if (saas === undefined) return <div className="mx-auto max-w-5xl space-y-4 p-6"><Skeleton className="h-8 w-56" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (saas === null) return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;

  const url = saasUrl(saas.slug);
  const byRole = (r: Role) => saas.integrations.find((i) => i.role === r);
  const users = byRole("users");

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionLabel><Link href="/app/saas" className="hover:text-foreground">My SaaS</Link> / {saas.name}</SectionLabel>
          <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">{saas.name} <TrustBadge trust={saas.trust} label={saas.trustLabel} /></h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={saas.isPublic} onCheckedChange={(v) => setPublic({ id: saasId, isPublic: v })} />
            {saas.isPublic ? "Public" : "Draft"}
          </label>
          <Button variant="outline" size="sm" render={<a href={url} target="_blank" rel="noreferrer" />} disabled={!saas.isPublic}><ExternalLink className="size-4" /> View page</Button>
        </div>
      </div>

      {saas.review && (
        <Panel className="flex items-start gap-3 border-line-strong p-4">
          <Eye className="mt-0.5 size-4 shrink-0" />
          <div className="text-sm">
            <div className="font-medium">Recent data is being reviewed</div>
            <p className="text-muted-foreground">Your numbers moved unusually ({saas.review.kinds.map((k) => k.replace(/_/g, " ")).join(", ")}). Nothing is wrong on your side if your source is correct — the flag clears automatically after a week of steady syncs. Rankings pause until then.</p>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total users" value={saas.totalUsers} accent />
        <MetricCard label="New · 24h" value={saas.newUsers24h} />
        <MetricCard label="New · 7d" value={saas.newUsers7d}><div className="mt-1 font-mono text-xs text-muted-foreground">{formatPct(saas.growth7dPct ?? 0)}</div></MetricCard>
        <MetricCard label="New · 30d" value={saas.newUsers30d}>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{formatPct(saas.growth30dPct)} · rank {saas.rank ?? "—"}{saas.trendingRank ? ` · trending #${saas.trendingRank}` : ""}</div>
        </MetricCard>
      </div>

      {saas.isPublic && (
        <Panel className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between"><SectionLabel>Users over time</SectionLabel><span className="font-mono text-[11px] text-muted-foreground">{saas.lastSyncedAt ? `synced ${timeAgo(saas.lastSyncedAt)}` : "no sync yet"}</span></div>
          <SaasGrowth slug={saas.slug} compact />
        </Panel>
      )}

      <section className="space-y-3">
        <SectionLabel>Insights</SectionLabel>
        <div className="grid gap-3 md:grid-cols-3">
          <Panel className="p-4">
            <div className="text-label">Trust score</div>
            <div className="mt-1 flex items-baseline gap-2"><span className="text-2xl font-semibold">{saas.trustScore ?? "—"}</span><span className="font-mono text-[11px] text-muted-foreground">/ 100</span></div>
            <div className="mt-1 text-xs text-muted-foreground">Provider type, connection age, sync continuity and activation data. Grows with time.</div>
          </Panel>
          <Panel className="p-4">
            <div className="text-label">Activation</div>
            <div className="mt-1 text-2xl font-semibold">{saas.activatedUsers !== undefined ? formatRate(saas.activationRatePct) : "—"}</div>
            <div className="mt-1 text-xs text-muted-foreground">{saas.activatedUsers !== undefined ? `${formatCompact(saas.activatedUsers)} activated · ${formatDelta(saas.activated30d ?? 0)} in 30d` : "Connect an activation source below."}</div>
          </Panel>
          <Panel className="p-4">
            <div className="text-label">Retention · 30d</div>
            <div className="mt-1 text-2xl font-semibold">{saas.retentionRatePct !== undefined ? formatRate(saas.retentionRatePct) : "—"}</div>
            <div className="mt-1 text-xs text-muted-foreground">{saas.retentionRatePct !== undefined ? `estimated · ${formatCompact(saas.churnedUsers ?? 0)} churned` : "Available with Clerk, Auth0 or an endpoint that reports activeUsers30d."}</div>
          </Panel>
        </div>
        <BenchmarkCards saasId={saasId} />
        <Funnel f={{ visitors30d: saas.visitors30d, newUsers30d: saas.newUsers30d, activated30d: saas.activated30d, activatedUsers: saas.activatedUsers, payingUsers: saas.payingUsers }} />
      </section>

      {(["users", "activation", "traffic", "revenue"] as Role[]).map((role) => {
        const integ = byRole(role);
        const meta = ROLE_META[role];
        const open = replacing === role || adding === role || (role === "users" && !integ);
        return (
          <section key={role} className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <SectionLabel>{meta.title}{meta.optional && <span className="normal-case tracking-normal"> · optional</span>}</SectionLabel>
                <p className="mt-1 text-xs text-muted-foreground">{meta.blurb}</p>
              </div>
              {role === "traffic" && saas.visitors30d !== undefined && (
                <label className="flex shrink-0 items-center gap-2 text-xs"><Switch checked={Boolean(saas.showTraffic)} onCheckedChange={(v) => setDisplay({ id: saasId, showTraffic: v })} /> Show publicly</label>
              )}
              {role === "revenue" && saas.payingUsers !== undefined && (
                <label className="flex shrink-0 items-center gap-2 text-xs"><Switch checked={Boolean(saas.showRevenue)} onCheckedChange={(v) => setDisplay({ id: saasId, showRevenue: v })} /> Show publicly</label>
              )}
            </div>
            {integ && !open ? (
              <>
                <SourceStatus saasId={saasId} integration={integ} totalUsers={role === "users" ? saas.totalUsers : undefined} trust={saas.trust} trustLabel={saas.trustLabel} onReplace={() => setReplacing(role)} onDisconnect={() => setAdding(null)} />
                {role === "traffic" && saas.visitors30d !== undefined && <div className="font-mono text-[11px] text-muted-foreground">{formatCompact(saas.visitors30d)} visitors · {formatCompact(saas.sessions30d ?? 0)} sessions in 30d{saas.showTraffic ? "" : " · hidden from your public page"}</div>}
                {role === "revenue" && saas.payingUsers !== undefined && <div className="font-mono text-[11px] text-muted-foreground">{formatCompact(saas.payingUsers)} paying{saas.mrr !== undefined ? ` · ${formatMoney(saas.mrr, saas.currency)} MRR` : ""}{saas.showRevenue ? "" : " · hidden from your public page"}</div>}
              </>
            ) : open ? (
              <Panel className="p-4">
                <ConnectSource saasId={saasId} role={role} current={integ ?? undefined} onConnected={() => { setReplacing(null); setAdding(null); }} />
                {(integ || role !== "users") && <Button variant="ghost" size="sm" className="mt-3" onClick={() => { setReplacing(null); setAdding(null); }}>Cancel</Button>}
              </Panel>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAdding(role)}>Connect {meta.label.toLowerCase()} source</Button>
            )}
          </section>
        );
      })}

      {saas.milestones.length > 0 && (
        <section className="space-y-3">
          <SectionLabel>Milestones</SectionLabel>
          <div className="grid gap-2 md:grid-cols-2">
            {saas.milestones.map((m) => (
              <Link key={m._id} href={shareUrl(saas.slug, `milestone-${m._id}`)} className="group">
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

      <section className="space-y-3">
        <SectionLabel>Share</SectionLabel>
        <div className="flex items-center gap-2 border border-line bg-card px-3 py-2 font-mono text-sm">
          <span className="truncate">{url}</span>
          <button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground" aria-label="Copy link">
            {copied ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />}
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel className="p-4">
            <div className="text-sm font-medium">Share cards</div>
            <p className="mt-1 text-xs text-muted-foreground">Each opens a page with a custom preview image and share buttons.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { kind: "users", label: `${formatCompact(saas.totalUsers)} users` },
                { kind: "growth", label: `${formatDelta(saas.newUsers30d)} in 30d` },
                ...(saas.rank ? [{ kind: "rank", label: `#${saas.rank} on UserTrack` }] : []),
                ...(saas.trendingRank ? [{ kind: "trending", label: `#${saas.trendingRank} trending` }] : []),
                ...(saas.activationRatePct !== undefined ? [{ kind: "activation", label: `${formatRate(saas.activationRatePct)} activation` }] : []),
              ].map((c) => <Link key={c.kind} href={shareUrl(saas.slug, c.kind)} className={cn("border border-line px-3 py-2 text-sm transition-colors hover:border-pink hover:text-pink", !saas.isPublic && "pointer-events-none opacity-50")}>{c.label}</Link>)}
            </div>
            {!saas.isPublic && <p className="mt-2 font-mono text-[11px] text-muted-foreground">Publish to enable share cards.</p>}
          </Panel>
          <Panel className="p-4">
            <div className="text-sm font-medium">Badge for your website</div>
            <div className="mt-3"><EmbedBadge slug={saas.slug} name={saas.name} /></div>
          </Panel>
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Details</SectionLabel>
        <Panel className="p-5"><SaasForm initial={saas} submitLabel="Save changes" /></Panel>
      </section>

      {saas.runs.length > 0 && (
        <section className="space-y-3">
          <SectionLabel>Sync log</SectionLabel>
          <Panel className="divide-y divide-line p-0">
            {saas.runs.map((r) => (
              <div key={r._id} className="flex items-center gap-3 px-3 py-2 font-mono text-[11px]">
                <span className={cn("size-1.5 shrink-0", r.status === "ok" ? "bg-pink" : r.status === "error" ? "bg-destructive" : "bg-muted-foreground")} />
                <span className="w-16 text-muted-foreground">{ROLE_META[r.role].label}</span>
                <span className="w-16">{r.provider}</span>
                <span className="text-muted-foreground">{timeAgo(r.startedAt)}{r.durationMs !== undefined ? ` · ${r.durationMs}ms` : ""}{r.attempt && r.attempt > 1 ? ` · attempt ${r.attempt}` : ""}</span>
                {r.error && <span className="truncate text-destructive">{r.error}</span>}
              </div>
            ))}
          </Panel>
        </section>
      )}

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
      {users === undefined && null}
    </div>
  );
}
