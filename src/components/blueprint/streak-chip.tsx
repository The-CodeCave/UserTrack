import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

// Consecutive closed UTC days with new users (saas.streakDays). Amber like every rising tag — never pink.
export function StreakChip({ days, best, atRisk, className }: { days: number; best?: number; atRisk?: boolean; className?: string }) {
  const showBest = best !== undefined && best > days;
  return (
    <span
      title={atRisk ? "No signups in the last 24h — streak at risk" : `Gained new users on ${days} consecutive days (UTC)${showBest ? ` · best ${best}` : ""}`}
      className={cn("inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]", atRisk ? "border-new/40 text-new/70" : "border-new/60 text-new", className)}
    >
      <Flame className="size-3" />
      {days}-day streak{showBest ? ` · best ${best}` : ""}{atRisk ? " · at risk" : ""}
    </span>
  );
}
