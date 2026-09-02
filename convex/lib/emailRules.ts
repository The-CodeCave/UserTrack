// Pure, unit-tested rules behind every growth / lifecycle email. No I/O here.
import { DAY, HOUR } from "./time";

export const EMAIL_USER_THRESHOLDS = [10, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
export const RANK_THRESHOLDS = [100, 50, 25, 10, 5, 1];
// Followers only hear about the big ones.
export const FOLLOWER_USER_THRESHOLD_MIN = 1_000;
export const FOLLOWER_RANK_THRESHOLD_MAX = 10;

export const SPIKE = { minHistoryDays: 14, multiple: 2.5, minAbsolute: 20, cooldownMs: 7 * DAY };
export const NO_GROWTH = { days: 7, minTotalUsers: 50, minNewUsers30d: 10 };
export const SOURCE_UNHEALTHY = { consecutiveFailures: 6, minFailures: 3, maxSilenceMs: 24 * HOUR };

// Highest threshold crossed between two totals, plus every lower one that was crossed at the same time.
export function crossedThresholds(prev: number | null, next: number, thresholds = EMAIL_USER_THRESHOLDS) {
  if (prev === null) return [];
  return thresholds.filter((t) => next >= t && prev < t);
}

// Rank thresholds entered on this rerank. Only meaningful when the board is bigger than the threshold.
export function enteredRankThresholds(prevRank: number | undefined, rank: number | undefined, boardSize: number, thresholds = RANK_THRESHOLDS) {
  if (!rank) return [];
  return thresholds.filter((t) => rank <= t && (prevRank === undefined || prevRank > t) && boardSize > t);
}

export interface SpikeInput {
  // Closed days before today, oldest first.
  dailyNewUsers: number[];
  last24h: number;
  lastSpikeAt?: number;
  now: number;
}

// 24h signups vs the 30-day daily baseline. Needs history, an absolute floor and a per-SaaS cooldown.
export function evaluateSpike(i: SpikeInput) {
  const history = i.dailyNewUsers.slice(-30).filter((n) => Number.isFinite(n) && n >= 0);
  if (history.length < SPIKE.minHistoryDays) return null;
  if (i.lastSpikeAt !== undefined && i.now - i.lastSpikeAt < SPIKE.cooldownMs) return null;
  const avg = history.reduce((a, b) => a + b, 0) / history.length;
  if (avg < 1 || i.last24h < SPIKE.minAbsolute) return null;
  const multiple = i.last24h / avg;
  if (multiple < SPIKE.multiple) return null;
  return { multiple: Math.round(multiple * 10) / 10, average: Math.round(avg * 10) / 10, days: history.length };
}

export interface HealthInput {
  consecutiveFailures: number;
  lastSuccessAt?: number;
  connectedAt: number;
  now: number;
}

// Unhealthy after two full failed sync cycles, or ≥3 failures with nothing successful for 24h.
export function isUnhealthy(i: HealthInput) {
  if (i.consecutiveFailures >= SOURCE_UNHEALTHY.consecutiveFailures) return true;
  const silence = i.now - (i.lastSuccessAt ?? i.connectedAt);
  return i.consecutiveFailures >= SOURCE_UNHEALTHY.minFailures && silence > SOURCE_UNHEALTHY.maxSilenceMs;
}

export interface NoGrowthInput {
  totalUsers: number;
  newUsers7d: number;
  newUsers30d: number;
  sourceHealthy: boolean;
  isPublic: boolean;
  // Closed days, oldest first.
  daily: { day: string; newUsers: number }[];
}

// Zero signups for 7 days after a period that actually had traction. Returns the key of the quiet period.
export function evaluateNoGrowth(i: NoGrowthInput) {
  if (!i.isPublic || !i.sourceHealthy) return null;
  if (i.newUsers7d !== 0 || i.totalUsers < NO_GROWTH.minTotalUsers || i.newUsers30d < NO_GROWTH.minNewUsers30d) return null;
  const closed = i.daily.slice(-NO_GROWTH.days);
  if (closed.length < NO_GROWTH.days || closed.some((d) => d.newUsers > 0)) return null;
  const lastGrowth = [...i.daily].reverse().find((d) => d.newUsers > 0);
  return { periodStart: lastGrowth?.day ?? i.daily[0]?.day ?? "unknown" };
}

// ---- Monthly report -------------------------------------------------------

export interface DailyRow {
  day: string;
  totalUsers: number;
  newUsers: number;
  activatedUsers?: number;
  newActivated?: number;
  rank?: number;
}

export interface ProjectReport {
  saasId: string;
  name: string;
  slug: string;
  isPublic: boolean;
  usersStart: number;
  usersEnd: number;
  newUsers: number;
  netGrowth: number;
  growthPct: number | null;
  activatedStart?: number;
  activatedEnd?: number;
  newActivated?: number;
  activationRatePct?: number;
  rankStart?: number;
  rankEnd?: number;
  bestDay?: { day: string; newUsers: number };
  milestones: { title: string; achievedAt: number }[];
  hasData: boolean;
}

export interface MonthlyPayload {
  period: string;
  label: string;
  projects: ProjectReport[];
  summary: { totalNewUsers: number; totalUsersEnd: number; strongest?: string; biggestMilestone?: string; aggregateGrowthPct: number | null };
  generatedAt: number;
}

// "2026-08" for the month that ended before `now` (UTC).
export function previousMonthKey(now: number) {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const prev = new Date(Date.UTC(y, m - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const end = Date.UTC(y, m, 1);
  return { start, end, firstDay: `${period}-01`, lastDayExclusive: new Date(end).toISOString().slice(0, 10) };
}

export function monthLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function projectReport(
  saas: { _id: string; name: string; slug: string; isPublic: boolean; totalUsers: number; activatedUsers?: number },
  rowsBefore: DailyRow | null,
  rowsInMonth: DailyRow[],
  milestones: { title: string; achievedAt: number }[],
): ProjectReport {
  const rows = [...rowsInMonth].sort((a, b) => a.day.localeCompare(b.day));
  const hasData = rows.length > 0;
  const startRow = rowsBefore ?? rows[0] ?? null;
  const endRow = rows[rows.length - 1] ?? rowsBefore ?? null;
  const usersStart = startRow?.totalUsers ?? 0;
  const usersEnd = endRow?.totalUsers ?? usersStart;
  const newUsers = rows.reduce((a, r) => a + Math.max(0, r.newUsers), 0);
  const netGrowth = usersEnd - usersStart;
  const growthPct = usersStart > 0 ? Math.round((netGrowth / usersStart) * 1000) / 10 : null;
  const withAct = rows.filter((r) => r.activatedUsers !== undefined);
  const activatedStart = rowsBefore?.activatedUsers ?? withAct[0]?.activatedUsers;
  const activatedEnd = withAct[withAct.length - 1]?.activatedUsers;
  const newActivated = activatedEnd !== undefined && activatedStart !== undefined ? Math.max(0, activatedEnd - activatedStart) : undefined;
  const activationRatePct = activatedEnd !== undefined && usersEnd > 0 ? Math.round((activatedEnd / usersEnd) * 1000) / 10 : undefined;
  const withRank = rows.filter((r) => r.rank !== undefined);
  const best = rows.reduce<DailyRow | null>((a, r) => (r.newUsers > (a?.newUsers ?? 0) ? r : a), null);
  return {
    saasId: saas._id,
    name: saas.name,
    slug: saas.slug,
    isPublic: saas.isPublic,
    usersStart,
    usersEnd,
    newUsers,
    netGrowth,
    growthPct,
    activatedStart,
    activatedEnd,
    newActivated,
    activationRatePct,
    rankStart: rowsBefore?.rank ?? withRank[0]?.rank,
    rankEnd: withRank[withRank.length - 1]?.rank,
    bestDay: best && best.newUsers > 0 ? { day: best.day, newUsers: best.newUsers } : undefined,
    milestones: milestones.slice(0, 5),
    hasData,
  };
}

export function monthlySummary(period: string, projects: ProjectReport[], now: number): MonthlyPayload {
  const withData = projects.filter((p) => p.hasData);
  const totalNewUsers = withData.reduce((a, p) => a + p.newUsers, 0);
  const totalUsersEnd = withData.reduce((a, p) => a + p.usersEnd, 0);
  const totalUsersStart = withData.reduce((a, p) => a + p.usersStart, 0);
  const strongest = [...withData].sort((a, b) => b.newUsers - a.newUsers || (b.growthPct ?? -1) - (a.growthPct ?? -1))[0];
  const biggestMilestone = withData.flatMap((p) => p.milestones.map((m) => ({ ...m, name: p.name }))).sort((a, b) => b.achievedAt - a.achievedAt)[0];
  return {
    period,
    label: monthLabel(period),
    projects,
    summary: {
      totalNewUsers,
      totalUsersEnd,
      strongest: strongest && strongest.newUsers > 0 ? strongest.name : undefined,
      biggestMilestone: biggestMilestone ? `${biggestMilestone.name}: ${biggestMilestone.title}` : undefined,
      aggregateGrowthPct: totalUsersStart > 0 && withData.length > 1 ? Math.round(((totalUsersEnd - totalUsersStart) / totalUsersStart) * 1000) / 10 : null,
    },
    generatedAt: now,
  };
}

// ---- Delivery time --------------------------------------------------------

export const SEND_HOUR_LOCAL = 9;

function tzOffsetMs(tz: string, at: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

// Next occurrence of `hour` o'clock local time on or after `notBefore`. Unknown / invalid tz → UTC.
export function nextLocalHour(notBefore: number, tz: string | undefined, hour = SEND_HOUR_LOCAL) {
  let offset = 0;
  if (tz) {
    try { offset = tzOffsetMs(tz, notBefore); } catch { offset = 0; }
  }
  const local = notBefore + offset;
  const d = new Date(local);
  let candidate = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour) - offset;
  if (candidate < notBefore) candidate += DAY;
  return candidate;
}

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
