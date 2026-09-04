import Link from "next/link";
import { Trophy, Flame, Award, TrendingUp, Zap, CalendarDays, Rocket } from "lucide-react";
import { Panel } from "@/components/blueprint/panel";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface MilestoneItem { _id: string; kind: string; title: string; copy: string; achievedAt: number }

export const MILESTONE_ICON: Record<string, typeof Trophy> = {
  users: Trophy, activated: Zap, best_day: Flame, best_week: CalendarDays, rank: Award, top10: Award, top100: Award, streak: TrendingUp, monthly_growth: TrendingUp, trending_top10: Rocket,
};

export function MilestoneRow({ m, slug, name, compact }: { m: MilestoneItem; slug: string; name?: string; compact?: boolean }) {
  const Icon = MILESTONE_ICON[m.kind] ?? Trophy;
  return (
    <Link href={`/s/${slug}/share/milestone-${m._id}`} className="group block">
      <Panel className={cn("flex items-center gap-3 transition-colors group-hover:border-line-strong", compact ? "p-3" : "p-4")}>
        <div className="grid size-9 shrink-0 place-items-center border border-line-strong text-foreground"><Icon className="size-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{name ? `${name} · ` : ""}{m.title}</div>
          <div className="truncate text-xs text-muted-foreground">{m.copy}</div>
        </div>
        <div className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatDate(m.achievedAt)}</div>
      </Panel>
    </Link>
  );
}
