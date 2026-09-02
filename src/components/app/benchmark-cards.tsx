"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Panel } from "@/components/blueprint/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatPct, formatRate } from "@/lib/format";

const fmt = (metric: string, v: number) => (metric === "newUsers30d" ? formatCompact(v) : metric === "activationRatePct" ? formatRate(v) : formatPct(v));

// "Your 30-day growth is faster than 82% of SaaS in your category." Percentiles are coarse (steps of 5) on purpose.
export function BenchmarkCards({ saasId }: { saasId: Id<"saas"> }) {
  const b = useQuery(api.saas.benchmarks, { id: saasId });
  if (b === undefined) return <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
  if (!b.eligible) return <Panel className="p-4 text-sm text-muted-foreground">Benchmarks compare public, verified products. Publish with a verified source to see where you stand.</Panel>;
  if (b.cards.length === 0) return <Panel className="p-4 text-sm text-muted-foreground">Not enough comparable products yet — benchmarks need at least 5 verified SaaS per group and refresh daily.</Panel>;
  const best = [...b.cards].sort((a, z) => z.percentile - a.percentile).slice(0, 4);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {best.map((c) => (
        <Panel key={`${c.group}:${c.metric}`} className="p-4">
          <div className="text-sm">
            Your <span className="font-medium">{c.metricLabel}</span> is {c.percentile >= 50 ? "ahead of" : "behind"} <span className="font-semibold text-pink">{c.percentile >= 50 ? c.percentile : 100 - c.percentile}%</span> of {c.groupLabel}.
          </div>
          <div className="mt-3 h-1.5 w-full bg-line">
            <div className="h-full bg-pink" style={{ width: `${c.percentile}%` }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-foreground">
            <span>you {fmt(c.metric, c.value)}</span>
            <span>median {fmt(c.metric, c.median)} · n={c.sampleSize}</span>
          </div>
        </Panel>
      ))}
    </div>
  );
}
