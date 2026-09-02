import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { formatCompact, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface FunnelInput {
  visitors30d?: number;
  newUsers30d: number;
  activated30d?: number;
  activatedUsers?: number;
  payingUsers?: number;
}

// Only stages with connected data are rendered; conversion rates connect adjacent stages.
export function Funnel({ f, className }: { f: FunnelInput; className?: string }) {
  const stages = [
    f.visitors30d !== undefined && { key: "visitors", label: "Visitors · 30d", value: f.visitors30d },
    { key: "signups", label: "Signups · 30d", value: Math.max(0, f.newUsers30d) },
    (f.activated30d ?? f.activatedUsers) !== undefined && { key: "activated", label: f.activated30d !== undefined ? "Activated · 30d" : "Activated · all time", value: f.activated30d ?? f.activatedUsers! },
    f.payingUsers !== undefined && { key: "paying", label: "Paying", value: f.payingUsers },
  ].filter(Boolean) as { key: string; label: string; value: number }[];
  if (stages.length < 2) return null;
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <Panel className={cn("p-4 sm:p-5", className)}>
      <SectionLabel>Funnel</SectionLabel>
      <div className="mt-4 space-y-3">
        {stages.map((s, i) => {
          const prev = stages[i - 1];
          const rate = prev && prev.value > 0 ? (s.value / prev.value) * 100 : undefined;
          const width = Math.max(4, (s.value / max) * 100);
          return (
            <div key={s.key}>
              {prev && (
                <div className="mb-1 flex items-center gap-2 pl-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span className="h-3 w-px bg-line-strong" />
                  {rate !== undefined ? `${formatRate(Math.min(rate, 999))} ${s.key === "signups" ? "signup" : s.key === "activated" ? "activation" : "paid"} conversion` : "—"}
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="w-28 shrink-0 text-label sm:w-36">{s.label}</div>
                <div className="relative h-8 flex-1 border border-line bg-background">
                  <div className={cn("h-full", i === 0 ? "bg-foreground/80" : i === stages.length - 1 ? "bg-pink" : "bg-foreground/40")} style={{ width: `${width}%` }} />
                </div>
                <div className="tabular w-16 shrink-0 text-right font-semibold sm:w-20">{formatCompact(s.value)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
