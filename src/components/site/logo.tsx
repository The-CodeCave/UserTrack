import { cn } from "@/lib/utils";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid size-7 place-items-center border border-line-strong font-mono text-[11px] leading-none">
        U<span className="text-pink">T</span>
      </span>
      {!compact && (
        <span className="text-lg">User<span className="text-pink">Track</span></span>
      )}
    </span>
  );
}
