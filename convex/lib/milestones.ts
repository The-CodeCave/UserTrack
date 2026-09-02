export const USER_THRESHOLDS = [10, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

export interface Milestone {
  key: string;
  kind: "users" | "activated" | "best_day" | "best_week" | "rank" | "top10" | "top100" | "streak" | "monthly_growth" | "trending_top10";
  metric: string;
  value: number;
  title: string;
  copy: string;
}

const fmt = (n: number) => new Intl.NumberFormat("en").format(n);

// Threshold milestones crossed between two totals. `prev === null` treats the first snapshot as crossing everything below it.
export function thresholdMilestones(prev: number | null, next: number, name: string, kind: "users" | "activated" = "users"): Milestone[] {
  const noun = kind === "users" ? "users" : "activated users";
  return USER_THRESHOLDS.filter((t) => next >= t && (prev === null || prev < t)).map((t) => ({
    key: `${kind}:${t}`,
    kind,
    metric: kind === "users" ? "totalUsers" : "activatedUsers",
    value: t,
    title: `${fmt(t)} ${noun}`,
    copy: `${name} just crossed ${fmt(t)} ${noun} on UserTrack.`,
  }));
}

export function rankMilestones(prevRank: number | undefined, rank: number | undefined, name: string, bestRank: number | undefined): Milestone[] {
  if (!rank) return [];
  const out: Milestone[] = [];
  if (rank <= 10 && (prevRank === undefined || prevRank > 10)) out.push({ key: "top10", kind: "top10", metric: "rank", value: rank, title: "Top 10 on UserTrack", copy: `${name} entered the UserTrack top 10 (#${rank}).` });
  if (rank <= 100 && (prevRank === undefined || prevRank > 100)) out.push({ key: "top100", kind: "top100", metric: "rank", value: rank, title: "Top 100 on UserTrack", copy: `${name} entered the UserTrack top 100 (#${rank}).` });
  if (rank <= 3 && (bestRank === undefined || rank < bestRank)) out.push({ key: `rank:${rank}`, kind: "rank", metric: "rank", value: rank, title: `#${rank} on UserTrack`, copy: `${name} reached #${rank} on the UserTrack leaderboard.` });
  return out;
}

export function trendingMilestones(prevRank: number | undefined, rank: number | undefined, name: string): Milestone[] {
  if (!rank || rank > 10 || (prevRank !== undefined && prevRank <= 10)) return [];
  return [{ key: "trending_top10", kind: "trending_top10", metric: "trendingRank", value: rank, title: "Top 10 trending", copy: `${name} is #${rank} trending on UserTrack right now.` }];
}

export interface DailyRow { day: string; newUsers: number }

// Best day / best week / streak / monthly growth. Runs daily over the SaaS's dailyMetrics (oldest first).
export function dailyMilestones(rows: DailyRow[], name: string, growth30dPct: number, existingKeys: Set<string>): Milestone[] {
  const out: Milestone[] = [];
  if (rows.length < 3) return out;
  const closed = rows.slice(0, -1);
  const best = closed.reduce((a, r) => (r.newUsers > a.newUsers ? r : a), closed[0]);
  if (best.newUsers >= 25 && !existingKeys.has(`best_day:${best.day}`) && ![...existingKeys].some((k) => k.startsWith("best_day:") && k > `best_day:${best.day}`)) {
    const prevBest = Math.max(0, ...[...existingKeys].filter((k) => k.startsWith("best_day:")).map((k) => Number(k.split("|")[1] ?? 0)));
    if (best.newUsers > prevBest) out.push({ key: `best_day:${best.day}|${best.newUsers}`, kind: "best_day", metric: "newUsers", value: best.newUsers, title: "Biggest day ever", copy: `${name} gained ${fmt(best.newUsers)} users in a single day — a new record.` });
  }
  if (closed.length >= 14) {
    let bestWeek = { end: "", sum: 0 };
    for (let i = 6; i < closed.length; i++) {
      const sum = closed.slice(i - 6, i + 1).reduce((a, r) => a + r.newUsers, 0);
      if (sum > bestWeek.sum) bestWeek = { end: closed[i].day, sum };
    }
    const prevBest = Math.max(0, ...[...existingKeys].filter((k) => k.startsWith("best_week:")).map((k) => Number(k.split("|")[1] ?? 0)));
    if (bestWeek.sum >= 100 && bestWeek.sum > prevBest) out.push({ key: `best_week:${bestWeek.end}|${bestWeek.sum}`, kind: "best_week", metric: "newUsers", value: bestWeek.sum, title: "Biggest week ever", copy: `${name} gained ${fmt(bestWeek.sum)} users in one week — a new record.` });
  }
  let streak = 0;
  for (let i = closed.length - 1; i >= 0 && closed[i].newUsers > 0; i--) streak++;
  for (const len of [7, 30, 90]) {
    if (streak >= len && !existingKeys.has(`streak:${len}`)) out.push({ key: `streak:${len}`, kind: "streak", metric: "streakDays", value: len, title: `${len}-day growth streak`, copy: `${name} has gained users every single day for ${len} days.` });
  }
  for (const g of [25, 50, 100]) {
    if (growth30dPct >= g && !existingKeys.has(`monthly_growth:${g}`) && rows.length >= 30) out.push({ key: `monthly_growth:${g}`, kind: "monthly_growth", metric: "growth30dPct", value: g, title: `+${g}% in 30 days`, copy: `${name} grew its user base by ${Math.round(growth30dPct)}% in the last 30 days.` });
  }
  return out;
}

export function streakDays(rows: DailyRow[]) {
  let streak = 0;
  for (let i = rows.length - 2; i >= 0 && rows[i].newUsers > 0; i--) streak++;
  return streak;
}
