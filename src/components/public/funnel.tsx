"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCompact, formatPct, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FunnelData = NonNullable<FunctionReturnType<typeof api.public.funnel>>;
type Timeframe = FunnelData["timeframe"];
const TIMEFRAMES: Timeframe[] = ["7d", "30d", "90d"];
const VERIFICATION: Record<FunnelData["verification"], string> = { verified: "Verified funnel", mixed: "Mixed provenance", self_reported: "Self-reported", none: "" };
const STAGE_HELP: Record<string, string> = {
  visitors: "Unique visitors reported by the connected traffic source in the window.",
  signups: "Net new accounts in the window (snapshot deltas of the verified user count).",
  activated: "Users who reached the product's activation event in the window — the first meaningful value.",
  paying: "Paying customers right now (a stock, not a flow) from the connected billing source.",
};

// Public page: fetches by slug. Dashboard: fetches by id. Same visual either way; only stages with real data render.
export function Funnel({ slug, saasId, className, defaultTimeframe = "30d" }: { slug?: string; saasId?: Id<"saas">; className?: string; defaultTimeframe?: Timeframe }) {
  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe);
  const pub = useQuery(api.public.funnel, slug ? { slug, timeframe } : "skip");
  const own = useQuery(api.saas.funnel, saasId ? { id: saasId, timeframe } : "skip");
  const data = slug ? pub : own;
  if (data === undefined) return <Panel className={cn("p-4 sm:p-5", className)}><Skeleton className="h-6 w-32" /><Skeleton className="mt-4 h-40" /></Panel>;
  if (!data || data.stages.length < 2) return null;
  return <FunnelView data={data} timeframe={timeframe} onTimeframe={setTimeframe} className={className} />;
}

export function FunnelView({ data, timeframe, onTimeframe, className }: { data: FunnelData; timeframe: Timeframe; onTimeframe?: (t: Timeframe) => void; className?: string }) {
  const max = Math.max(1, ...data.stages.map((s) => s.value));
  const stages = data.stages;
  return (
    <Panel className={cn("p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SectionLabel>Funnel</SectionLabel>
          {data.verification !== "none" && <span className={cn("border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", data.verification === "verified" ? "border-pink/60 text-pink" : "border-line text-muted-foreground")}>{VERIFICATION[data.verification]}</span>}
        </div>
        {onTimeframe && (
          <div role="tablist" className="flex border border-line">
            {TIMEFRAMES.map((t) => (
              <button key={t} role="tab" aria-selected={timeframe === t} onClick={() => onTimeframe(t)} className={cn("min-w-[40px] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider", timeframe === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{t}</button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: horizontal stages with conversion connectors. Mobile: stacked bars. */}
      <div className="mt-5 hidden md:grid" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map((s, i) => {
          const h = Math.max(6, (s.value / max) * 100);
          return (
            <div key={s.key} className="relative px-3">
              {i > 0 && <Connector pct={s.conversionPct} prev={s.previousConversionPct} label={s.key} />}
              <StageHeader s={s} />
              <div className="mt-3 flex h-28 items-end border-b border-line">
                <div className={cn("w-full transition-[height] duration-700", i === 0 ? "bg-foreground/80" : i === stages.length - 1 ? "bg-pink" : "bg-foreground/40")} style={{ height: `${h}%` }} />
              </div>
              {s.source && <div className="mt-2 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{s.source.label} · {s.source.verification.replace("_", " ")}</div>}
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-3 md:hidden">
        {stages.map((s, i) => {
          const width = Math.max(4, (s.value / max) * 100);
          return (
            <div key={s.key}>
              {i > 0 && (
                <div className="mb-1 flex items-center gap-2 pl-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span className="h-3 w-px bg-line-strong" />
                  {s.conversionPct !== undefined ? `${formatRate(s.conversionPct)} ${convLabel(s.key)}` : "—"}
                  {s.previousConversionPct !== undefined && s.conversionPct !== undefined && <Delta now={s.conversionPct} prev={s.previousConversionPct} suffix="pt" />}
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="w-24 shrink-0"><div className="text-label">{s.label}</div>{s.changePct !== undefined && <div className={cn("font-mono text-[10px]", s.changePct >= 0 ? "text-pink" : "text-destructive")}>{formatPct(s.changePct)}</div>}</div>
                <div className="relative h-8 flex-1 border border-line bg-background"><div className={cn("h-full", i === 0 ? "bg-foreground/80" : i === stages.length - 1 ? "bg-pink" : "bg-foreground/40")} style={{ width: `${width}%` }} /></div>
                <div className="tabular w-16 shrink-0 text-right font-semibold">{formatCompact(s.value)}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Last {data.days} days vs the {data.days} before{data.coverageDays < data.days ? ` · ${data.coverageDays} days of history so far` : ""}</div>
    </Panel>
  );
}

const convLabel = (key: string) => (key === "signups" ? "signup rate" : key === "activated" ? "activation rate" : "paid conversion");

function StageHeader({ s }: { s: FunnelData["stages"][number] }) {
  return (
    <Tooltip>
      <TooltipTrigger className="block w-full text-left">
        <div className="text-label">{s.label}{s.kind === "stock" ? " · now" : ""}</div>
        <div className="tabular mt-1 text-2xl font-semibold tracking-tight">{formatCompact(s.value)}</div>
        <div className="mt-0.5 h-4 font-mono text-[11px]">{s.changePct !== undefined ? <span className={s.changePct >= 0 ? "text-pink" : "text-destructive"}>{formatPct(s.changePct)} <span className="text-muted-foreground">vs prev</span></span> : s.previous !== undefined ? <span className="text-muted-foreground">prev {formatCompact(s.previous)}</span> : null}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-xs">{STAGE_HELP[s.key]}{s.previous !== undefined ? ` Previous window: ${formatCompact(s.previous)}.` : ""}</TooltipContent>
    </Tooltip>
  );
}

function Connector({ pct, prev, label }: { pct?: number; prev?: number; label: string }) {
  return (
    <div className="absolute -left-8 top-3 z-10 flex w-16 flex-col items-center">
      <span className="border border-line bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">{pct !== undefined ? formatRate(pct) : "—"}</span>
      <span className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{convLabel(label).split(" ")[0]}</span>
      {pct !== undefined && prev !== undefined && <Delta now={pct} prev={prev} suffix="pt" />}
    </div>
  );
}

function Delta({ now, prev, suffix }: { now: number; prev: number; suffix: string }) {
  const d = Math.round((now - prev) * 10) / 10;
  if (d === 0) return null;
  return <span className={cn("font-mono text-[10px]", d > 0 ? "text-pink" : "text-destructive")}>{d > 0 ? "+" : ""}{d}{suffix}</span>;
}
