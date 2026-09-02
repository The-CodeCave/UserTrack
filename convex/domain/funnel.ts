// Funnel: Visitors → Signups → Activated → Paying over 7d / 30d / 90d, with the previous window for comparison.
// Computed from dailyMetrics (one row per day) — never from raw snapshots — and provenance per stage.
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { DAY, dayKey } from "../lib/time";
import { describeProvider, getProvider, verificationLevel, type VerificationLevel } from "../providers";

export const FUNNEL_TIMEFRAMES = ["7d", "30d", "90d"] as const;
export type FunnelTimeframe = (typeof FUNNEL_TIMEFRAMES)[number];
export type StageKey = "visitors" | "signups" | "activated" | "paying";

export interface FunnelSource { provider: string; label: string; verification: VerificationLevel }
export interface FunnelStage {
  key: StageKey;
  label: string;
  value: number;
  previous?: number;
  changePct?: number;
  conversionPct?: number;
  previousConversionPct?: number;
  kind: "flow" | "stock";
  source?: FunnelSource;
}
export interface FunnelResult {
  timeframe: FunnelTimeframe;
  days: number;
  stages: FunnelStage[];
  verification: "verified" | "mixed" | "self_reported" | "none";
  coverageDays: number;
}

type Row = Pick<Doc<"dailyMetrics">, "day" | "newUsers" | "newActivated" | "visitors" | "payingUsers">;
const DAYS: Record<FunnelTimeframe, number> = { "7d": 7, "30d": 30, "90d": 90 };

const sum = (rows: Row[], pick: (r: Row) => number | undefined) => rows.reduce<number | undefined>((a, r) => { const v = pick(r); return v === undefined ? a : (a ?? 0) + v; }, undefined);
const last = (rows: Row[], pick: (r: Row) => number | undefined) => { for (let i = rows.length - 1; i >= 0; i--) { const v = pick(rows[i]); if (v !== undefined) return v; } return undefined; };
const pctChange = (now: number, prev?: number) => (prev === undefined || prev <= 0 ? undefined : Math.round(((now - prev) / prev) * 1000) / 10);
const conv = (a?: number, b?: number) => (a === undefined || b === undefined || b <= 0 ? undefined : Math.round(Math.min(a / b, 9.99) * 1000) / 10);

// Pure: builds stages from the current + previous window rows and the SaaS's materialized numbers (fallback when history is shorter).
export function buildFunnel(
  saas: Pick<Doc<"saas">, "newUsers7d" | "newUsers30d" | "newUsersPrev7d" | "newUsersPrev30d" | "activated7d" | "activated30d" | "activatedUsers" | "visitors30d" | "visitorsPrev30d" | "payingUsers">,
  timeframe: FunnelTimeframe,
  current: Row[],
  previous: Row[],
  sources: Partial<Record<"users" | "activation" | "traffic" | "revenue", FunnelSource>>,
  opts: { includeTraffic: boolean; includeRevenue: boolean },
): FunnelResult {
  const days = DAYS[timeframe];
  const covered = current.length;
  const fromRows = covered >= Math.min(days, 2);
  const signups = fromRows ? sum(current, (r) => r.newUsers) ?? 0 : timeframe === "7d" ? saas.newUsers7d : saas.newUsers30d;
  const signupsPrev = fromRows && previous.length ? sum(previous, (r) => r.newUsers) : timeframe === "7d" ? saas.newUsersPrev7d : timeframe === "30d" ? saas.newUsersPrev30d : undefined;
  const activatedRows = sum(current, (r) => r.newActivated);
  const activated = sources.activation ? (activatedRows ?? (timeframe === "7d" ? saas.activated7d : saas.activated30d) ?? saas.activatedUsers) : undefined;
  const activatedPrev = sources.activation ? sum(previous, (r) => r.newActivated) : undefined;
  const visitorRows = sum(current, (r) => r.visitors);
  const visitors = opts.includeTraffic && sources.traffic ? (visitorRows ?? (timeframe === "30d" ? saas.visitors30d : undefined)) : undefined;
  const visitorsPrev = opts.includeTraffic && sources.traffic ? (sum(previous, (r) => r.visitors) ?? (timeframe === "30d" ? saas.visitorsPrev30d : undefined)) : undefined;
  const paying = opts.includeRevenue && sources.revenue ? (last(current, (r) => r.payingUsers) ?? saas.payingUsers) : undefined;
  const payingPrev = opts.includeRevenue && sources.revenue ? last(previous, (r) => r.payingUsers) : undefined;

  const stages: FunnelStage[] = [];
  if (visitors !== undefined) stages.push({ key: "visitors", label: "Visitors", value: visitors, previous: visitorsPrev, changePct: pctChange(visitors, visitorsPrev), kind: "flow", source: sources.traffic });
  stages.push({ key: "signups", label: "Signups", value: Math.max(0, signups), previous: signupsPrev, changePct: pctChange(signups, signupsPrev), kind: "flow", source: sources.users });
  if (activated !== undefined) stages.push({ key: "activated", label: "Activated", value: Math.max(0, activated), previous: activatedPrev, changePct: pctChange(activated, activatedPrev), kind: "flow", source: sources.activation });
  if (paying !== undefined) stages.push({ key: "paying", label: "Paying", value: paying, previous: payingPrev, changePct: pctChange(paying, payingPrev), kind: "stock", source: sources.revenue });
  for (let i = 1; i < stages.length; i++) {
    stages[i].conversionPct = conv(stages[i].value, stages[i - 1].value);
    stages[i].previousConversionPct = conv(stages[i].previous, stages[i - 1].previous);
  }
  const levels = stages.map((s) => s.source?.verification).filter((x): x is VerificationLevel => Boolean(x));
  const verification = levels.length === 0 ? "none" : levels.every((l) => l === "verified") ? "verified" : levels.every((l) => l === "self_reported") ? "self_reported" : "mixed";
  return { timeframe, days, stages, verification, coverageDays: covered };
}

export async function funnelSources(ctx: QueryCtx, saasId: Doc<"saas">["_id"]) {
  const integrations = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).collect();
  const out: Partial<Record<"users" | "activation" | "traffic" | "revenue", FunnelSource>> = {};
  for (const i of integrations) {
    const role = i.role ?? "users";
    const p = getProvider(i.provider);
    if (i.lastSuccessAt === undefined && i.status !== "ok") continue;
    out[role] = { provider: i.provider, label: p.label, verification: verificationLevel(i.provider, i.trust, describeProvider(p, i.config, role), role) };
  }
  return out;
}

// Reads at most 2×days daily rows (indexed) — never snapshots.
export async function funnelFor(ctx: QueryCtx, saas: Doc<"saas">, timeframe: FunnelTimeframe, opts: { includeTraffic: boolean; includeRevenue: boolean }): Promise<FunnelResult> {
  const days = DAYS[timeframe];
  const today = dayKey(Date.now());
  const start = dayKey(Date.now() - days * DAY);
  const prevStart = dayKey(Date.now() - 2 * days * DAY);
  const rows = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saas._id).gte("day", prevStart).lte("day", today)).collect();
  const current = rows.filter((r) => r.day > start);
  const previous = rows.filter((r) => r.day <= start);
  const sources = await funnelSources(ctx, saas._id);
  return buildFunnel(saas, timeframe, current, previous, sources, opts);
}
