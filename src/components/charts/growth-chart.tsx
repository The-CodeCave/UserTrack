"use client";

import { useId, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { formatCompact, formatDelta, formatPointDate, formatTick, RANGES, type Range } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export interface SeriesPoint { t: number; total: number; delta: number }
type Metric = "total" | "new";

const WHITE = "#f4f4f5";
const PINK = "#fb0184";
const GRID = "rgba(255,255,255,0.08)";
const AXIS = { fontSize: 11, fontFamily: "var(--font-geist-mono)", fill: "#8b8f98" };

export function GrowthChart({
  data,
  range,
  onRangeChange,
  className,
}: {
  data: SeriesPoint[] | null | undefined;
  range: Range;
  onRangeChange: (r: Range) => void;
  className?: string;
}) {
  const [metric, setMetric] = useState<Metric>("total");
  const gradId = useId();
  const points = data ?? [];
  const last = points[points.length - 1];

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-1 pb-3">
        <Segmented value={range} options={RANGES.map((r) => ({ v: r, label: r.toUpperCase() }))} onChange={onRangeChange} />
        <Segmented value={metric} options={[{ v: "total", label: "Total" }, { v: "new", label: "New" }]} onChange={setMetric} />
      </div>

      <div className={cn("relative h-64 w-full sm:h-80", data === undefined && "opacity-50")}>
        {data === undefined && points.length === 0 && <Skeleton className="absolute inset-3" />}
        {data !== undefined && points.length < 2 && <EmptyPlot />}
        {points.length >= 2 && (
          <ResponsiveContainer width="100%" height="100%">
            {metric === "total" ? (
              <AreaChart data={points} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PINK} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={PINK} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="t" tickFormatter={(t) => formatTick(t, range)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis tickFormatter={formatCompact} tick={AXIS} axisLine={false} tickLine={false} width={44} domain={["auto", "auto"]} />
                <Tooltip cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }} content={<PointTooltip range={range} metric={metric} />} />
                <Area type="monotone" dataKey="total" stroke={WHITE} strokeWidth={2} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 4, fill: PINK, stroke: "#0b0c0e", strokeWidth: 2 }} animationDuration={900} />
                {last && <ReferenceDot x={last.t} y={last.total} r={4} fill={PINK} stroke="#0b0c0e" strokeWidth={2} />}
              </AreaChart>
            ) : (
              <BarChart data={points} margin={{ top: 16, right: 12, bottom: 0, left: 0 }} barCategoryGap="30%">
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="t" tickFormatter={(t) => formatTick(t, range)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis tickFormatter={formatCompact} tick={AXIS} axisLine={false} tickLine={false} width={44} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.06)" }} content={<PointTooltip range={range} metric={metric} />} />
                <Bar dataKey="delta" fill={PINK} maxBarSize={24} radius={[4, 4, 0, 0]} animationDuration={700} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex border border-line">
      {options.map((o) => (
        <button
          key={o.v}
          role="tab"
          aria-selected={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "min-w-[44px] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors",
            value === o.v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PointTooltip({ active, payload, range, metric }: { active?: boolean; payload?: { payload: SeriesPoint }[]; range: Range; metric: Metric }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="border border-line bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{formatPointDate(p.t, range)}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-0.5 w-3" style={{ background: metric === "total" ? WHITE : PINK }} />
        <span className="text-base font-semibold">{metric === "total" ? formatCompact(p.total) : formatDelta(p.delta)}</span>
        <span className="text-xs text-muted-foreground">{metric === "total" ? "users" : "new"}</span>
      </div>
      {metric === "total" && p.delta !== 0 && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{formatDelta(p.delta)} vs previous</div>}
    </div>
  );
}

function EmptyPlot() {
  return (
    <div className="bp-grid absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
      <svg viewBox="0 0 120 40" className="h-10 w-32 text-line-strong" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3">
        <path d="M2 34 C 30 30, 50 28, 70 18 S 100 8, 118 4" />
      </svg>
      <div className="text-sm">Collecting snapshots</div>
      <div className="font-mono text-[11px] text-muted-foreground">The chart draws after the second sync (≤ 4h)</div>
    </div>
  );
}
