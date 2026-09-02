"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ExternalLink, Trash2, Copy, Check, Eye, Trophy, ArrowRight } from "lucide-react";
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
import { availableShareKinds } from "@/lib/share";
import { formatCompact, formatDelta, formatMoney, formatPct, formatRate, timeAgo } from "@/lib/format";
import { ROLE_META, type Role } from "@/lib/providers-ui";
import { cn } from "@/lib/utils";

const NAV = [["overview", "Overview"], ["growth", "Growth"], ["funnel", "Funnel"], ["benchmarks", "Benchmarks"], ["integrations", "Integrations"], ["sharing", "Sharing"], ["embeds", "Embeds"], ["settings", "Settings"]] as const;

export default function ManageSaasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const saasId = id as Id<"saas">;
  const router = useRouter();
  const saas = useQuery(api.saas.getMine, { id: saasId });
  const funnel = useQuery(api.saas.funnel, { id: saasId, timeframe: "30d" });
  const setPublic = useMutation(api.saas.setPublic);
  const setDisplay = useMutation(api.saas.setDisplay);
  const remove = useMutation(api.saas.remove);
  const [replacing, setReplacing] = useState<Role | null>(null);
  const [adding, setAdding] = useState<Role | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  if (saas === undefined) return <div className="mx-auto max-w-5xl space-y-4 p-6"><Skeleton className="h-8 w-56" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (saas === null) return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;

  const url = saasUrl(saas.slug);
  const embedHref = `/app/saas/${id}/embed`;
  const byRole = (r: Role) => saas.integrations.find((i) => i.role === r);
  const copy = async (key: string, text: string) => { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); };
  // Derived from state only; disappears as the founder completes each item.
  const nextSteps = [
    ...(!saas.isPublic ? [{ label: "Publish your page", onClick: () => setPublic({ id: saasId, isPublic: true }) }] : []),
    ...(!byRole("activation") ? [{ label: "Connect an activation source", href: "#integrations" }] : []),
    ...(saas.isPublic ? [{ label: "Add the badge to your site", href: embedHref }, { label: "Share your growth card", href: "#sharing" }] : []),
    ...(saas.isPublic && saas.trust === "verified" ? [{ label: "See how you compare", href: "#benchmarks" }] : []),
  ];
  const chip = "inline-flex items-center gap-1.5 border border-line px-2.5 py-1 text-xs transition-colors hover:border-pink hover:text-pink";

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

      <nav aria-label="Sections" className="sticky top-0 z-30 -mx-4 overflow-x-auto border-b border-line bg-background/90 px-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex gap-1">
          {NAV.map(([anchor, label]) => <a key={anchor} href={`#${anchor}`} className="shrink-0 whitespace-nowrap px-2.5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">{label}</a>)}
        </div>
      </nav>

      {saas.review && (
        <Panel className="flex items-start gap-3 border-line-strong p-4">
          <Eye className="mt-0.5 size-4 shrink-0" />
          <div className="text-sm">
            <div className="font-medium">Recent data is being reviewed</div>
            <p className="text-muted-foreground">Your numbers moved unusually ({saas.review.kinds.map((k) => k.replace(/_/g, " ")).join(", ")}). Nothing is wrong on your side if your source is correct — the flag clears automatically after a week of steady syncs. Rankings pause until then.</p>
          </div>
        </Panel>
      )}

      <section id="overview" className="scroll-mt-14 space-y-3">
        <SectionLabel>Overview</SectionLabel>
        {nextSteps.length > 0 && (
          <Panel className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-label mr-1">Next steps</span>
            {nextSteps.map((s) =>
              s.href ? (
                <Link key={s.label} href={s.href} className={chip}>{s.label} <ArrowRight className="size-3" /></Link>
              ) : (
                <button key={s.label} type="button" onClick={s.onClick} className={chip}>{s.label} <ArrowRight className="size-3" /></button>
              ),
            )}
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
        <div className="grid gap-3 md:grid-cols-3">
          <Panel className="p-4">
            <div className="text-label">Trust score</div>
            <div className="mt-1 flex items-baseline gap-2"><span className="text-2xl font-semibold">{saas.trustScore ?? "—"}</span><span className="font-mono text-[11px] text-muted-foreground">/ 100</span></div>
            <div className="mt-1 text-xs text-muted-foreground">Provider type, connection age, sync continuity and activation data. Grows with time.</div>
          </Panel>
          <Panel className="p-4">
            <div className="text-label">Activation</div>
            <div className="mt-1 text-2xl font-semibold">{saas.activatedUsers !== undefined ? formatRate(saas.activationRatePct) : "—"}</div>
            <div className="mt-1 text-xs text-muted-foreground">{saas.activatedUsers !== undefined ? `${formatCompact(saas.activatedUsers)} activated · ${formatDelta(saas.activated30d ?? 0)} in 30d` : "Connect an activation source under Integrations."}</div>
          </Panel>
          <Panel className="p-4">
            <div className="text-label">Retention · 30d</div>
            <div className="mt-1 text-2xl font-semibold">{saas.retentionRatePct !== undefined ? formatRate(saas.retentionRatePct) : "—"}</div>
            <div className="mt-1 text-xs text-muted-foreground">{saas.retentionRatePct !== undefined ? `estimated · ${formatCompact(saas.churnedUsers ?? 0)} churned` : "Available with Clerk, Auth0 or an endpoint that reports activeUsers30d."}</div>
          </Panel>
        </div>
      </section>

      <section id="growth" className="scroll-mt-14 space-y-3">
        <SectionLabel>Growth</SectionLabel>
        {saas.isPublic ? (
          <Panel className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between"><span className="text-sm font-medium">Users over time</span><span className="font-mono text-[11px] text-muted-foreground">{saas.lastSyncedAt ? `synced ${timeAgo(saas.lastSyncedAt)}` : "no sync yet"}</span></div>
            <SaasGrowth slug={saas.slug} compact />
          </Panel>
        ) : (
          <Panel className="p-4 text-sm text-muted-foreground">Publish your page to see the users-over-time chart.</Panel>
        )}
      </section>

      <section id="funnel" className="scroll-mt-14 space-y-3">
        {funnel && funnel.stages.length >= 2 ? <Funnel saasId={saasId} /> : (
          <>
            <SectionLabel>Funnel</SectionLabel>
            <Panel className="p-4 text-sm text-muted-foreground">Connect a traffic, activation or revenue source to see visitors → signups → activated → paying.</Panel>
          </>
        )}
      </section>

      <section id="benchmarks" className="scroll-mt-14 space-y-3">
        <SectionLabel>Benchmarks</SectionLabel>
        <BenchmarkCards saasId={saasId} />
      </section>

      <section id="integrations" className="scroll-mt-14 space-y-6">
        <SectionLabel>Integrations</SectionLabel>
        {(["users", "activation", "traffic", "revenue"] as Role[]).map((role) => {
          const integ = byRole(role);
          const meta = ROLE_META[role];
          const open = replacing === role || adding === role || (role === "users" && !integ);
          return (
            <div key={role} className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{meta.title}{meta.optional && <span className="font-mono text-[11px] font-normal text-muted-foreground"> · optional</span>}</div>
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
            </div>
          );
        })}
      </section>

      <section id="sharing" className="scroll-mt-14 space-y-3">
        <SectionLabel>Sharing</SectionLabel>
        <div className="flex items-center gap-2 border border-line bg-card px-3 py-2 font-mono text-sm">
          <span className="truncate">{url}</span>
          <button onClick={() => copy("url", url)} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground" aria-label="Copy link">
            {copied === "url" ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />}
          </button>
        </div>
        {!saas.isPublic && <p className="font-mono text-[11px] text-muted-foreground">Publish to enable share cards.</p>}
        <div className={cn("grid gap-3 md:grid-cols-2", !saas.isPublic && "pointer-events-none opacity-50")}>
          {availableShareKinds(saas).map((c) => {
            const href = shareUrl(saas.slug, c.kind);
            return (
              <Panel key={c.kind} className="p-3">
                <div className="aspect-[1200/630] w-full overflow-hidden border border-line bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {saas.isPublic && <img src={`${href}/card`} alt={`${c.label} share card`} loading="lazy" className="size-full object-cover" />}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.label}</span>
                  <Button variant="ghost" size="sm" onClick={() => copy(c.kind, href)}>{copied === c.kind ? <Check className="size-3.5 text-pink" /> : <Copy className="size-3.5" />} Copy link</Button>
                  <Button variant="outline" size="sm" render={<Link href={href} />}>Open <ExternalLink className="size-3.5" /></Button>
                </div>
              </Panel>
            );
          })}
        </div>
        {saas.milestones.length > 0 && (
          <>
            <div className="pt-2 text-sm font-medium">Milestones</div>
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
          </>
        )}
      </section>

      <section id="embeds" className="scroll-mt-14 space-y-3">
        <SectionLabel>Embeds</SectionLabel>
        <Panel className="p-4">
          <div className="text-sm font-medium">Badge for your website</div>
          <p className="mt-1 text-xs text-muted-foreground">A live SVG badge that links back to your growth page. Widgets and themes live in the configurator.</p>
          <div className="mt-3"><EmbedBadge slug={saas.slug} name={saas.name} /></div>
          <Button variant="outline" size="sm" className="mt-4" render={<Link href={embedHref} />}>Open embed configurator <ArrowRight className="size-3.5" /></Button>
        </Panel>
      </section>

      <section id="settings" className="scroll-mt-14 space-y-6">
        <div className="space-y-3">
          <SectionLabel>Settings · Details</SectionLabel>
          <Panel className="p-5"><SaasForm initial={saas} submitLabel="Save changes" /></Panel>
        </div>
        {saas.runs.length > 0 && (
          <div className="space-y-3">
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
          </div>
        )}
        <div className="space-y-3">
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
        </div>
      </section>
    </div>
  );
}
