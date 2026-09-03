"use client";

import { useId, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDelta, formatPointDate, formatTick, type Range } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGES: Range[] = ["7d", "30d", "90d", "1y", "all"];
const COLORS = ["#fb0184", "#f4f4f5", "#7dd3fc", "#fbbf24", "#a78bfa", "#34d399"];
const GRID = "rgba(255,255,255,0.08)";
const AXIS = { fontSize: 11, fontFamily: "var(--font-geist-mono)", fill: "#8b8f98" };
type Metric = "total" | "new";

// Aggregate user growth across a founder's public projects; optional per-project breakdown (stacked).
export function FounderGrowth({ username, initialRange = "90d", onRangeChange }: { username: string; initialRange?: Range; onRangeChange?: (r: Range) => void }) {
  const [range, setRangeState] = useState<Range>(initialRange);
  const [metric, setMetric] = useState<Metric>("total");
  const [breakdown, setBreakdown] = useState(false);
  const gradId = useId();
  const data = useQuery(api.public.founderHistory, { username, range });
  const setRange = (r: Range) => { setRangeState(r); onRangeChange?.(r); };
  const points = useMemo(() => (data?.points ?? []).map((p) => ({ ...p, ...Object.fromEntries(p.byProject.map((v, i) => [`p${i}`, v])) })), [data]);
  const projects = data?.projects ?? [];
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const anim = reduced ? 0 : 900;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-1 pb-3">
        <Segmented value={range} options={RANGES.map((r) => ({ v: r, label: r.toUpperCase() }))} onChange={setRange} />
        <div className="flex items-center gap-2">
          {projects.length > 1 && metric === "total" && (
            <button onClick={() => setBreakdown((v) => !v)} className={cn("min-h-[32px] border border-line px-2 font-mono text-[11px] uppercase tracking-wider", breakdown ? "text-foreground" : "text-muted-foreground")}>By project</button>
          )}
          <Segmented value={metric} options={[{ v: "total" as const, label: "Total" }, { v: "new" as const, label: "New" }]} onChange={setMetric} />
        </div>
      </div>
      <div className={cn("relative h-56 w-full sm:h-72", data === undefined && "opacity-50")}>
        {data === undefined && <Skeleton className="absolute inset-3" />}
        {data !== undefined && points.length < 2 && <div className="bp-grid absolute inset-0 grid place-items-center text-center text-sm text-muted-foreground">Not enough history yet — the aggregate chart draws after two days of snapshots.</div>}
        {points.length >= 2 && (
          <ResponsiveContainer width="100%" height="100%">
            {metric === "total" ? (
              <AreaChart data={points} margin={{ top: 20, right: 28, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fb0184" stopOpacity={0.28} /><stop offset="100%" stopColor="#fb0184" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="t" tickFormatter={(t) => formatTick(t, range)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis tickFormatter={formatCompact} tick={AXIS} axisLine={false} tickLine={false} width={44} domain={["auto", "auto"]} />
                <Tooltip cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }} content={<Tip range={range} metric={metric} projects={projects.map((p) => p.name)} breakdown={breakdown} />} />
                {breakdown && projects.length > 1
                  ? projects.map((p, i) => <Area key={p.slug} type="monotone" dataKey={`p${i}`} stackId="1" stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.18} strokeWidth={1.5} dot={false} animationDuration={anim} isAnimationActive={!reduced} />)
                  : <Area type="monotone" dataKey="total" stroke="#f4f4f5" strokeWidth={2} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 4, fill: "#fb0184", stroke: "#0b0c0e", strokeWidth: 2 }} animationDuration={anim} isAnimationActive={!reduced} />}
              </AreaChart>
            ) : (
              <BarChart data={points} margin={{ top: 20, right: 28, bottom: 0, left: 0 }} barCategoryGap="30%">
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="t" tickFormatter={(t) => formatTick(t, range)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis tickFormatter={formatCompact} tick={AXIS} axisLine={false} tickLine={false} width={44} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.06)" }} content={<Tip range={range} metric={metric} projects={[]} breakdown={false} />} />
                <Bar dataKey="delta" fill="#fb0184" maxBarSize={24} radius={[4, 4, 0, 0]} animationDuration={reduced ? 0 : 700} isAnimationActive={!reduced} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      {breakdown && projects.length > 1 && metric === "total" && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {projects.map((p, i) => <span key={p.slug} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3" style={{ background: COLORS[i % COLORS.length] }} />{p.name}</span>)}
        </div>
      )}
      <div className="mt-2 px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Sum of public projects · per-project forward fill on missing days</div>
    </div>
  );
}

function Tip({ active, payload, range, metric, projects, breakdown }: { active?: boolean; payload?: { payload: { t: number; total: number; delta: number; byProject: number[] } }[]; range: Range; metric: Metric; projects: string[]; breakdown: boolean }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="max-w-[240px] border border-line bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{formatPointDate(p.t, range)}</div>
      <div className="mt-1 text-base font-semibold">{metric === "total" ? `${formatCompact(p.total)} users` : `${formatDelta(p.delta)} new`}</div>
      {breakdown && projects.map((name, i) => <div key={name} className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground"><span className="h-0.5 w-3" style={{ background: COLORS[i % COLORS.length] }} />{name} · {formatCompact(p.byProject[i] ?? 0)}</div>)}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex border border-line">
      {options.map((o) => (
        <button key={o.v} role="tab" aria-selected={value === o.v} onClick={() => onChange(o.v)} className={cn("min-h-[32px] min-w-[40px] px-2 font-mono text-[11px] uppercase tracking-wider transition-colors sm:min-w-[44px] sm:px-2.5", value === o.v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{o.label}</button>
      ))}
    </div>
  );
}
