import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { ExternalLink, Flame, Zap, Repeat, Globe, Target, ImageIcon, Award, Apple, Play } from "lucide-react";
import { api } from "@convex/_generated/api";
import { normalizeRole } from "@convex/providers/types";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { MetricCard } from "@/components/blueprint/metric-card";
import { TrustBadge, trustTitle } from "@/components/blueprint/trust-badge";
import { MovementTag } from "@/components/blueprint/movement";
import { SaasLogo, DemoTag } from "@/components/public/saas-card";
import { SaasGrowth } from "@/components/public/saas-growth";
import { ShareButtons } from "@/components/public/share-buttons";
import { FollowButton } from "@/components/public/follow-button";
import { CohortTable, Funnel } from "@/components/public/funnel";
import { FunnelHistory } from "@/components/charts/funnel-history-chart";
import { MilestoneRow } from "@/components/public/milestones";
import { EmbedBadge } from "@/components/public/embed-badge";
import { TrendingExplain } from "@/components/public/trending-explain";
import { formatCompact, formatDelta, formatPct, formatRate, timeAgo } from "@/lib/format";
import { providerLabel, ROLE_META } from "@/lib/providers-ui";
import { categoryLabel } from "@/lib/categories";
import { saasUrl, shareUrl } from "@/lib/site";
import { availableShareKinds } from "@/lib/share";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = await fetchQuery(api.public.saasBySlug, { slug });
  if (!s) return { title: "Not found" };
  const title = `${s.name} — ${formatCompact(s.totalUsers)} users`;
  const description = `${s.description} · +${formatCompact(s.newUsers30d)} new users in 30 days${s.rank ? ` · #${s.rank} on UserTrack` : ""}${s.trendingRank ? ` · #${s.trendingRank} trending` : ""}.`;
  return { title, description, alternates: { canonical: saasUrl(slug) }, openGraph: { title, description, url: saasUrl(slug) }, twitter: { title, description } };
}

