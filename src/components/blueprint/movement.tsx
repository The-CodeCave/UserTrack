import { ArrowDown, ArrowUp, Minus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type Movement = { kind: "up" | "down" | "same" | "new"; delta: number } | null;

export function MovementTag({ m, className }: { m: Movement; className?: string }) {
  if (!m) return <span className={cn("font-mono text-[11px] text-muted-foreground", className)}>—</span>;
  const cls = m.kind === "up" ? "text-positive" : m.kind === "down" ? "text-negative" : "text-muted-foreground";
  const Icon = m.kind === "up" ? ArrowUp : m.kind === "down" ? ArrowDown : m.kind === "new" ? Sparkles : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-mono text-[11px]", cls, className)} title={m.kind === "new" ? "New on the board" : `${m.delta > 0 ? "+" : ""}${m.delta} since last refresh`}>
      <Icon className="size-3" />
      {m.kind === "new" ? "new" : m.kind === "same" ? "" : Math.abs(m.delta)}
    </span>
  );
}
