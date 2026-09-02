import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { Globe } from "lucide-react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { SaasLogo } from "@/components/public/saas-card";
import { FollowButton } from "@/components/public/follow-button";
import { Sparkline } from "@/components/charts/sparkline";
import { formatCompact, formatDelta } from "@/lib/format";
import { profileUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const p = await fetchQuery(api.public.profileByUsername, { username });
  if (!p) return { title: "Not found" };
  const total = p.saas.reduce((a, s) => a + s.totalUsers, 0);
  const title = `${p.displayName} (@${p.username})`;
  const description = `${p.saas.length} SaaS · ${formatCompact(total)} users tracked on UserTrack.${p.bio ? ` ${p.bio}` : ""}`;
  return { title, description, alternates: { canonical: profileUrl(username) }, openGraph: { title, description, url: profileUrl(username) } };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const p = await fetchQuery(api.public.profileByUsername, { username });
  if (!p) notFound();
  const total = p.saas.reduce((a, s) => a + s.totalUsers, 0);
  const new30 = p.saas.reduce((a, s) => a + s.newUsers30d, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex flex-1 items-start gap-4">
          <div className="grid size-16 shrink-0 place-items-center border border-line bg-card font-mono text-xl sm:size-20">
            {p.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatarUrl} alt="" className="size-full object-cover" />
            ) : p.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold tracking-tight">{p.displayName}</h1>
            <div className="font-mono text-sm text-muted-foreground">@{p.username}</div>
            {p.bio && <p className="mt-2 text-muted-foreground">{p.bio}</p>}
            <div className="mt-3 flex flex-wrap gap-4 font-mono text-[11px] text-muted-foreground">
              {p.website && <a href={p.website} target="_blank" rel="noreferrer me" className="inline-flex items-center gap-1 hover:text-foreground"><Globe className="size-3" />{new URL(p.website).hostname}</a>}
              {p.x && <a href={`https://x.com/${p.x}`} target="_blank" rel="noreferrer me" className="hover:text-foreground">𝕏 @{p.x}</a>}
              {p.github && <a href={`https://github.com/${p.github}`} target="_blank" rel="noreferrer me" className="hover:text-foreground">gh/{p.github}</a>}
              {p.linkedin && <a href={`https://linkedin.com/in/${p.linkedin}`} target="_blank" rel="noreferrer me" className="hover:text-foreground">in/{p.linkedin}</a>}
            </div>
          </div>
        </div>
        <FollowButton targetType="profile" targetId={p._id} count={p.followerCount} />
      </div>

      <div className="mt-8 grid grid-cols-3 gap-2">
        <Panel className="p-3"><div className="text-label">SaaS</div><div className="text-2xl font-semibold">{p.saas.length}</div></Panel>
        <Panel className="p-3"><div className="text-label">Users</div><div className="text-2xl font-semibold">{formatCompact(total)}</div></Panel>
        <Panel className="p-3"><div className="text-label">New · 30d</div><div className="text-2xl font-semibold text-pink">{formatDelta(new30)}</div></Panel>
      </div>

      <SectionLabel className="mt-10">Products</SectionLabel>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {p.saas.length === 0 && <Panel className="p-6 text-sm text-muted-foreground sm:col-span-2">No public products yet.</Panel>}
        {p.saas.map((s) => (
          <Link key={s._id} href={`/s/${s.slug}`} className="group">
            <Panel className="h-full p-4 transition-colors group-hover:border-line-strong">
              <div className="flex items-center gap-3">
                <SaasLogo name={s.name} logoUrl={s.logoUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate font-medium">{s.name}<TrustBadge trust={s.trust} label={s.trustLabel} /></div>
                  <div className="truncate text-xs text-muted-foreground">{s.description}</div>
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div><div className="text-label">Users</div><div className="text-2xl font-semibold">{formatCompact(s.totalUsers)}</div></div>
                <Sparkline values={s.spark} className="text-foreground" />
                <div className="text-right"><div className="text-label">30d</div><div className="font-mono text-sm text-pink">{formatDelta(s.newUsers30d)}</div></div>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
