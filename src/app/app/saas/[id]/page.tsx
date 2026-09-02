"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ExternalLink, Trash2, Copy, Check, Eye, Trophy, ArrowRight, Apple, Play } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { VISIBILITY_KEYS, VISIBILITY_META } from "@convex/domain/visibility";
import { normalizeRole } from "@convex/providers/types";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { MetricCard } from "@/components/blueprint/metric-card";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { SaasForm } from "@/components/app/saas-form";
import { ConnectSource, SourceStatus } from "@/components/app/connect-source";
import { BenchmarkCards } from "@/components/app/benchmark-cards";
import { SaasGrowth } from "@/components/public/saas-growth";
import { CohortTable, Funnel } from "@/components/public/funnel";
import { FunnelHistory } from "@/components/charts/funnel-history-chart";
import { EmbedBadge } from "@/components/public/embed-badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { saasUrl, shareUrl } from "@/lib/site";
import { availableShareKinds } from "@/lib/share";
import { formatCompact, formatDelta, formatPct, formatRate, timeAgo } from "@/lib/format";
import { NO_REVENUE_NOTE, ROLE_META, ROLES, type Role } from "@/lib/providers-ui";
import { cn } from "@/lib/utils";

const NAV = [["growth", "Growth"], ["engagement", "Engagement"], ["conversion", "Conversion"], ["funnel", "Funnel"], ["benchmarks", "Benchmarks"], ["integrations", "Integrations"], ["sharing", "Sharing"], ["embeds", "Embeds"], ["visibility", "Visibility"], ["settings", "Settings"]] as const;
const GROUPS = ["growth", "engagement", "conversion"] as const;
const STALE_MS = 49 * 3_600_000;
type Health = "healthy" | "attention" | "stale" | "none";
const HEALTH: Record<Health, { label: string; cls: string }> = {
  healthy: { label: "Healthy", cls: "border-pink/60 text-pink" },
  attention: { label: "Needs attention", cls: "border-destructive/60 text-destructive" },
  stale: { label: "Stale", cls: "border-line text-muted-foreground" },
  none: { label: "Not connected", cls: "border-line text-muted-foreground" },
};

