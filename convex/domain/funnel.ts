// Lifecycle funnel: Reached → Signed Up → Activated → Trial → Converted over 7d / 30d / 90d, with the previous window.
// Built dynamically from the stages that have a connected source; computed from dailyMetrics (one row per day) — never
// from raw snapshots — with provenance, freshness and health per stage. Aggregate basis: period ratios, not cohorts.
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { DAY, HOUR, dayKey } from "../lib/time";
import { describeProvider, getProvider, normalizeRole, verificationLevel, type LifecycleStage, type Role, type VerificationLevel } from "../providers";
import { visibilityOf, type Visibility } from "./visibility";

export const FUNNEL_TIMEFRAMES = ["7d", "30d", "90d"] as const;
export type FunnelTimeframe = (typeof FUNNEL_TIMEFRAMES)[number];
export type StageKey = LifecycleStage;
export const STAGE_ORDER: StageKey[] = ["reached", "signed_up", "activated", "trial", "converted"];
export const STAGE_LABEL: Record<StageKey, string> = { reached: "Reached", signed_up: "Signed up", activated: "Activated", trial: "Trial", converted: "Converted" };
export type StageHealth = "healthy" | "attention" | "stale";
export const STALE_AFTER_MS = 2 * DAY + HOUR;

export interface FunnelSource {
  provider: string;
  label: string;
  verification: VerificationLevel;
  updatedAt?: number;
  status?: "ok" | "error" | "running";
  trial?: boolean;
  identity?: boolean;
}
export interface FunnelStage {
  key: StageKey;
  label: string;
  // null = the founder publishes the rate but not the count.
  value: number | null;
  previous?: number;
  changePct?: number;
  conversionPct?: number;
  previousConversionPct?: number;
  kind: "flow" | "stock";
  source?: FunnelSource;
  updatedAt?: number;
  health?: StageHealth;
}
export interface FunnelRate { from: StageKey; to: StageKey; label: string; pct?: number; previousPct?: number; adjacent: boolean }
export interface FunnelResult {
  timeframe: FunnelTimeframe;
  days: number;
  stages: FunnelStage[];
  rates: FunnelRate[];
  verification: "verified" | "mixed" | "self_reported" | "none";
  coverageDays: number;
  basis: "aggregate";
  identityQuality: "aggregate_only" | "partially_mapped" | "cohort_verified";
}

export interface FunnelOptions { includeTraffic: boolean; includeActivation: boolean; includeConversion: boolean; includeTrial: boolean; hideConvertedCount: boolean }
export const OWNER_FUNNEL: FunnelOptions = { includeTraffic: true, includeActivation: true, includeConversion: true, includeTrial: true, hideConvertedCount: false };
export function funnelOptionsFor(vis: Visibility): FunnelOptions {
  return { includeTraffic: vis.traffic, includeActivation: vis.activationRate, includeConversion: vis.conversionRate || vis.convertedCount, includeTrial: vis.trialConversion, hideConvertedCount: !vis.convertedCount };
}

type Row = Pick<Doc<"dailyMetrics">, "day" | "newUsers" | "newActivated" | "visitors" | "newTrials" | "newConverted" | "trialUsers" | "convertedUsers">;
type SaasFields = Pick<
  Doc<"saas">,
  "newUsers7d" | "newUsers30d" | "newUsersPrev7d" | "newUsersPrev30d" | "activated7d" | "activated30d" | "activatedUsers" | "visitors30d" | "visitorsPrev30d" | "trialUsers" | "newTrials7d" | "newTrials30d" | "convertedUsers" | "newConverted7d" | "newConverted30d" | "identityQuality"
>;
export type FunnelSources = Partial<Record<Role, FunnelSource>>;
const DAYS: Record<FunnelTimeframe, number> = { "7d": 7, "30d": 30, "90d": 90 };

const sum = (rows: Row[], pick: (r: Row) => number | undefined) => rows.reduce<number | undefined>((a, r) => { const v = pick(r); return v === undefined ? a : (a ?? 0) + v; }, undefined);
const last = (rows: Row[], pick: (r: Row) => number | undefined) => { for (let i = rows.length - 1; i >= 0; i--) { const v = pick(rows[i]); if (v !== undefined) return v; } return undefined; };
const pctChange = (now: number, prev?: number) => (prev === undefined || prev <= 0 ? undefined : Math.round(((now - prev) / prev) * 1000) / 10);
const conv = (a?: number | null, b?: number | null) => (a === undefined || a === null || b === undefined || b === null || b <= 0 ? undefined : Math.round(Math.min(a / b, 9.99) * 1000) / 10);

