"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { formatCompact, formatPct } from "@/lib/format";

export const COMPARE_COLORS = ["#fb0184", "#f4f4f5", "#7dd3fc", "#fbbf24"];
const AXIS = { fontSize: 11, fontFamily: "var(--font-geist-mono)", fill: "#8b8f98" };

export interface CompareSeries { slug: string; name: string; series: { day: string; total: number; delta: number }[] }
type Mode = "total" | "indexed";

// Up to four series already cut to the window by the query (days: 0 = all). "Indexed" rebases each product to 100 at its first day in the window.
export function CompareChart({ items, days }: { items: CompareSeries[]; days: number }) {
  const [mode, setMode] = useState<Mode>("indexed");
  const plotted = items.filter((it) => it.series.length >= 2);
  const thin = items.filter((it) => it.series.length < 2);
  const daysSorted = [...new Set(plotted.flatMap((it) => it.series.map((p) => p.day)))].sort();
  const data = daysSorted.map((day) => {
    const row: Record<string, number | string> = { day };
    for (const it of plotted) {
      const p = it.series.find((x) => x.day === day);
      if (!p) continue;
      const b = it.series[0].total;
      row[it.slug] = mode === "total" ? p.total : b > 0 ? Math.round((p.total / b) * 1000) / 10 : 100;
    }
    return row;
  });
  const long = days === 0 || days > 90;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-1 pb-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {items.map((it, i) => (
            <span key={it.slug} className="inline-flex items-center gap-1.5 text-sm"><span className="h-0.5 w-4" style={{ background: COMPARE_COLORS[i] }} />{it.name}</span>
          ))}
        </div>
        <div role="tablist" className="flex border border-line">
          {(["indexed", "total"] as Mode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider", mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
              {m === "indexed" ? "Indexed = 100" : "Total"}
            </button>
          ))}
        </div>
      </div>
      <div className="h-60 w-full sm:h-80">
        {data.length < 2 ? (
          <div className="bp-grid flex h-full items-center justify-center text-sm text-muted-foreground">Not enough history to compare in this window.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} minTickGap={40} tickFormatter={(d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en", long ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" })} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} domain={["auto", "auto"]} tickFormatter={(v: number) => (mode === "total" ? formatCompact(v) : `${v}`)} />
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="border border-line bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{String(label)}</div>
                      {payload.map((p) => (
                        <div key={String(p.dataKey)} className="mt-1 flex items-center gap-2 text-sm">
                          <span className="h-0.5 w-3" style={{ background: p.color }} />
                          <span>{items.find((i) => i.slug === p.dataKey)?.name}</span>
                          <span className="ml-auto pl-4 font-mono text-xs">{mode === "total" ? formatCompact(Number(p.value)) : formatPct(Number(p.value) - 100)}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              {items.map((it, i) => it.series.length >= 2 && (
                <Line key={it.slug} type="monotone" dataKey={it.slug} stroke={COMPARE_COLORS[i]} strokeWidth={i === 1 ? 1.5 : 2} dot={false} connectNulls animationDuration={700} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {thin.length > 0 && (
        <div className="mt-2 space-y-0.5 font-mono text-[11px] text-muted-foreground">
          {thin.map((it) => <div key={it.slug}>{it.name}: not enough history in this window</div>)}
        </div>
      )}
    </div>
  );
}
