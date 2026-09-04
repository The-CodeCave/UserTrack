import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { Globe, MapPin, CalendarDays, Award, Flame, Zap } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { SaasLogo } from "@/components/public/saas-card";
import { FollowButton } from "@/components/public/follow-button";
import { Sparkline } from "@/components/charts/sparkline";
import { FounderGrowth } from "@/components/charts/founder-growth";
import { ShareButton } from "@/components/share/share-button";
import { formatCompact, formatDelta, formatPct, formatRate } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import { profileUrl } from "@/lib/site";
import { xProfileUrl } from "@/lib/social";
import { xDraft } from "@/lib/x-drafts";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const p = await fetchQuery(api.public.profileByUsername, { username });
  if (!p) return { title: "Not found", robots: { index: false } };
  const a = p.aggregates;
  const title = `${p.displayName} — SaaS Founder on UserTrack`;
  const description = `${a.projectCount} ${a.projectCount === 1 ? "SaaS" : "SaaS products"} · ${formatCompact(a.totalUsers)} users · ${formatDelta(a.newUsers30d)} in the last 30 days.${p.bio ? ` ${p.bio}` : ""}`;
  const url = profileUrl(p.username);
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "profile" }, twitter: { card: "summary_large_image", title, description }, robots: a.projectCount === 0 ? { index: false, follow: true } : undefined };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const p = await fetchQuery(api.public.profileByUsername, { username });
  if (!p) notFound();
  const a = p.aggregates;
  const url = profileUrl(p.username);
  const allVerified = a.projectCount > 0 && a.verifiedCount === a.projectCount;
  const target = {
    page: url, slug: p.username, kind: "founder", label: p.displayName, trust: (allVerified ? "verified" : "unverified") as "verified" | "unverified",
    graph: true, text: xDraft({ kind: "founder", name: p.displayName, totalUsers: a.totalUsers, newUsers30d: a.newUsers30d, projectCount: a.projectCount, verified: allVerified, seed: p.username }), initial: { range: "90d" as const },
  };
  const joined = new Date(p.joinedAt).toLocaleDateString("en", { month: "short", year: "numeric" });
  const jsonLd = { "@context": "https://schema.org", "@type": "Person", name: p.displayName, url, ...(p.avatarUrl ? { image: p.avatarUrl } : {}), ...(p.bio ? { description: p.bio } : {}), sameAs: [p.website, p.x ? xProfileUrl(p.x) : undefined, p.github ? `https://github.com/${p.github}` : undefined, p.linkedin ? `https://linkedin.com/in/${p.linkedin}` : undefined].filter(Boolean) };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-4 sm:gap-5">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-card font-mono text-xl sm:size-24 sm:text-2xl">
            {p.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatarUrl} alt="" className="size-full object-cover" />
            ) : p.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <SectionLabel>Founder</SectionLabel>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{p.displayName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm text-muted-foreground">
              <span>@{p.username}</span>
              {p.x && (
                <a href={xProfileUrl(p.x)} target="_blank" rel="noreferrer me" className="inline-flex items-center gap-1 hover:text-foreground">
                  <span className="font-semibold text-foreground">𝕏</span> @{p.x}
                  {p.xConnected && <span className="ml-1 border border-line px-1 py-px text-[9px] uppercase tracking-wider text-muted-foreground" title="Linked through X sign-in">connected</span>}
                </a>
              )}
              {p.xFollowers !== undefined && <span className="inline-flex items-center gap-1" title="Read from the founder's connected X account"><span className="font-semibold text-foreground">𝕏</span> {formatCompact(p.xFollowers)} followers on X</span>}
            </div>
            {p.bio && <p className="mt-3 max-w-xl text-muted-foreground">{p.bio}</p>}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
              {p.website && <a href={p.website} target="_blank" rel="noreferrer me" className="inline-flex items-center gap-1 hover:text-foreground"><Globe className="size-3" />{hostOf(p.website)}</a>}
              {p.github && <a href={`https://github.com/${p.github}`} target="_blank" rel="noreferrer me" className="hover:text-foreground">gh/{p.github}</a>}
              {p.linkedin && <a href={`https://linkedin.com/in/${p.linkedin}`} target="_blank" rel="noreferrer me" className="hover:text-foreground">in/{p.linkedin}</a>}
              {p.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{p.location}</span>}
              <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />Joined {joined}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FollowButton targetType="profile" targetId={p._id} count={p.followerCount} />
          <ShareButton target={target} variant="button">Share profile</ShareButton>
        </div>
      </div>

      <section className="mt-8">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Users" value={formatCompact(a.totalUsers)} accent sub={a.projectCount ? `across ${a.projectCount} ${a.projectCount === 1 ? "product" : "products"}` : "no public products"} />
          <Stat label="New · 30d" value={formatDelta(a.newUsers30d)} sub={a.changeVsPrev30dPct !== undefined ? `${formatPct(a.changeVsPrev30dPct)} vs previous 30d` : `${formatPct(a.growth30dPct)} growth`} />
          <Stat label="Products" value={String(a.projectCount)} sub={a.verifiedCount ? `${a.verifiedCount} verified` : "—"} />
          <Stat label="Activation" value={a.activationRatePct !== undefined ? formatRate(a.activationRatePct) : "—"} sub={a.activationRatePct !== undefined ? `weighted · ${a.activationProjects} ${a.activationProjects === 1 ? "product" : "products"}` : "no activation source"} icon={Zap} />
          <Stat label="Best rank" value={a.bestRank ? `#${a.bestRank}` : "—"} sub="30-day leaderboard" icon={Award} />
          <Stat label="Trending" value={a.trendingCount ? String(a.trendingCount) : "—"} sub={a.trendingCount ? `${a.trendingCount === 1 ? "product" : "products"} trending now` : "not trending"} icon={Flame} />
        </div>
        {a.biggestGrowth && <p className="mt-2 font-mono text-[11px] text-muted-foreground">Biggest growth this month: <Link href={`/s/${a.biggestGrowth.slug}`} className="text-foreground hover:text-pink">{a.biggestGrowth.name}</Link> ({formatDelta(a.biggestGrowth.newUsers30d)}). Activation is weighted: activated ÷ users across products with an activation source.</p>}
      </section>

      <Panel className="mt-6 p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>Users across all products</SectionLabel>
          <ShareButton target={{ ...target, label: `${p.displayName} · growth` }} />
        </div>
        {a.projectCount > 0 ? <FounderGrowth username={p.username} /> : <div className="grid h-40 place-items-center text-sm text-muted-foreground">No public products yet.</div>}
      </Panel>

      <SectionLabel className="mt-10">Products</SectionLabel>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {p.saas.length === 0 && <Panel className="p-6 text-sm text-muted-foreground sm:col-span-2">No public products yet.</Panel>}
        {p.saas.map((s) => (
          <Link key={s._id} href={`/s/${s.slug}`} className="group">
            <Panel className="h-full p-4 transition-colors group-hover:border-line-strong">
              <div className="flex items-center gap-3">
                <SaasLogo name={s.name} logoUrl={s.logoUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium"><span className="truncate">{s.name}</span><TrustBadge trust={s.trust} label={s.trustLabel} /></div>
                  <div className="truncate text-xs text-muted-foreground">{s.description}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>{categoryLabel(s.category)}</span>
                {s.rank && <span className="border border-line px-1.5 py-0.5 text-foreground">#{s.rank} · 30d</span>}
                {s.trendingRank && <span className="inline-flex items-center gap-1 border border-pink/60 px-1.5 py-0.5 text-pink"><Flame className="size-3" />#{s.trendingRank} trending</span>}
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div><div className="text-label">Users</div><div className="tabular text-2xl font-semibold">{formatCompact(s.totalUsers)}</div></div>
                <Sparkline values={s.spark} className="text-foreground" />
                <div className="text-right"><div className="text-label">30d</div><div className="font-mono text-sm text-pink">{formatDelta(s.newUsers30d)}</div><div className="font-mono text-[10px] text-muted-foreground">{formatPct(s.growth30dPct)}</div></div>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}

function hostOf(url: string) {
  try { return new URL(url).hostname; } catch { return url; }
}

function Stat({ label, value, sub, accent, icon: Icon }: { label: string; value: string; sub?: string; accent?: boolean; icon?: typeof Zap }) {
  return (
    <Panel className="p-3 sm:p-4">
      <div className="flex items-center justify-between"><div className="text-label">{label}</div>{Icon && <Icon className="size-3.5 text-pink" />}</div>
      <div className={cn("tabular mt-1 text-2xl font-semibold tracking-tight sm:text-3xl", accent && "text-pink")}>{value}</div>
      {sub && <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{sub}</div>}
    </Panel>
  );
}
