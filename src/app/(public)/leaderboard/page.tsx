import type { Metadata } from "next";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { LeaderboardRow } from "@/components/public/saas-card";
import { Button } from "@/components/ui/button";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "SaaS products ranked by verified new users in the last 30 days.",
};
export const dynamic = "force-dynamic";

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const verifiedOnly = all !== "1";
  const [rows, stats] = await Promise.all([
    fetchQuery(api.public.leaderboard, { verifiedOnly, limit: 100 }),
    fetchQuery(api.public.stats, {}),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionLabel>Leaderboard · last 30 days</SectionLabel>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Who is gaining users right now</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Ranked by verified new users in the last 30 days — growth, not size. Data is pulled read-only from connected sources every 4 hours.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:w-auto">
          <Stat label="SaaS" value={stats.saasCount} />
          <Stat label="Tracked users" value={stats.trackedUsers} />
          <Stat label="New · 30d" value={stats.newUsers30d} accent />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <div className="flex border border-line">
          <Toggle href="/leaderboard" active={verifiedOnly}>Verified</Toggle>
          <Toggle href="/leaderboard?all=1" active={!verifiedOnly}>All sources</Toggle>
        </div>
        <div className="hidden font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[6rem_6rem_5rem_4rem] sm:gap-4">
          <span>Trend</span><span>New · 30d</span><span>Users</span><span>Rank</span>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {rows.length === 0 && (
          <Panel className="p-8 text-center">
            <div className="text-lg font-medium">No {verifiedOnly ? "verified " : ""}SaaS yet</div>
            <p className="mt-1 text-sm text-muted-foreground">Be the first on the board — it takes about three minutes.</p>
            <Button className="mt-4" render={<Link href="/sign-up" />}>List your SaaS</Button>
          </Panel>
        )}
        {rows.map((s, i) => <LeaderboardRow key={s._id} s={s} position={i + 1} />)}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Panel className="px-3 py-2">
      <div className="text-label">{label}</div>
      <div className={cn("text-xl font-semibold", accent && "text-pink")}>{formatCompact(value)}</div>
    </Panel>
  );
}

function Toggle({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider", active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{children}</Link>
  );
}
