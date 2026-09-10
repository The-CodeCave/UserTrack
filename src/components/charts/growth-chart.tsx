"use client";

import { useId, useMemo, useState } from "react";
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { formatCompact, formatDelta, formatPointDate, formatTick, RANGES, type Range } from "@/lib/format";
import { activationDeltaAt } from "@/lib/chart-series";
import { Skeleton } from "@/components/ui/skeleton";

export interface SeriesPoint { t: number; total: number; delta: number; activated?: number; visitors?: number }
export interface Gap { from: number; to: number; days: number }
export type Resolution = "raw" | "day" | "week" | "month";
export interface Annotation { id: string; t: number; kind: "milestone" | "spike" | "activation_spike" | "traffic_spike" | "reconnect" | "source_changed" | "launched" | "verified" | "rank_jump" | "traction" | "benchmark"; title: string; detail: string }
type Metric = "total" | "new";
// A plotted point may be a gap marker (total null) so the line breaks instead of bridging an outage.
type Plotted = Omit<SeriesPoint, "total" | "activated"> & { total: number | null; activated?: number | null; activatedDelta?: number | null; gap?: true };

const WHITE = "#f4f4f5";
const PINK = "#fb0184";
const SKY = "#7dd3fc";
const GRID = "rgba(255,255,255,0.08)";
const AXIS = { fontSize: 11, fontFamily: "var(--font-geist-mono)", fill: "#8b8f98" };
const RESOLUTION_HINT: Record<Resolution, string> = { raw: "4-hour snapshots", day: "daily points", week: "weekly points", month: "monthly points" };

