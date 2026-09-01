import { ShieldCheck, ShieldAlert, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type Trust = "verified" | "unverified" | "pending";

const map = {
  verified: { label: "Verified", Icon: ShieldCheck, cls: "border-pink/60 text-pink" },
  unverified: { label: "Self-reported", Icon: ShieldAlert, cls: "border-line text-muted-foreground" },
  pending: { label: "Pending", Icon: Clock, cls: "border-line text-muted-foreground" },
} as const;

export function TrustBadge({ trust, className }: { trust: Trust; className?: string }) {
  const { label, Icon, cls } = map[trust];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
        cls,
        className,
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}
