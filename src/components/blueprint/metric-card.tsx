import { Panel } from "./panel";
import { cn } from "@/lib/utils";
import { formatCompact, formatDelta } from "@/lib/format";

export function MetricCard({
  label,
  value,
  delta,
  accent,
  className,
  children,
  action,
}: {
  label: string;
  value: number;
  delta?: number;
  accent?: boolean;
  className?: string;
  children?: React.ReactNode;
  /** Top-right affordance, e.g. a Share button. */
  action?: React.ReactNode;
}) {
  return (
    <Panel className={cn("p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-2"><div className="text-label">{label}</div>{action && <div className="-mr-2 -mt-2">{action}</div>}</div>
      <div
        className={cn(
          "mt-2 text-3xl font-semibold tracking-tight sm:text-4xl",
          accent && "text-foreground",
        )}
      >
        {formatCompact(value)}
      </div>
      {delta !== undefined && (
        <div
          className={cn(
            "tabular mt-1 font-mono text-xs",
            delta > 0 ? "text-positive" : delta < 0 ? "text-negative" : "text-muted-foreground",
          )}
        >
          {formatDelta(delta)}
        </div>
      )}
      {children}
    </Panel>
  );
}
