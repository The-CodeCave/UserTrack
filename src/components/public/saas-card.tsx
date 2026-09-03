import Link from "next/link";
import { Panel } from "@/components/blueprint/panel";
import { TrustBadge, type Trust } from "@/components/blueprint/trust-badge";
import { MovementTag, type Movement } from "@/components/blueprint/movement";
import { Sparkline } from "@/components/charts/sparkline";
import { FollowChip } from "@/components/public/follow-chip";
import { formatCompact, formatDelta, formatPct, formatRate } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/utils";

export interface SaasRow {
  _id: string;
  slug: string;
  name: string;
  logoUrl?: string;
  description: string;
  category?: string;
  trust: Trust;
  trustLabel?: string;
  rank?: number;
  rank7dAgo?: number;
  rankDelta7d?: number;
  trendingRank?: number;
  trendingRank7dAgo?: number;
  trendingRankDelta7d?: number;
  bestTrendingRank?: number;
  foundedAt?: number;
  verifiedAt?: number;
  isDemo?: boolean;
  totalUsers: number;
  newUsers24h: number;
  newUsers7d: number;
  newUsers30d: number;
  growth7dPct?: number;
  growth30dPct: number;
  activatedUsers?: number;
  activated7d?: number;
  activated30d?: number;
  activationRatePct?: number;
  convertedUsers?: number;
  newConverted30d?: number;
  convertedGrowth30dPct?: number;
  trialUsers?: number;
  signupToConvertedPct?: number;
  trialToConvertedPct?: number;
  trendingScore7d?: number;
  spark: number[];
  owner?: { username: string; displayName: string } | null;
  movement?: Movement;
  explain?: string;
}

export type BoardKind = "trending" | "fastest" | "most-users" | "most-new" | "most-activated" | "activation-rate" | "new-rising" | "hidden-gems" | "movers" | "best-conversion" | "best-trial-conversion" | "converted-growth";
export type Window = "24h" | "7d" | "30d";