const RATE_DEFS: { from: StageKey; to: StageKey; label: string }[] = [
  { from: "reached", to: "signed_up", label: "Visitor → Signup" },
  { from: "signed_up", to: "activated", label: "Signup → Activated" },
  { from: "activated", to: "trial", label: "Activated → Trial" },
  { from: "trial", to: "converted", label: "Trial → Converted" },
  { from: "activated", to: "converted", label: "Activated → Converted" },
  { from: "signed_up", to: "converted", label: "Signup → Converted" },
];

export function stageHealth(src: FunnelSource | undefined, now = Date.now()): StageHealth | undefined {
  if (!src) return undefined;
  if (src.status === "error") return "attention";
  if (src.updatedAt !== undefined && now - src.updatedAt > STALE_AFTER_MS) return "stale";
  return "healthy";
}

// Pure: builds stages from the current + previous window rows and the SaaS's materialized numbers (fallback when history is shorter).
export function buildFunnel(saas: SaasFields, timeframe: FunnelTimeframe, current: Row[], previous: Row[], sources: FunnelSources, opts: FunnelOptions, now = Date.now()): FunnelResult {
  const days = DAYS[timeframe];
  const covered = current.length;
  const fromRows = covered >= Math.min(days, 2);
  const win = <T,>(d7: T, d30: T) => (timeframe === "7d" ? d7 : timeframe === "30d" ? d30 : undefined);

  const signups = fromRows ? sum(current, (r) => r.newUsers) ?? 0 : (win(saas.newUsers7d, saas.newUsers30d) ?? saas.newUsers30d);
  const signupsPrev = fromRows && previous.length ? sum(previous, (r) => r.newUsers) : win(saas.newUsersPrev7d, saas.newUsersPrev30d);

  const activation = opts.includeActivation ? sources.activation : undefined;
  const activated = activation ? (sum(current, (r) => r.newActivated) ?? win(saas.activated7d, saas.activated30d) ?? saas.activatedUsers) : undefined;
  const activatedPrev = activation ? sum(previous, (r) => r.newActivated) : undefined;

  const visitors = opts.includeTraffic && sources.traffic ? (sum(current, (r) => r.visitors) ?? (timeframe === "30d" ? saas.visitors30d : undefined)) : undefined;
  const visitorsPrev = opts.includeTraffic && sources.traffic ? (sum(previous, (r) => r.visitors) ?? (timeframe === "30d" ? saas.visitorsPrev30d : undefined)) : undefined;

  const conversion = opts.includeConversion ? sources.conversion : undefined;
  const convertedFlow = conversion ? (sum(current, (r) => r.newConverted) ?? win(saas.newConverted7d, saas.newConverted30d)) : undefined;
  const convertedStock = conversion ? (last(current, (r) => r.convertedUsers) ?? saas.convertedUsers) : undefined;
  const converted = convertedFlow ?? convertedStock;
  const convertedKind: "flow" | "stock" = convertedFlow !== undefined ? "flow" : "stock";
  const convertedPrev = conversion ? (convertedKind === "flow" ? sum(previous, (r) => r.newConverted) : last(previous, (r) => r.convertedUsers)) : undefined;

  const trialSource = conversion && opts.includeTrial && conversion.trial ? conversion : undefined;
  const trialFlow = trialSource ? (sum(current, (r) => r.newTrials) ?? win(saas.newTrials7d, saas.newTrials30d)) : undefined;
  const trialStock = trialSource ? (last(current, (r) => r.trialUsers) ?? saas.trialUsers) : undefined;
  const trial = trialFlow ?? trialStock;
  const trialKind: "flow" | "stock" = trialFlow !== undefined ? "flow" : "stock";
  const trialPrev = trialSource ? (trialKind === "flow" ? sum(previous, (r) => r.newTrials) : last(previous, (r) => r.trialUsers)) : undefined;

  const stage = (key: StageKey, value: number | undefined, prev: number | undefined, kind: "flow" | "stock", source?: FunnelSource, hide = false): FunnelStage | null =>
    value === undefined ? null : { key, label: STAGE_LABEL[key], value: hide ? null : Math.max(0, value), previous: hide ? undefined : prev, changePct: hide ? undefined : pctChange(value, prev), kind, source, updatedAt: source?.updatedAt, health: stageHealth(source, now) };

  const hidden = opts.hideConvertedCount;
  const stages = [
    stage("reached", visitors, visitorsPrev, "flow", sources.traffic),
    stage("signed_up", signups, signupsPrev, "flow", sources.users),
    stage("activated", activated, activatedPrev, "flow", activation),
    stage("trial", trial, trialPrev, trialKind, trialSource, hidden),
    stage("converted", converted, convertedPrev, convertedKind, conversion, hidden),
  ].filter((s): s is FunnelStage => s !== null);

  // Rates use the real values even when the count is hidden, so a public rate never leaks through a rounded count.
  const real = new Map<StageKey, { value: number; prev?: number }>();
  if (visitors !== undefined) real.set("reached", { value: visitors, prev: visitorsPrev });
  real.set("signed_up", { value: signups, prev: signupsPrev });
  if (activated !== undefined) real.set("activated", { value: activated, prev: activatedPrev });
  if (trial !== undefined) real.set("trial", { value: trial, prev: trialPrev });
  if (converted !== undefined) real.set("converted", { value: converted, prev: convertedPrev });

  for (let i = 1; i < stages.length; i++) {
    const a = real.get(stages[i].key)!;
    const b = real.get(stages[i - 1].key)!;
    stages[i].conversionPct = conv(a.value, b.value);
    stages[i].previousConversionPct = conv(a.prev, b.prev);
  }
  const rates: FunnelRate[] = RATE_DEFS.filter((d) => real.has(d.from) && real.has(d.to)).map((d) => {
    const a = real.get(d.to)!;
    const b = real.get(d.from)!;
    const idx = stages.findIndex((s) => s.key === d.to);
    return { ...d, pct: conv(a.value, b.value), previousPct: conv(a.prev, b.prev), adjacent: idx > 0 && stages[idx - 1].key === d.from };
  });

  const levels = stages.map((s) => s.source?.verification).filter((x): x is VerificationLevel => Boolean(x));
  const verification = levels.length === 0 ? "none" : levels.every((l) => l === "verified") ? "verified" : levels.every((l) => l === "self_reported") ? "self_reported" : "mixed";
  return { timeframe, days, stages, rates, verification, coverageDays: covered, basis: "aggregate", identityQuality: saas.identityQuality ?? "aggregate_only" };
}

