"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Panel } from "@/components/blueprint/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDelta, formatPct, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";

const fmt = (metric: string, v: number) =>
  metric === "newUsers30d" ? formatCompact(v) : metric === "activationRatePct" ? formatRate(v) : metric === "trendingScore7d" ? String(Math.round(v)) : formatPct(v);
const cohortRank = (g: string) => (g.startsWith("cat:") ? 0 : g.startsWith("size:") ? 1 : 2);
// Position on the p10→p90 track (0..1); a flat cohort puts everything in the middle.
const pos = (v: number, lo: number, hi: number) => (hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5);

// One card per metric (category cohort preferred, then size, then all), best percentile first. Percentiles are steps of 5 on purpose.
export function BenchmarkCards({ saasId, variant = "full" }: { saasId: Id<"saas">; variant?: "full" | "compact" }) {
  const b = useQuery(api.saas.benchmarks, { id: saasId });
  const compact = variant === "compact";
  if (b === undefined) return <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;
  if (!b.eligible) return <Panel className="p-4 text-sm text-muted-foreground">Benchmarks compare public, verified products. Publish with a verified source to see where you stand.</Panel>;
  const byMetric = new Map<string, (typeof b.cards)[number]>();
  for (const c of [...b.cards].sort((a, z) => cohortRank(a.group) - cohortRank(z.group))) if (!byMetric.has(c.metric)) byMetric.set(c.metric, c);
  const cards = [...byMetric.values()].sort((a, z) => z.percentile - a.percentile).slice(0, compact ? 2 : 6);
  if (cards.length === 0) return <Panel className="p-4 text-sm text-muted-foreground">Not enough benchmark data yet — cohorts need at least {b.minSample} verified SaaS and refresh daily.</Panel>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((c) => (
        <Panel key={`${c.group}:${c.metric}`} className={compact ? "p-3" : "p-4"}>
          <div className={cn("text-sm", compact && "text-xs")}>{c.insight}</div>
          <div className={cn("flex items-center gap-2", compact ? "mt-2" : "mt-3")}>
            <span className="font-mono text-[10px] text-muted-foreground">p10</span>
            <div className="relative h-1.5 flex-1 bg-line">
              <span aria-hidden title="cohort median" className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground" style={{ left: `${pos(c.median, c.p10, c.p90) * 100}%` }} />
              <span aria-hidden title="you" className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 bg-pink" style={{ left: `${pos(c.value, c.p10, c.p90) * 100}%` }} />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">p90</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span>you {fmt(c.metric, c.value)} · median {fmt(c.metric, c.median)} · n={c.sampleSize}</span>
            {c.medianMultiple !== null && c.medianMultiple >= 1.2 && <span className="border border-pink/60 px-1.5 text-pink">{c.medianMultiple}× median</span>}
            {c.previousValue !== undefined && <span>prev {fmt(c.metric, c.previousValue)} · {formatDelta(c.value - c.previousValue)}</span>}
          </div>
        </Panel>
      ))}
    </div>
  );
}
