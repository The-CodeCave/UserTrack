"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { IDENTITY_QUALITY_META } from "@convex/lib/identity";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCompact, formatPct, formatRate, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FunnelData = NonNullable<FunctionReturnType<typeof api.public.funnel>>;
export type CohortData = NonNullable<FunctionReturnType<typeof api.cohorts.publicCohorts>>;
type Stage = FunnelData["stages"][number];
type Timeframe = FunnelData["timeframe"];
const TIMEFRAMES: Timeframe[] = ["7d", "30d", "90d"];
const VERIFICATION: Record<FunnelData["verification"], string> = { verified: "Verified funnel", mixed: "Mixed provenance", self_reported: "Self-reported", none: "" };
const STAGE_HELP: Record<Stage["key"], string> = {
  reached: "Unique visitors reported by the connected traffic source in the window.",
  signed_up: "New users in the window from the identity source.",
  activated: "Users who reached the product's activation event in the window — the first meaningful value.",
  trial: "Users on a trial (a stock when the source only reports current state).",
  converted: "Users who converted according to the connected conversion source. Never amounts.",
};
const HEALTH = { attention: { label: "Needs attention", cls: "border-destructive/60 text-destructive" }, stale: { label: "Stale", cls: "border-line text-muted-foreground" } } as const;
const HIDDEN_HELP = "Count is private; the founder publishes the rate only";
const chip = "inline-flex items-center border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider";

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

// Bar heights as % of the tallest stage. A hidden count inherits the previous bar scaled by its rate, so the shape still reads.
function heights(stages: Stage[]) {
  const max = Math.max(1, ...stages.map((s) => s.value ?? 0));
  const out: number[] = [];
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    out.push(s.value !== null ? Math.max(4, (s.value / max) * 100) : Math.max(4, (out[i - 1] ?? 100) * ((s.conversionPct ?? 0) / 100)));
  }
  return out;
}