export function GrowthChart({
  data,
  gaps = [],
  resolution,
  reconstructedUntil,
  annotations = [],
  range,
  onRangeChange,
  className,
  compact,
}: {
  data: SeriesPoint[] | null | undefined;
  gaps?: Gap[];
  resolution?: Resolution;
  // Points at or before this time were reconstructed from signup timestamps by a backfill, not observed live.
  reconstructedUntil?: number;
  annotations?: Annotation[];
  range: Range;
  onRangeChange: (r: Range) => void;
  className?: string;
  compact?: boolean;
}) {
  const [metric, setMetric] = useState<Metric>("total");
  const [showActivated, setShowActivated] = useState(true);
  const gradId = useId();
  const hatchId = useId();
  const points = useMemo(() => data ?? [], [data]);
  const plotted = useMemo<Plotted[]>(() => {
    const measured = points.map((point, index) => {
      return { ...point, activatedDelta: activationDeltaAt(points, index) };
    });
    return [...measured, ...gaps.map((g) => ({ t: (g.from + g.to) / 2, total: null, delta: 0, activated: null, activatedDelta: null, gap: true as const }))].sort((a, b) => a.t - b.t);
  }, [points, gaps]);
  const last = points[points.length - 1];
  const hasActivated = points.some((p) => p.activated !== undefined);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const anim = reduced ? 0 : 900;

  // Snap each annotation to the nearest data point so markers sit on the line.
  const marks = useMemo(() => {
    if (points.length < 2) return [];
    return annotations
      .map((a) => {
        let best = points[0];
        for (const p of points) if (Math.abs(p.t - a.t) < Math.abs(best.t - a.t)) best = p;
        return { ...a, x: best.t, y: metric === "total" ? best.total : best.delta };
      })
      .filter((a) => a.x >= points[0].t)
      .slice(-8);
  }, [annotations, points, metric]);

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-1 pb-3">
        <Segmented value={range} options={RANGES.map((r) => ({ v: r, label: r.toUpperCase() }))} onChange={onRangeChange} />
        <div className="flex items-center gap-2">
          {hasActivated && (
            <button aria-pressed={showActivated} onClick={() => setShowActivated((v) => !v)} className={cn("flex items-center gap-1.5 border border-line px-2 py-1.5 font-mono text-[11px] uppercase tracking-wider", showActivated ? "text-foreground" : "text-muted-foreground")}>
              <span className="h-0.5 w-3" style={{ background: SKY, opacity: showActivated ? 1 : 0.3 }} /> Activation
            </button>
          )}
          <Segmented value={metric} options={[{ v: "total", label: "Total" }, { v: "new", label: "New" }]} onChange={setMetric} />
        </div>
      </div>

      <div className={cn("relative w-full", compact ? "h-48 sm:h-56" : "h-64 sm:h-80", data === undefined && "opacity-50")}>
        {data === undefined && points.length === 0 && <Skeleton className="absolute inset-3" />}
        {data !== undefined && points.length < 2 && <EmptyPlot />}
        {points.length >= 2 && (
          <ResponsiveContainer width="100%" height="100%">
            {metric === "total" ? (
              <AreaChart data={plotted} margin={{ top: 20, right: 28, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PINK} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={PINK} stopOpacity={0} />
                  </linearGradient>
                  <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
                  </pattern>
                </defs>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => formatTick(t, range)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis yAxisId="users" tickFormatter={formatCompact} tick={AXIS} axisLine={false} tickLine={false} width={44} domain={["auto", "auto"]} />
                {hasActivated && showActivated && <YAxis yAxisId="activation" orientation="right" tickFormatter={formatCompact} tick={{ ...AXIS, fill: SKY }} axisLine={false} tickLine={false} width={44} domain={["auto", "auto"]} />}
                <Tooltip cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }} content={<PointTooltip range={range} metric={metric} marks={marks} reconstructedUntil={reconstructedUntil} showActivated={showActivated} />} />
                {gaps.map((g) => (
                  <ReferenceArea yAxisId="users" key={g.from} x1={g.from} x2={g.to} fill={`url(#${hatchId})`} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" ifOverflow="visible" label={<GapLabel days={g.days} />} />
                ))}
                <Area yAxisId="users" type="monotone" dataKey="total" connectNulls={false} stroke={WHITE} strokeWidth={2} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 4, fill: PINK, stroke: "#0b0c0e", strokeWidth: 2 }} animationDuration={anim} isAnimationActive={!reduced} />
                {hasActivated && showActivated && <Line yAxisId="activation" type="monotone" dataKey="activated" connectNulls={false} stroke={SKY} strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3, fill: SKY }} animationDuration={anim} isAnimationActive={!reduced} />}
                {last && <ReferenceDot yAxisId="users" x={last.t} y={last.total} r={4} fill={PINK} stroke="#0b0c0e" strokeWidth={2} />}
                {marks.map((m) => (
                  <ReferenceDot yAxisId="users" key={m.id} x={m.x} y={m.y} r={0} shape={<Marker kind={m.kind} />} />
                ))}
              </AreaChart>
            ) : (
              <ComposedChart data={plotted} margin={{ top: 20, right: 0, bottom: 0, left: 0 }} barCategoryGap="30%">
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="t" tickFormatter={(t) => formatTick(t, range)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis yAxisId="users" tickFormatter={formatCompact} tick={AXIS} axisLine={false} tickLine={false} width={44} />
                {hasActivated && showActivated && <YAxis yAxisId="activation" orientation="right" tickFormatter={formatCompact} tick={{ ...AXIS, fill: SKY }} axisLine={false} tickLine={false} width={44} domain={["auto", "auto"]} />}
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.06)" }} content={<PointTooltip range={range} metric={metric} marks={marks} reconstructedUntil={reconstructedUntil} showActivated={showActivated} />} />
                <Bar yAxisId="users" dataKey="delta" fill={PINK} maxBarSize={24} radius={[4, 4, 0, 0]} animationDuration={reduced ? 0 : 700} isAnimationActive={!reduced} />
                {hasActivated && showActivated && <Line yAxisId="activation" type="monotone" dataKey="activatedDelta" connectNulls={false} stroke={SKY} strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3, fill: SKY }} animationDuration={anim} isAnimationActive={!reduced} />}
                {marks.map((m) => (
                  <ReferenceDot yAxisId="users" key={m.id} x={m.x} y={m.y} r={0} shape={<Marker kind={m.kind} />} />
                ))}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      {(marks.length > 0 || resolution || gaps.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {resolution && <span>{RESOLUTION_HINT[resolution]}</span>}
          {gaps.length > 0 && <span>{gaps.length} {gaps.length === 1 ? "gap" : "gaps"} · no data, never interpolated</span>}
          {reconstructedUntil !== undefined && points.some((p) => p.t <= reconstructedUntil) && <span>through {formatPointDate(reconstructedUntil, "all")} reconstructed from signup dates</span>}
          {marks.length > 0 && <span className="inline-flex items-center gap-1"><MarkerGlyph kind="milestone" /> milestone</span>}
          {marks.some((m) => m.kind.includes("spike")) && <span className="inline-flex items-center gap-1"><MarkerGlyph kind="spike" /> growth spike</span>}
          {marks.some((m) => m.kind === "reconnect" || m.kind === "source_changed") && <span className="inline-flex items-center gap-1"><MarkerGlyph kind="reconnect" /> source change</span>}
        </div>
      )}
    </div>
  );
}

