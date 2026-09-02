"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPointDate, formatRate, formatTick } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FunnelHistoryPoint = NonNullable<FunctionReturnType<typeof api.public.funnelHistory>>[number];
type MetricKey = Exclude<keyof FunnelHistoryPoint, "day">;
const METRICS: { key: MetricKey; label: string }[] = [
  { key: "signupToActivatedPct", label: "Signup → Activated" },
  { key: "signupToConvertedPct", label: "Signup → Converted" },
  { key: "activatedToConvertedPct", label: "Activated → Converted" },
  { key: "trialToConvertedPct", label: "Trial → Converted" },
];
const PINK = "#fb0184";
const GRID = "rgba(255,255,255,0.08)";
const AXIS = { fontSize: 11, fontFamily: "var(--font-geist-mono)", fill: "#8b8f98" };

export function FunnelHistoryChart({ points, className }: { points: FunnelHistoryPoint[]; className?: string }) {
  const [selected, setSelected] = useState<MetricKey | null>(null);
  const available = METRICS.filter((m) => points.some((p) => p[m.key] !== undefined));
  const metric = available.find((m) => m.key === selected) ?? available[0];
  const data = metric ? points.filter((p) => p[metric.key] !== undefined).map((p) => ({ t: Date.parse(p.day), v: p[metric.key] as number })) : [];
  const range = data.length > 120 ? "1y" : "90d";
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return (
    <div className={cn("flex flex-col", className)}>
      {available.length > 0 && (
        <div role="tablist" className="flex flex-wrap border border-line self-start">
          {available.map((m) => (
            <button key={m.key} role="tab" aria-selected={metric?.key === m.key} onClick={() => setSelected(m.key)} className={cn("px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors", metric?.key === m.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{m.label}</button>
          ))}
        </div>
      )}
      <div className="relative mt-3 h-48 w-full sm:h-56">
        {data.length < 2 ? (
          <div className="bp-grid absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
            <div className="text-sm">Collecting rate history</div>
            <div className="font-mono text-[11px] text-muted-foreground">Trailing 7-day ratios appear after a week of daily data</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="t" tickFormatter={(t) => formatTick(t, range)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis tickFormatter={(v) => formatRate(v)} tick={AXIS} axisLine={false} tickLine={false} width={44} domain={[0, "auto"]} />
              <Tooltip cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }} content={<PointTooltip label={metric!.label} range={range} />} />
              <Line type="monotone" dataKey="v" stroke={PINK} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: PINK, stroke: "#0b0c0e", strokeWidth: 2 }} animationDuration={reduced ? 0 : 700} isAnimationActive={!reduced} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function PointTooltip({ active, payload, label, range }: { active?: boolean; payload?: { payload: { t: number; v: number } }[]; label: string; range: "90d" | "1y" }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="border border-line bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{formatPointDate(p.t, range)} · trailing 7d</div>
      <div className="mt-1 flex items-baseline gap-2"><span className="text-base font-semibold">{formatRate(p.v)}</span><span className="text-xs text-muted-foreground">{label}</span></div>
    </div>
  );
}

// Public page: fetches by slug. Dashboard: fetches by id. Renders nothing until there is a rate to plot.
export function FunnelHistory({ slug, saasId, className }: { slug?: string; saasId?: Id<"saas">; className?: string }) {
  const pub = useQuery(api.public.funnelHistory, slug ? { slug } : "skip");
  const own = useQuery(api.saas.funnelHistory, saasId ? { id: saasId } : "skip");
  const points = slug ? pub : own;
  if (points === undefined) return <Panel className={cn("p-4 sm:p-5", className)}><Skeleton className="h-6 w-40" /><Skeleton className="mt-4 h-48" /></Panel>;
  if (!points || !METRICS.some((m) => points.some((p) => p[m.key] !== undefined))) return null;
  return (
    <Panel className={cn("p-4 sm:p-5", className)}>
      <SectionLabel className="mb-3">Rates over time</SectionLabel>
      <FunnelHistoryChart points={points} />
    </Panel>
  );
}
