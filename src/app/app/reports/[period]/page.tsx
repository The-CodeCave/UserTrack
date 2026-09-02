"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDate, formatDelta, formatPct, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ReportPage({ params }: { params: Promise<{ period: string }> }) {
  const { period } = use(params);
  const report = useQuery(api.email.reports.getMine, { period });
  if (report === undefined) return <div className="mx-auto max-w-3xl p-6"><Skeleton className="h-8 w-56" /><Skeleton className="mt-6 h-64" /></div>;
  if (report === null) return <div className="p-6 text-sm text-muted-foreground">No report for {period}.</div>;
  const p = report.payload;
  const s = p.summary;
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <SectionLabel><Link href="/app/reports" className="hover:text-foreground">Reports</Link> / {p.label}</SectionLabel>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your {p.label.split(" ")[0]} on UserTrack</h1>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">generated {formatDate(p.generatedAt)}{report.sentAt ? ` · emailed ${formatDate(report.sentAt)}` : ""}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="New users" value={formatDelta(s.totalNewUsers)} accent />
        <Stat label="Total users" value={formatCompact(s.totalUsersEnd)} sub={s.aggregateGrowthPct !== null ? formatPct(s.aggregateGrowthPct) : undefined} />
        <Stat label="Strongest" value={s.strongest ?? "—"} small />
        <Stat label="Biggest milestone" value={s.biggestMilestone ?? "—"} small />
      </div>
      {p.projects.map((pr) => (
        <Panel key={pr.saasId} className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold">{pr.isPublic ? <Link href={`/s/${pr.slug}`} className="hover:underline">{pr.name}</Link> : pr.name}</div>
            {!pr.hasData && <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">no data this month</span>}
          </div>
          {pr.hasData ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="New users" value={formatDelta(pr.newUsers)} sub={pr.growthPct !== null ? formatPct(pr.growthPct) : undefined} accent={pr.newUsers > 0} />
              <Stat label="Total users" value={formatCompact(pr.usersEnd)} sub={`from ${formatCompact(pr.usersStart)}`} />
              {pr.newActivated !== undefined && <Stat label="Activated" value={formatDelta(pr.newActivated)} sub={pr.activationRatePct !== undefined ? `${formatRate(pr.activationRatePct)} rate` : undefined} />}
              {(pr.rankStart !== undefined || pr.rankEnd !== undefined) && <Stat label="Leaderboard" value={`#${pr.rankStart ?? "—"} → #${pr.rankEnd ?? "—"}`} />}
              {pr.bestDay && <Stat label="Biggest day" value={formatDelta(pr.bestDay.newUsers)} sub={pr.bestDay.day} />}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No snapshots were recorded — connect or fix the data source to include it next month.</p>
          )}
          {pr.milestones.length > 0 && <div className="mt-3 font-mono text-[11px] text-muted-foreground">Milestones: {pr.milestones.map((m) => m.title).join(" · ")}</div>}
        </Panel>
      ))}
    </div>
  );
}

function Stat({ label, value, sub, accent, small }: { label: string; value: string; sub?: string; accent?: boolean; small?: boolean }) {
  return (
    <Panel className="p-4">
      <div className="text-label">{label}</div>
      <div className={cn("mt-1 font-semibold tracking-tight", small ? "truncate text-sm" : "text-2xl", accent && "text-pink")} title={value}>{value}</div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{sub}</div>}
    </Panel>
  );
}
