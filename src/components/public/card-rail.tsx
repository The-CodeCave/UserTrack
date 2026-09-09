import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Panel } from "@/components/blueprint/panel";
import { TrustBadge } from "@/components/blueprint/trust-badge";
import { SaasLogo, type SaasRow } from "@/components/public/saas-card";
import { formatCompact, formatDelta, formatPct } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/utils";

// Horizontal strip of product cards above the board. Hidden entirely when the underlying board is empty —
// never a placeholder, never padded (docs/DESIGN.md → list-first landing).
export function CardRail({ title, href, items }: { title: string; href: string; items: SaasRow[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <Link href={href} className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
          View all <ChevronRight className="size-3.5" />
        </Link>
      </div>
      <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {items.map((s) => (
          <div key={s._id} className="w-[17rem] shrink-0 snap-start">
            <RailCard s={s} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Identity on top, the three board numbers underneath — the same shape every rail uses, whatever ranked it.
// The corner tag is the one thing that varies, and only ever marks a positive: a trending position or a
// verified source. "Self-reported" is not worth a card corner — the board rows below already say it.
function RailCard({ s }: { s: SaasRow }) {
  const tag = s.trendingRank
    ? <span className="border border-new/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-new">#{s.trendingRank} Trending</span>
    : s.trust === "verified" && s.trustLabel !== "Data under review"
      ? <TrustBadge trust={s.trust} label={s.trustLabel} />
      : null;
  return (
    <Link href={`/s/${s.slug}`} className="group block h-full">
      <Panel className="flex h-full flex-col gap-3 p-3 transition-colors group-hover:border-line-strong">
        {tag && <div className="absolute right-2 top-2">{tag}</div>}
        <div className={cn("flex items-center gap-2.5", tag && "pr-2 pt-5")}>
          <SaasLogo name={s.name} logoUrl={s.logoUrl} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{s.name}</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">{categoryLabel(s.category)}</div>
          </div>
        </div>
        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-2.5">
          <Stat label="Users" value={formatCompact(s.totalUsers)} />
          <Stat label="New · 7d" value={formatDelta(s.newUsers7d)} />
          <Stat label="Growth" value={formatPct(s.growth30dPct)} />
        </div>
      </Panel>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
