import Link from "next/link";
import { Panel } from "@/components/blueprint/panel";
import { TrustBadge, type Trust } from "@/components/blueprint/trust-badge";
import { Sparkline } from "@/components/charts/sparkline";
import { formatCompact, formatDelta, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface SaasRow {
  slug: string;
  name: string;
  logoUrl?: string;
  description: string;
  trust: Trust;
  rank?: number;
  isDemo?: boolean;
  totalUsers: number;
  newUsers30d: number;
  growth30dPct: number;
  spark: number[];
  owner?: { username: string; displayName: string } | null;
}

export function SaasLogo({ name, logoUrl, size = 40, className }: { name: string; logoUrl?: string; size?: number; className?: string }) {
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="" width={size} height={size} className={cn("shrink-0 border border-line bg-card object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <div className={cn("grid shrink-0 place-items-center border border-line bg-card font-mono text-sm", className)} style={{ width: size, height: size }}>{name.slice(0, 2).toUpperCase()}</div>
  );
}

export function LeaderboardRow({ s, position }: { s: SaasRow; position: number }) {
  return (
    <Link href={`/s/${s.slug}`} className="group block">
      <Panel className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 p-3 transition-colors group-hover:border-line-strong sm:grid-cols-[2.5rem_1fr_6rem_6rem_5rem_4rem] sm:gap-4 sm:px-4">
        <div className={cn("font-mono text-sm", position <= 3 ? "text-pink" : "text-muted-foreground")}>{String(position).padStart(2, "0")}</div>
        <div className="flex min-w-0 items-center gap-3">
          <SaasLogo name={s.name} logoUrl={s.logoUrl} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 truncate font-medium">{s.name}<TrustBadge trust={s.trust} className="hidden sm:inline-flex" />{s.isDemo && <DemoTag />}</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">{s.owner ? `@${s.owner.username}` : ""}{s.owner && s.description ? " · " : ""}{s.description}</div>
          </div>
        </div>
        <Sparkline values={s.spark} className="hidden text-foreground sm:block" />
        <div className="text-right sm:text-left">
          <div className="text-label sm:hidden">30d</div>
          <div className="font-semibold text-pink">{formatDelta(s.newUsers30d)}</div>
          <div className="hidden font-mono text-[11px] text-muted-foreground sm:block">{formatPct(s.growth30dPct)}</div>
        </div>
        <div className="col-span-3 flex items-center justify-between border-t border-line pt-2 sm:col-span-1 sm:block sm:border-0 sm:pt-0">
          <span className="text-label sm:hidden">Total users</span>
          <span className="font-semibold">{formatCompact(s.totalUsers)}</span>
          <TrustBadge trust={s.trust} className="sm:hidden" />
        </div>
        <div className="hidden font-mono text-[11px] text-muted-foreground sm:block">{s.rank ? `#${s.rank}` : "—"}</div>
      </Panel>
    </Link>
  );
}

export function DemoTag() {
  return <span className="border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Demo</span>;
}