export function SaasLogo({ name, logoUrl, size = 40, className }: { name: string; logoUrl?: string; size?: number; className?: string }) {
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="" width={size} height={size} className={cn("shrink-0 border border-line bg-card object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <div className={cn("grid shrink-0 place-items-center border border-line bg-card font-mono text-sm", className)} style={{ width: size, height: size }}>{name.slice(0, 2).toUpperCase()}</div>
  );
}

// The primary number depends on the board; the secondary line explains it.
export function primaryMetric(s: SaasRow, board: BoardKind, w: Window) {
  const newIn = w === "24h" ? s.newUsers24h : w === "7d" ? s.newUsers7d : s.newUsers30d;
  const growth = w === "30d" ? s.growth30dPct : w === "7d" ? (s.growth7dPct ?? 0) : s.totalUsers - s.newUsers24h > 0 ? (s.newUsers24h / (s.totalUsers - s.newUsers24h)) * 100 : 0;
  switch (board) {
    case "trending": return { label: `New · ${w}`, value: formatDelta(newIn), sub: s.explain ?? formatPct(growth) };
    case "fastest": return { label: `Growth · ${w}`, value: formatPct(growth), sub: `${formatDelta(newIn)} users` };
    case "most-users": return { label: "Total users", value: formatCompact(s.totalUsers), sub: `${formatDelta(newIn)} · ${w}` };
    case "most-activated": return { label: `Activated · ${w}`, value: formatDelta((w === "24h" ? undefined : w === "7d" ? s.activated7d : s.activated30d) ?? s.activatedUsers ?? 0), sub: `${formatRate(s.activationRatePct)} activation` };
    case "activation-rate": return { label: "Activation rate", value: formatRate(s.activationRatePct), sub: `${formatCompact(s.activatedUsers ?? 0)} activated` };
    case "new-rising": return { label: "New · 7d", value: formatDelta(s.newUsers7d), sub: formatPct(s.growth7dPct ?? 0) };
    case "hidden-gems": return { label: "Growth · 7d", value: formatPct(s.growth7dPct ?? 0), sub: `${formatDelta(s.newUsers7d)} users` };
    case "movers": return { label: "Moved · 7d", value: `#${s.rank7dAgo ?? "—"} → #${s.rank ?? "—"}`, sub: `+${s.rankDelta7d ?? 0} places` };
    // Conversion boards only list products that publish the rate; counts appear only when published too.
    case "best-conversion": return { label: "Signup → Converted", value: formatRate(s.signupToConvertedPct), sub: s.convertedUsers !== undefined ? `${formatCompact(s.convertedUsers)} converted` : `${formatCompact(s.totalUsers)} users` };
    case "best-trial-conversion": return { label: "Trial → Converted", value: formatRate(s.trialToConvertedPct), sub: s.trialUsers !== undefined ? `${formatCompact(s.trialUsers)} on trial` : "trial conversion" };
    case "converted-growth": return { label: "Converted · 30d", value: formatPct(s.convertedGrowth30dPct ?? 0), sub: s.newConverted30d !== undefined ? `${formatDelta(s.newConverted30d)} converted` : "converted-user growth" };
    default: return { label: `New · ${w}`, value: formatDelta(newIn), sub: formatPct(growth) };
  }
}

export function LeaderboardRow({ s, position, board = "most-new", window = "30d" }: { s: SaasRow; position: number; board?: BoardKind; window?: Window }) {
  const m = primaryMetric(s, board, window);
  return (
    <div className="relative">
      <Link href={`/s/${s.slug}`} className="group block">
        <Panel className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 p-3 transition-colors group-hover:border-line-strong sm:grid-cols-[2.5rem_1fr_6rem_7rem_5rem_3.5rem] sm:gap-4 sm:px-4 sm:pr-12">
          <div className={cn("font-mono text-sm", position <= 3 ? "text-pink" : "text-muted-foreground")}>{String(position).padStart(2, "0")}</div>
          <div className="flex min-w-0 items-center gap-3">
            <SaasLogo name={s.name} logoUrl={s.logoUrl} size={36} />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2 font-medium"><span className="truncate">{s.name}</span><TrustBadge trust={s.trust} label={s.trustLabel} className="hidden shrink-0 sm:inline-flex" />{s.isDemo && <DemoTag />}</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">{s.category ? `${categoryLabel(s.category)} · ` : ""}{s.owner ? `@${s.owner.username} · ` : ""}{s.description}</div>
            </div>
          </div>
          <Sparkline values={s.spark} className="hidden text-foreground sm:block" />
          <div className="text-right sm:text-left">
            <div className="text-label sm:hidden">{m.label}</div>
            <div className="font-semibold text-pink">{m.value}</div>
            <div className="hidden truncate font-mono text-[11px] text-muted-foreground sm:block" title={m.sub}>{m.sub}</div>
          </div>
          <div className="col-span-3 flex items-center justify-between border-t border-line pt-2 sm:col-span-1 sm:block sm:border-0 sm:pt-0">
            <span className="text-label sm:hidden">Total users</span>
            <span className="font-semibold">{formatCompact(s.totalUsers)}</span>
            <span className="flex items-center gap-2 sm:hidden"><MovementTag m={s.movement ?? null} /><TrustBadge trust={s.trust} label={s.trustLabel} /></span>
          </div>
          <div className="hidden sm:block"><MovementTag m={s.movement ?? null} /></div>
        </Panel>
      </Link>
      <FollowChip targetType="saas" targetId={s._id} className="absolute right-3 top-1/2 hidden -translate-y-1/2 sm:grid" />
    </div>
  );
}

export function DemoTag() {
  return <span className="shrink-0 border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Demo</span>;
}

// Compact card: logo, name, badges, users · category, growth line, sparkline and the board metric; follow chip sits beside the link.
export function MiniSaasCard({ s, metric }: { s: SaasRow; metric?: { label: string; value: string } }) {
  const trusted = s.trust === "verified" && s.trustLabel !== "Data under review";
  return (
    <div className="relative">
      <Link href={`/s/${s.slug}`} className="group block">
        <Panel className="flex h-full items-center gap-3 p-3 pr-12 transition-colors group-hover:border-line-strong">
          <SaasLogo name={s.name} logoUrl={s.logoUrl} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium">
              <span className="min-w-0 truncate">{s.name}</span>
              {s.isDemo && <DemoTag />}
              {trusted && <TrustBadge trust={s.trust} label={s.trustLabel} className="shrink-0" />}
              {s.trendingRank && <span className="shrink-0 border border-pink/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-pink">#{s.trendingRank} trending</span>}
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span className="min-w-0 truncate">{formatCompact(s.totalUsers)} users · {categoryLabel(s.category)}</span>
              {s.movement && <MovementTag m={s.movement} className="shrink-0" />}
            </div>
            <div className="truncate font-mono text-[11px] text-muted-foreground"><span className="text-pink">{formatDelta(s.newUsers30d)}</span> · 30d · {formatPct(s.growth30dPct)}</div>
          </div>
          <Sparkline values={s.spark} width={72} height={24} className="hidden shrink-0 text-foreground sm:block" />
          <div className="shrink-0 text-right">
            <div className="font-semibold text-pink">{metric?.value ?? formatDelta(s.newUsers7d)}</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{metric?.label ?? "7d"}</div>
          </div>
        </Panel>
      </Link>
      <FollowChip targetType="saas" targetId={s._id} className="absolute right-3 top-1/2 -translate-y-1/2" />
    </div>
  );
}
