"use client";

import { useQuery } from "convex/react";
import { HelpCircle } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Panel } from "@/components/blueprint/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCompact, formatPct, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";

const fmt = (metric: string, v: number) =>
  metric === "newUsers30d" ? formatCompact(v) : metric === "activationRatePct" ? formatRate(v) : metric === "trendingScore7d" ? String(Math.round(v)) : formatPct(v);
// Cohort preference when one card per metric is picked: most specific first.
const DIMENSION_RANK: Record<string, number> = { category_size: 0, category: 1, size: 2, platform: 3, age: 4, tracked: 4, all: 5 };
// Position on the p10→p90 track (0..1); a flat cohort puts everything in the middle.
const pos = (v: number, lo: number, hi: number) => (hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5);

// One card per metric (most specific cohort with a sample wins), best percentile first. Percentiles are steps of 5 on purpose.
export function BenchmarkCards({ saasId, variant = "full" }: { saasId: Id<"saas">; variant?: "full" | "compact" }) {
  const b = useQuery(api.saas.benchmarks, { id: saasId });
  const compact = variant === "compact";
  if (b === undefined) return <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;
  if (!b.eligible) return <Panel className="p-4 text-sm text-muted-foreground">Benchmarks compare public, verified products. Publish with a verified source to see where you stand.</Panel>;
  const byMetric = new Map<string, (typeof b.cards)[number]>();
  for (const c of [...b.cards].sort((a, z) => (DIMENSION_RANK[a.dimension] ?? 5) - (DIMENSION_RANK[z.dimension] ?? 5))) if (!byMetric.has(c.metric)) byMetric.set(c.metric, c);
  const cards = [...byMetric.values()].sort((a, z) => z.percentile - a.percentile).slice(0, compact ? 2 : 6);
  if (cards.length === 0) return <Panel className="p-4 text-sm text-muted-foreground">Not enough benchmark data yet — cohorts need at least {b.minSample} verified SaaS and refresh daily.</Panel>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((c) => {
        const weeks = b.history.map((h) => ({ week: h.week, s: h.standings.find((s) => s.cohort === c.group && s.metric === c.metric) })).filter((h) => h.s);
        return (
          <Panel key={`${c.group}:${c.metric}`} className={compact ? "p-3" : "p-4"}>
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
              <span className="border border-line px-1.5 py-0.5 text-muted-foreground">{c.groupShort}</span>
              {c.band && <span className="border border-pink/60 px-1.5 py-0.5 text-pink">{c.band}</span>}
              <span className="text-muted-foreground">{c.metricLabel}</span>
              <Tooltip>
                <TooltipTrigger className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Cohort definition"><HelpCircle className="size-3.5" /></TooltipTrigger>
                <TooltipContent>{c.cohortDefinition}</TooltipContent>
              </Tooltip>
            </div>
            <div className={cn("mt-2 text-sm", compact && "text-xs")}>{c.insight}</div>
            {!compact && c.changeInsight && <div className="mt-1 text-xs text-pink">{c.changeInsight}</div>}
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
              {c.previousPercentile !== undefined && <span>was {c.previousPercentile >= 50 ? `Top ${100 - c.previousPercentile}%` : `${c.previousPercentile}th pct`}{c.previousWeek ? ` · ${c.previousWeek}` : ""}</span>}
            </div>
            {!compact && weeks.length > 1 && (
              <div className="mt-3">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Benchmark history · {weeks.length} wk</div>
                <div className="flex h-8 items-end gap-px">
                  {weeks.map((w) => (
                    <span key={w.week} title={`${w.week} · ${w.s!.percentile}th percentile${w.s!.band ? ` · ${w.s!.band}` : ""}`} className={cn("min-w-1 flex-1", w.s!.percentile >= 75 ? "bg-pink" : "bg-line-strong")} style={{ height: `${Math.max(6, w.s!.percentile)}%` }} />
                  ))}
                </div>
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
