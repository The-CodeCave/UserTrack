import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

// Matte panel with blueprint corner ticks.
export function Panel({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("relative border border-line bg-card/80 backdrop-blur-sm", className)}
      {...props}
    >
      <Ticks />
      {children}
    </div>
  );
}

export function Ticks() {
  const tick = "pointer-events-none absolute size-2 border-line-strong";
  return (
    <>
      <span aria-hidden className={cn(tick, "-top-px -left-px border-t border-l")} />
      <span aria-hidden className={cn(tick, "-top-px -right-px border-t border-r")} />
      <span aria-hidden className={cn(tick, "-bottom-px -left-px border-b border-l")} />
      <span aria-hidden className={cn(tick, "-bottom-px -right-px border-b border-r")} />
    </>
  );
}
