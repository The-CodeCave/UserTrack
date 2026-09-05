import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publicQuery } from "@/lib/convex-public";
import { ExternalLink, Flame, Zap, Repeat, Globe, Target, ImageIcon, Award, Apple, Play, EyeOff } from "lucide-react";
import { api } from "@convex/_generated/api";
import { normalizeRole } from "@convex/providers/types";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { MetricCard } from "@/components/blueprint/metric-card";
import { TrustBadge, trustTitle } from "@/components/blueprint/trust-badge";
import { MovementTag } from "@/components/blueprint/movement";
import { StreakChip } from "@/components/blueprint/streak-chip";
import { SaasLogo, DemoTag, MiniSaasCard } from "@/components/public/saas-card";
import { SaasGrowth } from "@/components/public/saas-growth";
import { RankHistoryChart } from "@/components/charts/rank-history-chart";
import { ShareButtons } from "@/components/public/share-buttons";
import { ShareButton } from "@/components/share/share-button";
import { shareCopy, type ShareKind } from "@/lib/share";
import { FollowButton } from "@/components/public/follow-button";
import { CohortTable, Funnel } from "@/components/public/funnel";
import { FunnelHistory } from "@/components/charts/funnel-history-chart";
import { MilestoneRow } from "@/components/public/milestones";
import { EmbedBadge } from "@/components/public/embed-badge";
import { TrendingExplain } from "@/components/public/trending-explain";
import { formatCompact, formatDelta, formatPct, formatRate, timeAgo } from "@/lib/format";
import { providerLabel, ROLE_META } from "@/lib/providers-ui";
import { categoryLabel } from "@/lib/categories";
import { StackChip } from "@/components/public/stack-chip";
import { countryFlag, countryName } from "@/lib/countries";
import { channelLabel, fundingLabel, marketLabel, teamSizeLabel } from "@/lib/profile-options";
import { xProfileUrl } from "@/lib/social";
import { GitHubIcon } from "@/components/auth/provider-icons";
import { saasUrl, shareUrl } from "@/lib/site";
import { availableShareKinds } from "@/lib/share";
import { cn } from "@/lib/utils";

export const revalidate = 300;
// Registers the route for on-demand ISR: without generateStaticParams a dynamic segment is never cached.
export const generateStaticParams = async () => [];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = await publicQuery(api.public.saasBySlug, { slug });
  if (!s) return { title: "Not found" };
  const title = `${s.name} — ${formatCompact(s.totalUsers)} users`;
  const description = `${s.description} · +${formatCompact(s.newUsers30d)} new users in 30 days${s.rank ? ` · #${s.rank} on UserTrack` : ""}${s.trendingRank ? ` · #${s.trendingRank} trending` : ""}.`;
  // hideFromSearch: the page stays reachable and linkable, search engines are asked not to index it.
  return { title, description, alternates: { canonical: saasUrl(slug) }, openGraph: { title, description, url: saasUrl(slug) }, twitter: { title, description }, robots: s.hideFromSearch ? { index: false, follow: true } : undefined };
}

