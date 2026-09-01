import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { ExternalLink } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { MetricCard } from "@/components/blueprint/metric-card";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { SaasLogo, DemoTag } from "@/components/public/saas-card";
import { SaasGrowth } from "@/components/public/saas-growth";
import { ShareButtons } from "@/components/public/share-buttons";
import { formatCompact, formatPct, timeAgo } from "@/lib/format";
import { PROVIDERS } from "@/lib/providers-ui";
import { saasUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = await fetchQuery(api.public.saasBySlug, { slug });
  if (!s) return { title: "Not found" };
  const title = `${s.name} — ${formatCompact(s.totalUsers)} users`;
  const description = `${s.description} · +${formatCompact(s.newUsers30d)} new users in 30 days${s.rank ? ` · #${s.rank} on UserTrack` : ""}.`;
  return { title, description, openGraph: { title, description, url: saasUrl(slug) }, twitter: { title, description } };
}

export default async function SaasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await fetchQuery(api.public.saasBySlug, { slug });
  if (!s) notFound();
  const url = saasUrl(slug);
  const source = PROVIDERS.find((p) => p.kind === s.source)?.label;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <SaasLogo name={s.name} logoUrl={s.logoUrl} size={56} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{s.name}</h1>
              <TrustBadge trust={s.trust} />
              {s.isDemo && <DemoTag />}
              {s.rank && <span className="border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">#{s.rank} · 30d</span>}
            </div>
            <p className="mt-2 max-w-xl text-muted-foreground">{s.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
              <a href={s.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">{new URL(s.websiteUrl).hostname} <ExternalLink className="size-3" /></a>
              {s.tags.map((t) => <span key={t}>#{t}</span>)}
            </div>
          </div>
        </div>
        <ShareButtons url={url} text={`${s.name} just hit ${formatCompact(s.totalUsers)} users — growth tracked on UserTrack`} />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total users" value={s.totalUsers} accent />
        <MetricCard label="New · 24h" value={s.newUsers24h} />
        <MetricCard label="New · 7d" value={s.newUsers7d} />
        <MetricCard label="New · 30d" value={s.newUsers30d}>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{formatPct(s.growth30dPct)} growth</div>
        </MetricCard>
      </div>

      <Panel className="mt-3 p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>Users over time</SectionLabel>
          <span className="font-mono text-[11px] text-muted-foreground">{s.lastSyncedAt ? `synced ${timeAgo(s.lastSyncedAt)}` : "no sync yet"}</span>
        </div>
        <SaasGrowth slug={slug} />
      </Panel>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {s.owner && (
          <Link href={`/u/${s.owner.username}`} className="group">
            <Panel className="flex h-full items-center gap-4 p-4 transition-colors group-hover:border-line-strong">
              <div className="grid size-12 shrink-0 place-items-center border border-line bg-background font-mono">{s.owner.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.owner.avatarUrl} alt="" className="size-full object-cover" />
              ) : s.owner.displayName.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0">
                <div className="text-label">Built by</div>
                <div className="truncate font-medium">{s.owner.displayName}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">@{s.owner.username}{s.owner.bio ? ` · ${s.owner.bio}` : ""}</div>
              </div>
            </Panel>
          </Link>
        )}
        <Panel className="p-4">
          <div className="text-label">Provenance</div>
          <div className="mt-1 text-sm">
            {s.trust === "verified" ? `Read-only sync from ${source ?? "a connected source"}. Numbers cannot be typed in.` : s.trust === "unverified" ? "Self-reported by the founder. Not eligible for ranking." : "Connected — waiting for the first successful sync."}
          </div>
          <div className="mt-2 font-mono text-[11px] text-muted-foreground">Snapshots every 4h · immutable history{s.firstSnapshotAt ? ` · tracking since ${new Date(s.firstSnapshotAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}` : ""}</div>
        </Panel>
      </div>
    </div>
  );
}