export async function funnelSources(ctx: QueryCtx, saasId: Doc<"saas">["_id"]): Promise<FunnelSources> {
  const integrations = await ctx.db.query("integrations").withIndex("by_saas", (q) => q.eq("saasId", saasId)).collect();
  const out: FunnelSources = {};
  for (const i of integrations) {
    const role = normalizeRole(i.role);
    const p = getProvider(i.provider);
    if (i.lastSuccessAt === undefined && i.status !== "ok") continue;
    const caps = describeProvider(p, i.config, role);
    out[role] = { provider: i.provider, label: p.label, verification: verificationLevel(i.provider, i.trust, caps, role), updatedAt: i.lastSuccessAt, status: i.status, trial: caps.trial, identity: caps.identity };
  }
  return out;
}

// Reads at most 2×days daily rows (indexed) — never snapshots.
export async function funnelFor(ctx: QueryCtx, saas: Doc<"saas">, timeframe: FunnelTimeframe, opts: FunnelOptions = funnelOptionsFor(visibilityOf(saas))): Promise<FunnelResult> {
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

// History of the strategic rates as trailing-7-day ratios, one point per day. Pure over daily rows.
export interface FunnelHistoryPoint { day: string; signupToActivatedPct?: number; signupToConvertedPct?: number; activatedToConvertedPct?: number; trialToConvertedPct?: number }
export function funnelHistory(rows: Row[], opts: { activation: boolean; conversion: boolean; trial: boolean }, window = 7): FunnelHistoryPoint[] {
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const out: FunnelHistoryPoint[] = [];
  for (let i = window - 1; i < sorted.length; i++) {
    const w = sorted.slice(i - window + 1, i + 1);
    const signups = sum(w, (r) => r.newUsers) ?? 0;
    const activated = opts.activation ? sum(w, (r) => r.newActivated) : undefined;
    const converted = opts.conversion ? sum(w, (r) => r.newConverted) : undefined;
    const trials = opts.trial ? sum(w, (r) => r.newTrials) : undefined;
    out.push({ day: sorted[i].day, signupToActivatedPct: conv(activated, signups), signupToConvertedPct: conv(converted, signups), activatedToConvertedPct: conv(converted, activated), trialToConvertedPct: conv(converted, trials) });
  }
  return out;
}

export async function funnelHistoryFor(ctx: QueryCtx, saas: Doc<"saas">, days: number, opts: FunnelOptions) {
  const rows = await ctx.db.query("dailyMetrics").withIndex("by_saas_day", (q) => q.eq("saasId", saas._id).gte("day", dayKey(Date.now() - (days + 7) * DAY))).collect();
  const sources = await funnelSources(ctx, saas._id);
  return funnelHistory(rows, { activation: opts.includeActivation && Boolean(sources.activation), conversion: opts.includeConversion && Boolean(sources.conversion), trial: opts.includeTrial && Boolean(sources.conversion?.trial) });
}
