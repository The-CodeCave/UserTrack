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
}: {
  label: string;
  value: number;
  delta?: number;
  accent?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Panel className={cn("p-4 sm:p-5", className)}>
      <div className="text-label">{label}</div>
      <div
        className={cn(
          "tabular mt-2 text-3xl font-semibold tracking-tight sm:text-4xl",
          accent && "text-pink",
        )}
      >
        {formatCompact(value)}
      </div>
      {delta !== undefined && (
        <div
          className={cn(
            "tabular mt-1 font-mono text-xs",
            delta > 0 ? "text-pink" : delta < 0 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {formatDelta(delta)}
        </div>
      )}
      {children}
    </Panel>
  );
}