export default async function SaasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await publicQuery(api.public.saasBySlug, { slug });
  if (!s) notFound();
  const [bench, cohorts, related] = await Promise.all([publicQuery(api.public.benchmarkHighlight, { slug }), publicQuery(api.cohorts.publicCohorts, { slug }), publicQuery(api.public.related, { slug, limit: 4 })]);
  const ranked = Boolean(s.rank || s.trendingRank);
  // "up from Top 25% last month" only when the previous standing exists and differs.
  const benchChange = bench?.previousPercentile !== undefined && bench.previousPercentile !== bench.percentile ? `${bench.percentile > bench.previousPercentile ? "up" : "down"} from ${bench.previousBand ?? `top ${100 - bench.previousPercentile}%`} last month` : null;
  const url = saasUrl(slug);
  const mobile = s.projectType === "mobile";
  const storeLinks = s.projectType === "mobile" || s.projectType === "hybrid";
  const hasActivation = s.activatedUsers !== undefined;
  const hasRetention = s.retentionRatePct !== undefined;
  const hasTraffic = s.visitors30d !== undefined;
  // Conversion fields only exist on the public object when the founder published them (visibility gating happens server-side).
  const hasConversion = s.signupToConvertedPct !== undefined || s.convertedUsers !== undefined;
  const userWord = mobile ? "registered users" : "users";
  const about = [["What it does", s.valueProposition], ["Problem solved", s.problemSolved], ["Who it's for", s.audience], ["Pricing model", s.pricingSummary], ["More", s.additionalInfo]].filter((r): r is [string, string] => Boolean(r[1]));
  const facts = [
    s.country ? `${countryFlag(s.country)} ${countryName(s.country) ?? s.country}` : null,
    fundingLabel(s.funding),
    s.teamSize ? `Team of ${teamSizeLabel(s.teamSize)}` : null,
    s.foundedAt ? `Founded ${new Date(s.foundedAt).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" })}` : null,
  ].filter((f): f is string => Boolean(f));
  const hasCompany = facts.length > 0 || Boolean(s.markets?.length) || Boolean(s.marketingChannels?.length) || Boolean(s.techStack?.length);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: s.name,
    description: s.description,
    ...(s.websiteUrl ? { url: s.websiteUrl } : {}),
    applicationCategory: categoryLabel(s.category),
    ...(s.logoUrl ? { image: s.logoUrl } : {}),
    ...(s.owner ? { author: { "@type": "Person", name: s.owner.displayName, url: `${url.replace(/\/s\/.*$/, "")}/u/${s.owner.username}` } } : {}),
  };
  const storeChip = "inline-flex items-center gap-1.5 border border-line px-2.5 py-1 text-xs transition-colors hover:border-pink hover:text-pink";
  // One studio target per shareable metric; the card renders from the same public projection this page shows.
  const share = (kind: ShareKind, label: string, graph = false) => ({ page: shareUrl(slug, kind), slug, kind, label: `${s.name} · ${label}`, trust: s.trust, graph, text: shareCopy(s, kind).text });

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
              {(s.streakDays ?? 0) >= 7 && s.trust === "verified" && s.visibility.growth && <StreakChip days={s.streakDays!} />}
              {s.rank && <Link href="/leaderboard" className="inline-flex items-center gap-1 border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider hover:border-line-strong">#{s.rank} · 30d <MovementTag m={s.prevRank !== undefined ? { kind: s.prevRank > s.rank ? "up" : s.prevRank < s.rank ? "down" : "same", delta: s.prevRank - s.rank } : null} /></Link>}
              {s.trendingRank && <Link href="/trending" className="inline-flex items-center gap-1 border border-pink/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-pink hover:bg-pink/10"><Flame className="size-3" />#{s.trendingRank} trending</Link>}
              {s.trendingRank && <TrendingExplain slug={slug} />}
              {(s.rank || s.trendingRank) && <ShareButton target={share(s.trendingRank ? "trending" : "rank", s.trendingRank ? `#${s.trendingRank} trending` : `#${s.rank} on UserTrack`)} className="size-6" />}
            </div>
            <p className="mt-2 max-w-xl text-muted-foreground">{s.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
              {s.websiteUrl && <a href={s.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">{new URL(s.websiteUrl).hostname} <ExternalLink className="size-3" /></a>}
              {s.trustmrrSlug && <a href={`https://trustmrr.com/startup/${s.trustmrrSlug}`} target="_blank" rel="noreferrer nofollow" className="inline-flex items-center gap-1 hover:text-foreground">Also on TrustMRR <ExternalLink className="size-3" /></a>}
              {s.anonymous && <span className="inline-flex items-center gap-1" title="The founder chose anonymous mode: identity, logo and links are hidden."><EyeOff className="size-3" /> anonymous</span>}
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

      {about.length > 0 && (
        <section className="mt-8">
          <SectionLabel>About</SectionLabel>
          <Panel className="mt-3 grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            {about.map(([label, text]) => (
              <div key={label} className={cn("min-w-0", label === "More" && "sm:col-span-2")}>
                <div className="text-label">{label}</div>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </Panel>
        </section>
      )}

      <section className="mt-8">
        <SectionLabel>Growth</SectionLabel>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label={mobile ? "Registered users" : "Total users"} value={s.totalUsers} accent action={<ShareButton target={share("users", `${formatCompact(s.totalUsers)} users`, true)} />}>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{formatDelta(s.newUsers30d)} this month</div>
          </MetricCard>
          <MetricCard label="New users · 24h" value={s.newUsers24h} />
          <MetricCard label="New users · 7d" value={s.newUsers7d} action={<ShareButton target={share("week", `${formatDelta(s.newUsers7d)} this week`, true)} />}>
            {s.growth7dPct !== undefined && <div className="mt-1 font-mono text-xs text-muted-foreground">{formatPct(s.growth7dPct)} growth</div>}
          </MetricCard>
          <MetricCard label="New users · 30d" value={s.newUsers30d} action={<ShareButton target={share("growth", `${formatDelta(s.newUsers30d)} in 30 days`, true)} />}>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{formatPct(s.growth30dPct)} growth</div>
          </MetricCard>
        </div>
        {bench && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span title={`Compared with ${formatCompact(bench.sampleSize)} verified products. Refreshed daily.`} className="inline-flex max-w-full items-center gap-1.5 border border-pink/60 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-pink"><Award className="size-3 shrink-0" /><span className="truncate">{bench.statement}</span></span>
            <span className="border border-line px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{bench.band}{benchChange ? ` · ${benchChange}` : ""}</span>
            <ShareButton variant="chip" target={share("benchmark", bench.statement)}>Share</ShareButton>
          </div>
        )}
        <Panel className="mt-3 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <SectionLabel>Users over time</SectionLabel>
            <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-muted-foreground">{s.lastSyncedAt ? `synced ${timeAgo(s.lastSyncedAt)}` : "no sync yet"}</span><ShareButton variant="chip" target={share("users", "growth chart", true)}>Share as card</ShareButton></div>
          </div>
          <SaasGrowth slug={slug} />
        </Panel>
        {ranked && (
          <Panel className="mt-3 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <SectionLabel>Rank history</SectionLabel>
              <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                {s.rank && <Link href="/leaderboard" className="hover:text-foreground">Leaderboard</Link>}
                {s.trendingRank && <Link href="/trending" className="hover:text-foreground">Trending</Link>}
                <Link href="/rankings" className="hover:text-foreground">Monthly archive</Link>
              </div>
            </div>
            <RankHistoryChart slug={slug} hasLeaderboard={Boolean(s.rank)} hasTrending={Boolean(s.trendingRank)} />
          </Panel>
        )}
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
                <div className="flex items-center justify-between"><SectionLabel>Activated users</SectionLabel><div className="flex items-center gap-1"><Zap className="size-4 text-pink" /><ShareButton target={share("activation", `${formatRate(s.activationRatePct)} activation`)} /></div></div>
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
                <div className="flex items-center justify-between"><SectionLabel>Signup → Converted</SectionLabel><div className="flex items-center gap-1"><Target className="size-4 text-pink" /><ShareButton target={share("conversion", `${formatRate(s.signupToConvertedPct)} signup → converted`)} /></div></div>
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

      {hasCompany && (
        <section className="mt-8">
          <SectionLabel>Company &amp; stack</SectionLabel>
          <Panel className="mt-3 space-y-4 p-4 sm:p-5">
            {facts.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {facts.map((f) => <span key={f}>{f}</span>)}
              </div>
            )}
            {Boolean(s.techStack?.length) && (
              <div>
                <div className="text-label">Built with</div>
                <div className="mt-2 flex flex-wrap gap-1.5">{s.techStack!.map((t) => <StackChip key={t} slug={t} />)}</div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {Boolean(s.markets?.length) && (
                <div>
                  <div className="text-label">Markets</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">{s.markets!.map((m) => <span key={m} className="border border-line px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{marketLabel(m)}</span>)}</div>
                </div>
              )}
              {Boolean(s.marketingChannels?.length) && (
                <div>
                  <div className="text-label">Growth channels</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">{s.marketingChannels!.map((c) => <span key={c} className="border border-line px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{channelLabel(c)}</span>)}</div>
                </div>
              )}
            </div>
          </Panel>
        </section>
      )}

      <div className="mt-8 grid gap-3 md:grid-cols-2">
        {s.anonymous && (
          <Panel className="flex h-full items-center gap-4 p-4">
            <div className="grid size-12 shrink-0 place-items-center border border-line bg-background text-muted-foreground"><EyeOff className="size-5" /></div>
            <div className="min-w-0">
              <div className="text-label">Built by</div>
              <div className="font-medium">An anonymous founder</div>
              <div className="font-mono text-[11px] text-muted-foreground">Identity, cofounders, logo and links are hidden on request. The numbers are real.</div>
            </div>
          </Panel>
        )}
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
                <div className="truncate font-mono text-[11px] text-muted-foreground">@{s.owner.username}{s.owner.xFollowers !== undefined ? ` · 𝕏 ${formatCompact(s.owner.xFollowers)} followers` : ""}{s.owner.bio ? ` · ${s.owner.bio}` : ""}</div>
                {Boolean(s.cofounders?.length) && (
                  <ul className="mt-2 space-y-0.5 border-t border-line pt-2 font-mono text-[11px] text-muted-foreground">
                    {s.cofounders!.map((c, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-x-2">
                        <span className="text-foreground/80">{c.name ?? c.x ?? c.github}</span>
                        {c.x && <a href={xProfileUrl(c.x)} target="_blank" rel="noreferrer" className="hover:text-foreground">@{c.x}</a>}
                        {c.github && <a href={`https://github.com/${c.github}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground"><GitHubIcon className="size-3" />{c.github}</a>}
                      </li>
                    ))}
                  </ul>
                )}
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

      {related.length > 0 && (
        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <SectionLabel>Similar products</SectionLabel>
            <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
              {s.category && <Link href={`/categories/${s.category}`} className="hover:text-foreground">All {categoryLabel(s.category)}</Link>}
              <Link href="/compare" className="hover:text-foreground">Compare</Link>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {related.map((r) => <MiniSaasCard key={r._id} s={r} metric={{ label: "30d", value: formatDelta(r.newUsers30d) }} />)}
          </div>
        </section>
      )}

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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">Badge for your website</div>
              {s.embedSiteCount ? <span className="inline-flex items-center gap-1 border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><Globe className="size-3" />Embedded on {s.embedSiteCount} {s.embedSiteCount === 1 ? "site" : "sites"}</span> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Static SVG. Founders get live widgets with auto theme in the dashboard.</p>
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
