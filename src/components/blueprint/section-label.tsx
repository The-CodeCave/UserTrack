import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function SectionLabel({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("text-label flex items-center gap-2", className)} {...props}>
      <span aria-hidden className="h-px w-4 bg-line-strong" />
      {children}
    </div>
  );
}