// Recharts hands the reference area's box to the label; the text sits at the top of the hatched stretch.
function GapLabel({ days, viewBox }: { days: number; viewBox?: { x: number; y: number; width: number; height: number } }) {
  if (!viewBox || viewBox.width < 36) return null;
  return <text x={viewBox.x + viewBox.width / 2} y={viewBox.y + 12} textAnchor="middle" fontSize={10} fontFamily="var(--font-geist-mono)" fill="#8b8f98">{`no data · ${days}d`}</text>;
}

function Marker({ kind, cx, cy }: { kind: Annotation["kind"]; cx?: number; cy?: number }) {
  if (cx === undefined || cy === undefined) return null;
  const y = cy - 14;
  if (kind === "milestone" || kind === "launched" || kind === "verified" || kind === "rank_jump" || kind === "traction" || kind === "benchmark") return <path d={`M${cx} ${y - 5} L${cx + 4.5} ${y + 2} L${cx - 4.5} ${y + 2} Z`} fill={PINK} stroke="#0b0c0e" strokeWidth={1} />;
  if (kind === "reconnect" || kind === "source_changed") return <rect x={cx - 3.5} y={y - 3.5} width={7} height={7} fill="#0b0c0e" stroke={WHITE} strokeWidth={1.2} transform={`rotate(45 ${cx} ${y})`} />;
  return <circle cx={cx} cy={y} r={4} fill="#0b0c0e" stroke={PINK} strokeWidth={1.5} />;
}

function MarkerGlyph({ kind }: { kind: Annotation["kind"] }) {
  return <svg width="10" height="10" viewBox="0 0 10 10"><Marker kind={kind} cx={5} cy={19} /></svg>;
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
            "min-w-[40px] px-2 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors sm:min-w-[44px] sm:px-2.5",
            value === o.v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PointTooltip({ active, payload, range, metric, marks, reconstructedUntil, showActivated }: { active?: boolean; payload?: { payload: Plotted }[]; range: Range; metric: Metric; marks: (Annotation & { x: number })[]; reconstructedUntil?: number; showActivated: boolean }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  if (p.gap || p.total === null) return <div className="border border-line bg-background/95 px-3 py-2 font-mono text-[11px] text-muted-foreground shadow-lg backdrop-blur">No snapshots stored here</div>;
  const here = marks.filter((m) => m.x === p.t);
  const reconstructed = reconstructedUntil !== undefined && p.t <= reconstructedUntil;
  return (
    <div className="max-w-[240px] border border-line bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{formatPointDate(p.t, range)}{reconstructed && " · reconstructed"}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-0.5 w-3" style={{ background: metric === "total" ? WHITE : PINK }} />
        <span className="text-base font-semibold">{metric === "total" ? formatCompact(p.total) : formatDelta(p.delta)}</span>
        <span className="text-xs text-muted-foreground">{metric === "total" ? "users" : "new"}</span>
      </div>
      {metric === "total" && p.delta !== 0 && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{formatDelta(p.delta)} vs previous</div>}
      {reconstructed && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">Rebuilt from signup dates, not observed live</div>}
      {showActivated && (metric === "total" ? p.activated != null : p.activatedDelta != null) && (
        <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px]" style={{ color: SKY }}><span className="h-0.5 w-3" style={{ background: SKY }} />{metric === "total" ? formatCompact(p.activated!) : formatDelta(p.activatedDelta!)} activated</div>
      )}
      {here.map((m) => (
        <div key={m.id} className="mt-1.5 border-t border-line pt-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium"><MarkerGlyph kind={m.kind} />{m.title}</div>
          <div className="text-[11px] text-muted-foreground">{m.detail}</div>
        </div>
      ))}
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
