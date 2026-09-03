"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@convex/_generated/api";
import { MovementTag } from "@/components/blueprint/movement";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatTick } from "@/lib/format";
import { cn } from "@/lib/utils";

type Kind = "leaderboard" | "trending";
const DAYS = [{ v: 30, label: "30d" }, { v: 90, label: "90d" }, { v: 365, label: "1y" }] as const;
const PINK = "#fb0184";
const AXIS = { fontSize: 11, fontFamily: "var(--font-geist-mono)", fill: "#8b8f98" };

// Stored daily ranking positions; the axis is inverted so #1 sits at the top.
export function RankHistoryChart({ slug, hasLeaderboard, hasTrending, className }: { slug: string; hasLeaderboard: boolean; hasTrending: boolean; className?: string }) {
  const [kind, setKind] = useState<Kind>(hasLeaderboard ? "leaderboard" : "trending");
  const [days, setDays] = useState<number>(90);
  const h = useQuery(api.public.rankHistory, { slug, kind, days });
  const points = h?.points ?? [];
  const range = days === 30 ? "30d" : days === 90 ? "90d" : "1y";
  const last = points[points.length - 1];
  const worst = Math.max(1, ...points.map((p) => p.rank));
  const chip = "inline-flex items-center gap-1 border border-line px-2 py-1 font-mono text-[11px] text-muted-foreground";
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-1 pb-3">
        <Segmented value={kind} options={[...(hasLeaderboard ? [{ v: "leaderboard" as Kind, label: "Leaderboard" }] : []), ...(hasTrending ? [{ v: "trending" as Kind, label: "Trending" }] : [])]} onChange={setKind} />
        <Segmented value={days} options={DAYS.map((d) => ({ v: d.v, label: d.label }))} onChange={setDays} />
      </div>
      {h && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={chip}>Now <b className="text-foreground">{h.current ? `#${h.current}` : "—"}</b></span>
          <span className={chip}>Best <b className="text-foreground">{h.best ? `#${h.best}` : "—"}</b></span>
          <span className={chip}>7d <MovementTag m={h.movement7d ?? null} /></span>
        </div>
      )}
      <div className="relative mt-2 h-48 w-full sm:h-56">
        {h === undefined && <Skeleton className="absolute inset-3" />}
        {h !== undefined && points.length < 2 && (
          <div className="bp-grid absolute inset-0 flex items-center justify-center px-4 text-center font-mono text-[11px] text-muted-foreground">Rank history starts on the first rerank after listing</div>
        )}
        {points.length >= 2 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 12, right: 28, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => formatTick(t, range)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis reversed domain={[1, Math.max(worst, 5)]} allowDecimals={false} tickFormatter={(r) => `#${r}`} tick={AXIS} axisLine={false} tickLine={false} width={44} />
              <Tooltip cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }} content={<RankTooltip />} />
              <Line type="stepAfter" dataKey="rank" stroke="#f4f4f5" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: PINK, stroke: "#0b0c0e", strokeWidth: 2 }} isAnimationActive={false} />
              {last && <ReferenceDot x={last.t} y={last.rank} r={4} fill={PINK} stroke="#0b0c0e" strokeWidth={2} />}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-2 px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">One stored position per day · {kind === "trending" ? "7-day trending score" : "30-day most new users"} · #1 at the top</div>
    </div>
  );
}

function RankTooltip({ active, payload }: { active?: boolean; payload?: { payload: { t: number; rank: number; score?: number } }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="border border-line bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{formatDate(p.t)}</div>
      <div className="mt-1 text-base font-semibold">#{p.rank}</div>
      {p.score !== undefined && <div className="font-mono text-[11px] text-muted-foreground">score {p.score.toFixed(1)}</div>}
    </div>
  );
}

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex border border-line">
      {options.map((o) => (
        <button key={o.v} role="tab" aria-selected={value === o.v} onClick={() => onChange(o.v)} className={cn("min-w-[40px] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors", value === o.v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
