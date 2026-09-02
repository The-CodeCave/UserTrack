import { ShieldCheck, ShieldAlert, Clock, ShieldHalf, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

export type Trust = "verified" | "unverified" | "pending";

const map = {
  verified: { label: "Verified", Icon: ShieldCheck, cls: "border-pink/60 text-pink" },
  unverified: { label: "Self-reported", Icon: ShieldAlert, cls: "border-line text-muted-foreground" },
  pending: { label: "Pending", Icon: Clock, cls: "border-line text-muted-foreground" },
} as const;

const byLabel: Record<string, { Icon: typeof ShieldCheck; cls: string }> = {
  "Partially verified": { Icon: ShieldHalf, cls: "border-pink/40 text-pink/80" },
  "Data under review": { Icon: Eye, cls: "border-line-strong text-foreground/80" },
};

// `label` (from the trust model) overrides the plain trust level when present.
export function TrustBadge({ trust, label, className, title }: { trust: Trust; label?: string; className?: string; title?: string }) {
  const base = map[trust];
  const over = label && label !== base.label ? byLabel[label] : undefined;
  const Icon = over?.Icon ?? base.Icon;
  return (
    <span
      title={title ?? trustTitle(label ?? base.label)}
      className={cn("inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]", over?.cls ?? base.cls, className)}
    >
      <Icon className="size-3" />
      {label ?? base.label}
    </span>
  );
}

export function trustTitle(label: string) {
  switch (label) {
    case "Verified": return "Synced read-only from a connected provider with a healthy history.";
    case "Partially verified": return "Synced from a connected provider; the connection is new or has gaps.";
    case "Data under review": return "Recent numbers moved unusually. Excluded from rankings until the next review.";
    case "Self-reported": return "Entered by the founder. Never ranked.";
    default: return "Connected — waiting for the first successful sync.";
  }
}