export default async function SaasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await fetchQuery(api.public.saasBySlug, { slug });
  if (!s) notFound();
  const [bench, cohorts] = await Promise.all([fetchQuery(api.public.benchmarkHighlight, { slug }), fetchQuery(api.cohorts.publicCohorts, { slug })]);
  const url = saasUrl(slug);
  const mobile = s.projectType === "mobile";
  const storeLinks = s.projectType === "mobile" || s.projectType === "hybrid";
  const hasActivation = s.activatedUsers !== undefined;
  const hasRetention = s.retentionRatePct !== undefined;
  const hasTraffic = s.visitors30d !== undefined;
  // Conversion fields only exist on the public object when the founder published them (visibility gating happens server-side).
  const hasConversion = s.signupToConvertedPct !== undefined || s.convertedUsers !== undefined;
  const userWord = mobile ? "registered users" : "users";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: s.name,
    description: s.description,
    url: s.websiteUrl,
    applicationCategory: categoryLabel(s.category),
    ...(s.logoUrl ? { image: s.logoUrl } : {}),
    ...(s.owner ? { author: { "@type": "Person", name: s.owner.displayName, url: `${url.replace(/\/s\/.*$/, "")}/u/${s.owner.username}` } } : {}),
  };
  const storeChip = "inline-flex items-center gap-1.5 border border-line px-2.5 py-1 text-xs transition-colors hover:border-pink hover:text-pink";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <SaasLogo name={s.name} logoUrl={s.logoUrl} size={56} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{s.name}</h1>
              <TrustBadge trust={s.trust} label={s.trustLabel} />
              {s.isDemo && <DemoTag />}
              {s.rank && <Link href="/leaderboard" className="inline-flex items-center gap-1 border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider hover:border-line-strong">#{s.rank} · 30d <MovementTag m={s.prevRank !== undefined ? { kind: s.prevRank > s.rank ? "up" : s.prevRank < s.rank ? "down" : "same", delta: s.prevRank - s.rank } : null} /></Link>}
              {s.trendingRank && <Link href="/trending" className="inline-flex items-center gap-1 border border-pink/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-pink hover:bg-pink/10"><Flame className="size-3" />#{s.trendingRank} trending</Link>}
              {s.trendingRank && <TrendingExplain slug={slug} />}
            </div>
            <p className="mt-2 max-w-xl text-muted-foreground">{s.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
              <a href={s.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">{new URL(s.websiteUrl).hostname} <ExternalLink className="size-3" /></a>
              {s.category && <Link href={`/categories/${s.category}`} className="hover:text-foreground">{categoryLabel(s.category)}</Link>}
              {s.tags.map((t) => <span key={t}>#{t}</span>)}
            </div>
            {storeLinks && (s.appStoreUrl || s.playStoreUrl) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {s.appStoreUrl && <a href={s.appStoreUrl} target="_blank" rel="noreferrer" className={storeChip}><Apple className="size-3.5" /> App Store</a>}
                {s.playStoreUrl && <a href={s.playStoreUrl} target="_blank" rel="noreferrer" className={storeChip}><Play className="size-3.5" /> Google Play</a>}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FollowButton targetType="saas" targetId={s._id} count={s.followerCount} />
          <ShareButtons url={url} text={`${s.name} just hit ${formatCompact(s.totalUsers)} ${userWord} — growth tracked on UserTrack`} />
        </div>
      </div>

      <section className="mt-8">
        <SectionLabel>Growth</SectionLabel>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label={mobile ? "Registered users" : "Total users"} value={s.totalUsers} accent>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{formatDelta(s.newUsers30d)} this month</div>
          </MetricCard>
          <MetricCard label="New users · 24h" value={s.newUsers24h} />
          <MetricCard label="New users · 7d" value={s.newUsers7d}>
            {s.growth7dPct !== undefined && <div className="mt-1 font-mono text-xs text-muted-foreground">{formatPct(s.growth7dPct)} growth</div>}
          </MetricCard>
          <MetricCard label="New users · 30d" value={s.newUsers30d}>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{formatPct(s.growth30dPct)} growth</div>
          </MetricCard>
        </div>
        {bench && (
          <div className="mt-3"><span title={`Compared with ${formatCompact(bench.sampleSize)} verified products. Refreshed daily.`} className="inline-flex max-w-full items-center gap-1.5 border border-pink/60 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-pink"><Award className="size-3 shrink-0" /><span className="truncate">{bench.statement}</span></span></div>
        )}
        <Panel className="mt-3 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Users over time</SectionLabel>
            <span className="font-mono text-[11px] text-muted-foreground">{s.lastSyncedAt ? `synced ${timeAgo(s.lastSyncedAt)}` : "no sync yet"}</span>
          </div>
          <SaasGrowth slug={slug} />
        </Panel>
        {hasTraffic && (
          <Panel className="mt-3 p-4 sm:p-5">
            <div className="flex items-center justify-between"><SectionLabel>Visitors · 30d</SectionLabel><Globe className="size-4 text-pink" /></div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{formatCompact(s.visitors30d!)}</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              {s.sessions30d !== undefined ? `${formatCompact(s.sessions30d)} sessions` : ""}
              {s.visitorsPrev30d ? ` · ${formatPct(((s.visitors30d! - s.visitorsPrev30d) / s.visitorsPrev30d) * 100)} vs prior 30d` : ""}
            </div>
            <div className="mt-3 border-t border-line pt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Shared by the founder</div>
          </Panel>
        )}
      </section>

      {(hasActivation || hasRetention) && (
        <section className="mt-8">
          <SectionLabel>Engagement</SectionLabel>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {hasActivation && (
              <Panel className="p-4 sm:p-5">
                <div className="flex items-center justify-between"><SectionLabel>Activated users</SectionLabel><Zap className="size-4 text-pink" /></div>
                <div className="mt-2 text-3xl font-semibold tracking-tight">{formatRate(s.activationRatePct)}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{formatCompact(s.activatedUsers!)} of all {userWord} activated</div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
                  <Mini label="24h" value={s.activated24h} /><Mini label="7d" value={s.activated7d} /><Mini label="30d" value={s.activated30d} />
                </div>
              </Panel>
            )}
            {hasRetention && (
              <Panel className="p-4 sm:p-5">
                <div className="flex items-center justify-between"><SectionLabel>Retention · 30d</SectionLabel><Repeat className="size-4 text-pink" /></div>
                <div className="mt-2 text-3xl font-semibold tracking-tight">{formatRate(s.retentionRatePct)}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{formatCompact(s.retainedUsers ?? 0)} retained · {formatCompact(s.churnedUsers ?? 0)} churned</div>
                <div className="mt-3 border-t border-line pt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground" title="Estimated from users active in the last 30 days minus new signups, over the cohort that existed 30 days ago.">{s.retentionSource === "verified" ? "Verified cohort" : "Estimated from active users"}</div>
              </Panel>
            )}
          </div>
        </section>
      )}

      {hasConversion && (
        <section className="mt-8">
          <SectionLabel>Conversion</SectionLabel>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {s.signupToConvertedPct !== undefined && (
              <Panel className="p-4 sm:p-5">
                <div className="flex items-center justify-between"><SectionLabel>Signup → Converted</SectionLabel><Target className="size-4 text-pink" /></div>
                <div className="mt-2 text-3xl font-semibold tracking-tight">{formatRate(s.signupToConvertedPct)}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{s.activatedToConvertedPct !== undefined ? `${formatRate(s.activatedToConvertedPct)} activated → converted` : "of all signups convert"}</div>
              </Panel>
            )}
            {s.trialToConvertedPct !== undefined && (
              <Panel className="p-4 sm:p-5">
                <SectionLabel>Trial → Converted</SectionLabel>
                <div className="mt-2 text-3xl font-semibold tracking-tight">{formatRate(s.trialToConvertedPct)}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{s.trialUsers !== undefined ? `${formatCompact(s.trialUsers)} on trial now` : "of trial users convert"}</div>
              </Panel>
            )}
            {s.convertedUsers !== undefined && (
              <Panel className="p-4 sm:p-5">
                <SectionLabel>Converted users</SectionLabel>
                <div className="mt-2 text-3xl font-semibold tracking-tight">{formatCompact(s.convertedUsers)}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{s.newConverted30d !== undefined ? `${formatDelta(s.newConverted30d)} in 30d` : "converted users"}{s.convertedGrowth30dPct !== undefined ? ` · ${formatPct(s.convertedGrowth30dPct)}` : ""}</div>
              </Panel>
            )}
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Users who convert, never revenue · shared by the founder</p>
        </section>
      )}

      <Funnel className="mt-8" slug={slug} />
      <FunnelHistory className="mt-3" slug={slug} />
      {cohorts && cohorts.cohorts.length > 0 && <CohortTable className="mt-3" data={cohorts} />}

      {s.milestones.length > 0 && (
        <section className="mt-8">
          <div className="flex items-end justify-between">
            <SectionLabel>Milestones</SectionLabel>
            <span className="font-mono text-[11px] text-muted-foreground">Detected automatically · click to share</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {s.milestones.map((m) => <MilestoneRow key={m._id} m={m} slug={slug} compact />)}
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-3 md:grid-cols-2">
        {s.owner && (
          <Link href={`/u/${s.owner.username}`} className="group block min-w-0">
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
          <div className="flex items-center justify-between"><div className="text-label">Provenance</div><TrustBadge trust={s.trust} label={s.trustLabel} /></div>
          <div className="mt-1 text-sm">{trustTitle(s.trustLabel)}</div>
          {s.sources.length > 0 && (
            <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-muted-foreground">
              {s.sources.map((src) => <li key={src.role}><span className="text-foreground/80">{ROLE_META[normalizeRole(src.role)].label}</span> · {providerLabel(src.provider)}</li>)}
            </ul>
          )}
          <div className="mt-2 font-mono text-[11px] text-muted-foreground">Snapshots every 4h · immutable history{s.firstSnapshotAt ? ` · tracking since ${new Date(s.firstSnapshotAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}` : ""}</div>
        </Panel>
      </div>

      <section className="mt-8">
        <SectionLabel>Share &amp; embed</SectionLabel>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
          <Panel className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium"><ImageIcon className="size-4 text-pink" /> Share cards</div>
            <p className="mt-1 text-xs text-muted-foreground">Each card has its own preview image for X, LinkedIn, Slack, Discord and iMessage.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {availableShareKinds(s).map((c) => (
                <Link key={c.kind} href={shareUrl(slug, c.kind)} className={cn("border border-line px-3 py-2 text-sm transition-colors hover:border-pink hover:text-pink")}>{c.label}</Link>
              ))}
            </div>
          </Panel>
          <Panel className="p-4">
            <div className="text-sm font-medium">Badge for your website</div>
            <div className="mt-3"><EmbedBadge slug={slug} name={s.name} /></div>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function Mini({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <div className="text-label">{label}</div>
      <div className="tabular font-mono text-sm">{value === undefined ? "—" : formatDelta(value)}</div>
    </div>
  );
}