export function FunnelView({ data, timeframe, onTimeframe, className }: { data: FunnelData; timeframe: Timeframe; onTimeframe?: (t: Timeframe) => void; className?: string }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setDrawn(true)); return () => cancelAnimationFrame(t); }, []);
  const stages = data.stages;
  const hs = heights(stages);
  const strategic = data.rates.filter((r) => !r.adjacent).slice(0, 3);
  const identity = IDENTITY_QUALITY_META[data.identityQuality];
  const bar = (i: number) => (i === stages.length - 1 ? "bg-pink" : i === 0 ? "bg-foreground/80" : "bg-foreground/40");
  return (
    <Panel className={cn("p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SectionLabel>Funnel</SectionLabel>
          {data.verification !== "none" && <span className={cn(chip, data.verification === "verified" ? "border-pink/60 text-pink" : "border-line text-muted-foreground")}>{VERIFICATION[data.verification]}</span>}
          <Tooltip>
            <TooltipTrigger className={cn(chip, data.identityQuality === "cohort_verified" ? "border-pink/60 text-pink" : "border-line text-muted-foreground")}>{identity.label}</TooltipTrigger>
            <TooltipContent className="max-w-[260px] text-xs">{identity.blurb}</TooltipContent>
          </Tooltip>
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
      <div className="relative mt-5 hidden md:grid" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-3 h-px bg-line" />
        {stages.map((s, i) => (
          <div key={s.key} className={cn("relative px-3 pt-12", i > 0 && "border-l border-line")}>
            {i > 0 && <Connector pct={s.conversionPct} prev={s.previousConversionPct} label={`${stages[i - 1].label} → ${s.label}`} />}
            <StageHeader s={s} />
            <div className="mt-3 flex h-28 items-end border-b border-line-strong">
              <div className={cn("w-full transition-[height] duration-700 ease-out", s.value === null ? "border border-dashed border-line-strong" : bar(i))} style={{ height: `${drawn ? hs[i] : 0}%` }} />
            </div>
            <Provenance s={s} className="mt-2" />
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-3 md:hidden">
        {stages.map((s, i) => (
          <div key={s.key}>
            {i > 0 && (
              <div className="mb-1 flex items-center gap-2 pl-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className="h-3 w-px bg-line-strong" />
                {formatRate(s.conversionPct)} {stages[i - 1].label} → {s.label}
                {s.previousConversionPct !== undefined && s.conversionPct !== undefined && <Delta now={s.conversionPct} prev={s.previousConversionPct} suffix="pt" />}
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-24 shrink-0"><div className="text-label">{s.label}</div>{s.changePct !== undefined && <div className={cn("font-mono text-[10px]", s.changePct >= 0 ? "text-pink" : "text-destructive")}>{formatPct(s.changePct)}</div>}</div>
              <div className="relative h-8 flex-1 border border-line bg-background"><div className={cn("h-full transition-[width] duration-700 ease-out", s.value === null ? "border-r border-dashed border-line-strong" : bar(i))} style={{ width: `${drawn ? hs[i] : 0}%` }} /></div>
              <div className="tabular w-16 shrink-0 text-right font-semibold"><Count s={s} /></div>
            </div>
            <Provenance s={s} className="mt-1 pl-1" />
          </div>
        ))}
      </div>

      {strategic.length > 0 && (
        <div className="mt-4 grid gap-px border border-line bg-line sm:grid-cols-3">
          {strategic.map((r) => (
            <div key={`${r.from}-${r.to}`} className="flex items-baseline justify-between gap-2 bg-card px-3 py-2">
              <span className="text-label">{r.label}</span>
              <span className="flex items-baseline gap-1.5"><span className="tabular font-mono text-sm font-semibold">{formatRate(r.pct)}</span>{r.pct !== undefined && r.previousPct !== undefined && <Delta now={r.pct} prev={r.previousPct} suffix="pt" />}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Last {data.days} days vs the {data.days} before{data.coverageDays < data.days ? ` · ${data.coverageDays} days of history so far` : ""}</div>
    </Panel>
  );
}

function Count({ s }: { s: Stage }) {
  if (s.value !== null) return <>{formatCompact(s.value)}</>;
  return (
    <Tooltip>
      <TooltipTrigger className="text-muted-foreground">—</TooltipTrigger>
      <TooltipContent className="text-xs">{HIDDEN_HELP}</TooltipContent>
    </Tooltip>
  );
}

function StageHeader({ s }: { s: Stage }) {
  return (
    <Tooltip>
      <TooltipTrigger className="block w-full text-left">
        <div className="text-label">{s.label}{s.kind === "stock" ? " · now" : ""}</div>
        <div className={cn("tabular mt-1 text-2xl font-semibold tracking-tight", s.value === null && "text-muted-foreground")}>{s.value === null ? "—" : formatCompact(s.value)}</div>
        <div className="mt-0.5 h-4 font-mono text-[11px]">{s.changePct !== undefined ? <span className={s.changePct >= 0 ? "text-pink" : "text-destructive"}>{formatPct(s.changePct)} <span className="text-muted-foreground">vs prev</span></span> : s.previous !== undefined ? <span className="text-muted-foreground">prev {formatCompact(s.previous)}</span> : null}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-xs">{s.value === null ? HIDDEN_HELP : STAGE_HELP[s.key]}{s.previous !== undefined ? ` Previous window: ${formatCompact(s.previous)}.` : ""}</TooltipContent>
    </Tooltip>
  );
}

function Provenance({ s, className }: { s: Stage; className?: string }) {
  if (!s.source) return null;
  const health = s.health && s.health !== "healthy" ? HEALTH[s.health] : null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground", className)}>
      <span className="truncate">{s.source.label} · {s.source.verification.replace("_", " ")}{s.updatedAt ? ` · updated ${timeAgo(s.updatedAt)}` : ""}</span>
      {health && <span className={cn(chip, health.cls)}>{health.label}</span>}
    </div>
  );
}

function Connector({ pct, prev, label }: { pct?: number; prev?: number; label: string }) {
  return (
    <div className="absolute -left-14 top-0 z-10 flex w-28 flex-col items-center">
      <span className="border border-line bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">{formatRate(pct)}</span>
      <span className="mt-0.5 max-w-full truncate bg-card px-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground" title={label}>{label}</span>
      {pct !== undefined && prev !== undefined && <Delta now={pct} prev={prev} suffix="pt" />}
    </div>
  );
}

function Delta({ now, prev, suffix }: { now: number; prev: number; suffix: string }) {
  const d = Math.round((now - prev) * 10) / 10;
  if (d === 0) return null;
  return <span className={cn("font-mono text-[10px]", d > 0 ? "text-pink" : "text-destructive")}>{d > 0 ? "+" : ""}{d}{suffix}</span>;
}

const monthLabel = (cohort: string) => new Date(Number(cohort.slice(0, 4)), Number(cohort.slice(5, 7)) - 1, 1).toLocaleDateString("en", { month: "long", year: "numeric" });
const count = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatCompact(n));

// Cohort table (same-user progression). Shown only when the cohort engine produced rows; counts may be private (null).
export function CohortTable({ data, className }: { data: CohortData; className?: string }) {
  const rows = data.cohorts.slice(-6).reverse();
  if (rows.length === 0) return null;
  const latest = rows[0];
  const hasTrial = rows.some((r) => r.trialPct !== undefined);
  const hasConverted = rows.some((r) => r.convertedD30Pct !== undefined);
  // Counts hidden by the founder → the column is only dashes; drop it on small screens.
  const countCol = rows.every((r) => r.signedUp === null) ? "hidden sm:table-cell" : "";
  const sentence = [
    latest.signedUp !== null ? `${formatCompact(latest.signedUp)} signed up` : null,
    latest.activationPct !== undefined ? `${formatRate(latest.activationPct)} activated` : null,
    latest.convertedD30Pct !== undefined ? `${formatRate(latest.convertedD30Pct)} converted within 30 days` : null,
  ].filter(Boolean).join(" · ");
  return (
    <Panel className={cn("p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <SectionLabel>Cohorts</SectionLabel>
        <Tooltip>
          <TooltipTrigger className={cn(chip, data.identityQuality === "cohort_verified" ? "border-pink/60 text-pink" : "border-line text-muted-foreground")}>{data.label}</TooltipTrigger>
          <TooltipContent className="max-w-[260px] text-xs">{data.explanation}</TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-2 text-sm">Of users who signed up in {monthLabel(latest.cohort)}: {sentence}.</p>
      <table className="tabular mt-3 w-full font-mono text-[11px]">
        <thead>
          <tr className="text-label border-b border-line text-left">
            <th className="py-1.5 font-normal">Cohort</th>
            <th className={cn("py-1.5 pl-2 text-right font-normal whitespace-nowrap", countCol)}>Signed up</th>
            <th className="py-1.5 pl-2 text-right font-normal">Activated</th>
            {hasTrial && <th className="py-1.5 pl-2 text-right font-normal">Trial</th>}
            {hasConverted && <th className="py-1.5 pl-2 text-right font-normal whitespace-nowrap">Conv. · 30d</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cohort} className="border-b border-line last:border-0">
              <td className="py-1.5">{r.cohort}</td>
              <td className={cn("py-1.5 text-right", countCol)}>{count(r.signedUp)}</td>
              <td className="py-1.5 text-right">{formatRate(r.activationPct)}</td>
              {hasTrial && <td className="py-1.5 text-right">{formatRate(r.trialPct)}</td>}
              {hasConverted && <td className="py-1.5 text-right text-pink">{formatRate(r.convertedD30Pct)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