export default function ManageSaasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const saasId = id as Id<"saas">;
  const router = useRouter();
  const saas = useQuery(api.saas.getMine, { id: saasId });
  const funnel = useQuery(api.saas.funnel, { id: saasId, timeframe: "30d" });
  const cohorts = useQuery(api.cohorts.mine, { id: saasId });
  const setPublic = useMutation(api.saas.setPublic);
  const setVisibility = useMutation(api.saas.setVisibility);
  const remove = useMutation(api.saas.remove);
  const [replacing, setReplacing] = useState<Role | null>(null);
  const [adding, setAdding] = useState<Role | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  if (saas === undefined) return <div className="mx-auto max-w-5xl space-y-4 p-6"><Skeleton className="h-8 w-56" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (saas === null) return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;

  const url = saasUrl(saas.slug);
  const embedHref = `/app/saas/${id}/embed`;
  const mobile = saas.projectType === "mobile";
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
  const users = byRole("users"), activation = byRole("activation"), conversion = byRole("conversion");
  const velocity = saas.newUsersPrev30d !== undefined && saas.newUsersPrev30d > 0 ? Math.round(((saas.newUsers30d - saas.newUsersPrev30d) / saas.newUsersPrev30d) * 1000) / 10 : undefined;
  // Owner sees a conversion share card only once the rate is public — the public card would render "—" otherwise.
  const shareKinds = availableShareKinds({ ...saas, signupToConvertedPct: saas.visibility.conversionRate ? saas.signupToConvertedPct : undefined });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionLabel><Link href="/app/saas" className="hover:text-foreground">My SaaS</Link> / {saas.name}</SectionLabel>
          <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">{saas.name} <TrustBadge trust={saas.trust} label={saas.trustLabel} /></h1>
          {(saas.appStoreUrl || saas.playStoreUrl) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {saas.appStoreUrl && <a href={saas.appStoreUrl} target="_blank" rel="noreferrer" className={chip}><Apple className="size-3.5" /> App Store</a>}
              {saas.playStoreUrl && <a href={saas.playStoreUrl} target="_blank" rel="noreferrer" className={chip}><Play className="size-3.5" /> Google Play</a>}
            </div>
          )}
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
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">Trust score {saas.trustScore ?? "—"} / 100</span>
        </Panel>
      )}

      <section id="growth" className="scroll-mt-14 space-y-3">
        <GroupHeader title="Growth" integ={users} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label={mobile ? "Registered users" : "Total users"} value={saas.totalUsers} accent />
          <MetricCard label="New users · 24h" value={saas.newUsers24h} />
          <MetricCard label="New users · 7d" value={saas.newUsers7d}><div className="mt-1 font-mono text-xs text-muted-foreground">{formatPct(saas.growth7dPct ?? 0)} growth</div></MetricCard>
          <MetricCard label="New users · 30d" value={saas.newUsers30d}>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{formatPct(saas.growth30dPct)} growth · rank {saas.rank ?? "—"}{saas.trendingRank ? ` · trending #${saas.trendingRank}` : ""}</div>
          </MetricCard>
        </div>
        <Panel className="p-4">
          <div className="text-label">Velocity · 30d</div>
          <div className="mt-1 flex items-baseline gap-2"><span className={cn("text-2xl font-semibold", velocity !== undefined && (velocity >= 0 ? "text-pink" : "text-destructive"))}>{velocity !== undefined ? formatPct(velocity) : "—"}</span><span className="font-mono text-[11px] text-muted-foreground">{saas.newUsersPrev30d !== undefined ? `${formatDelta(saas.newUsers30d - saas.newUsersPrev30d)} new users vs the previous 30 days (${formatCompact(saas.newUsersPrev30d)})` : "needs 60 days of history"}</span></div>
        </Panel>
        {saas.isPublic ? (
          <Panel className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between"><span className="text-sm font-medium">Users over time</span><span className="font-mono text-[11px] text-muted-foreground">{saas.lastSyncedAt ? `synced ${timeAgo(saas.lastSyncedAt)}` : "no sync yet"}</span></div>
            <SaasGrowth slug={saas.slug} compact />
          </Panel>
        ) : (
          <Panel className="p-4 text-sm text-muted-foreground">Publish your page to see the users-over-time chart.</Panel>
        )}
      </section>

      <section id="engagement" className="scroll-mt-14 space-y-3">
        <GroupHeader title="Engagement" integ={activation} />
        {activation ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Activated users" value={saas.activatedUsers ?? 0} delta={saas.activated30d}><div className="mt-1 font-mono text-xs text-muted-foreground">in 30d</div></MetricCard>
            <Stat label="Activation rate" value={formatRate(saas.activationRatePct)} sub="activated ÷ users" />
            {saas.retentionRatePct !== undefined && <Stat label="Retention · 30d" value={formatRate(saas.retentionRatePct)} sub={`estimated · ${formatCompact(saas.churnedUsers ?? 0)} churned`} />}
          </div>
        ) : (
          <Panel className="p-4 text-sm text-muted-foreground">Connect an activation source under <a href="#integrations" className="text-foreground underline-offset-2 hover:underline">Integrations</a> to see activated users and the activation rate.</Panel>
        )}
      </section>

      <section id="conversion" className="scroll-mt-14 space-y-3">
        <GroupHeader title="Conversion" integ={conversion} />
        {conversion ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {saas.trialUsers !== undefined && <MetricCard label="Trial users" value={saas.trialUsers} delta={saas.newTrials30d}><div className="mt-1 font-mono text-xs text-muted-foreground">new trials in 30d</div></MetricCard>}
              <MetricCard label="Converted users" value={saas.convertedUsers ?? 0} delta={saas.newConverted30d}><div className="mt-1 font-mono text-xs text-muted-foreground">{saas.convertedGrowth30dPct !== undefined ? `${formatPct(saas.convertedGrowth30dPct)} in 30d` : "in 30d"}</div></MetricCard>
              <Stat label="Signup → Converted" value={formatRate(saas.signupToConvertedPct)} sub="of all users" />
              <Stat label="Activated → Converted" value={formatRate(saas.activatedToConvertedPct)} sub={activation ? "of activated users" : "needs an activation source"} />
              {saas.trialUsers !== undefined && <Stat label="Trial → Converted" value={formatRate(saas.trialToConvertedPct)} sub="of trial users" />}
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">{NO_REVENUE_NOTE}</p>
          </>
        ) : (
          <Panel className="p-4 text-sm text-muted-foreground">Connect a payment provider under <a href="#integrations" className="text-foreground underline-offset-2 hover:underline">Integrations</a> to see trial and converted users. {NO_REVENUE_NOTE}</Panel>
        )}
      </section>

      <section id="funnel" className="scroll-mt-14 space-y-3">
        <SectionLabel>Funnel</SectionLabel>
        {funnel && funnel.stages.length >= 2 ? (
          <>
            <Funnel saasId={saasId} />
            <FunnelHistory saasId={saasId} />
            {cohorts && cohorts.cohorts.length > 0 && <CohortTable data={cohorts} />}
          </>
        ) : (
          <Panel className="p-4 text-sm text-muted-foreground">Connect a traffic, activation or conversion source to see how users discover, activate and convert.</Panel>
        )}
      </section>

      <section id="benchmarks" className="scroll-mt-14 space-y-3">
        <SectionLabel>Benchmarks</SectionLabel>
        <BenchmarkCards saasId={saasId} />
      </section>

      <section id="integrations" className="scroll-mt-14 space-y-6">
        <SectionLabel>Integrations</SectionLabel>
        {ROLES.map((role) => {
          const integ = byRole(role);
          const meta = ROLE_META[role];
          const open = replacing === role || adding === role || (role === "users" && !integ);
          return (
            <div key={role} className="space-y-3">
              <div>
                <div className="text-sm font-medium">{meta.title}{meta.optional && <span className="font-mono text-[11px] font-normal text-muted-foreground"> · optional</span>}</div>
                <p className="mt-1 text-xs text-muted-foreground">{meta.blurb}</p>
                {role === "conversion" && <p className="mt-1 font-mono text-[11px] text-muted-foreground">{NO_REVENUE_NOTE}</p>}
              </div>
              {integ && !open ? (
                <SourceStatus saasId={saasId} integration={integ} totalUsers={role === "users" ? saas.totalUsers : undefined} trust={saas.trust} trustLabel={saas.trustLabel} onReplace={() => setReplacing(role)} onDisconnect={() => setAdding(null)} />
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
          {shareKinds.map((c) => {
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

      <section id="visibility" className="scroll-mt-14 space-y-3">
        <SectionLabel>Public metrics</SectionLabel>
        <Panel className="divide-y divide-line p-0">
          <p className="px-4 py-3 text-sm text-muted-foreground">Connection ≠ publication — connecting a source never publishes it. Each metric below is private until you switch it on.</p>
          {GROUPS.map((group) => (
            <div key={group} className="space-y-3 px-4 py-3">
              <div className="text-label">{group}</div>
              {VISIBILITY_KEYS.filter((k) => VISIBILITY_META[k].group === group).map((k) => {
                const hint = k === "traffic" && !byRole("traffic") ? "Connect a reach source first" : group === "conversion" && !conversion ? "Connect a conversion source first" : null;
                return (
                  <label key={k} className="flex items-start justify-between gap-4">
                    <span>
                      <span className="block text-sm">{VISIBILITY_META[k].label}</span>
                      <span className="block text-xs text-muted-foreground">{VISIBILITY_META[k].blurb}{hint ? ` · ${hint}.` : ""}</span>
                    </span>
                    <Switch checked={saas.visibility[k]} disabled={Boolean(hint)} onCheckedChange={(v) => setVisibility({ id: saasId, visibility: { [k]: v } })} />
                  </label>
                );
              })}
            </div>
          ))}
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
                  <span className="w-16 text-muted-foreground">{ROLE_META[normalizeRole(r.role)].label}</span>
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

// Group health mirrors the funnel's stage health: error → attention, no success for 2 days → stale.
type Integ = { status: string; lastSuccessAt?: number };
const groupHealth = (integ?: Integ): Health => (!integ ? "none" : integ.status === "error" ? "attention" : integ.lastSuccessAt !== undefined && Date.now() - integ.lastSuccessAt > STALE_MS ? "stale" : "healthy");

function GroupHeader({ title, integ }: { title: string; integ?: Integ }) {
  const health = groupHealth(integ);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SectionLabel>{title}</SectionLabel>
      <span className={cn("inline-flex items-center border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", HEALTH[health].cls)}>{HEALTH[health].label}</span>
      {integ?.lastSuccessAt !== undefined && <span className="font-mono text-[11px] text-muted-foreground">Updated {timeAgo(integ.lastSuccessAt)}</span>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Panel className="p-4 sm:p-5">
      <div className="text-label">{label}</div>
      <div className="tabular mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{value}</div>
      {sub && <div className="mt-1 font-mono text-xs text-muted-foreground">{sub}</div>}
    </Panel>
  );
}
