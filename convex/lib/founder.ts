// Founder-level aggregation across public projects. Pure and unit-tested; formulas are documented in docs/PROFILES.md.
export interface FounderProject {
  totalUsers: number;
  newUsers7d: number;
  newUsers30d: number;
  newUsersPrev30d?: number;
  activatedUsers?: number;
  convertedUsers?: number;
  rank?: number;
  trendingRank?: number;
  trust: "verified" | "unverified" | "pending";
  name: string;
  slug: string;
}

export function founderAggregates(projects: FounderProject[]) {
  const totalUsers = projects.reduce((a, p) => a + p.totalUsers, 0);
  const newUsers30d = projects.reduce((a, p) => a + Math.max(0, p.newUsers30d), 0);
  const newUsers7d = projects.reduce((a, p) => a + Math.max(0, p.newUsers7d), 0);
  const withPrev = projects.filter((p) => p.newUsersPrev30d !== undefined);
  const prev30 = withPrev.reduce((a, p) => a + Math.max(0, p.newUsersPrev30d!), 0);
  // Activation is weighted: sum(activated) / sum(users of projects that track activation) — never an average of rates.
  const withAct = projects.filter((p) => p.activatedUsers !== undefined);
  const activatedUsers = withAct.reduce((a, p) => a + p.activatedUsers!, 0);
  const activationBase = withAct.reduce((a, p) => a + p.totalUsers, 0);
  // Converted counts only reach this function when the owner published them (visibility is applied upstream).
  const withConv = projects.filter((p) => p.convertedUsers !== undefined);
  const convertedUsers = withConv.length ? withConv.reduce((a, p) => a + p.convertedUsers!, 0) : undefined;
  const ranked = projects.filter((p) => p.rank !== undefined);
  const biggestGrowth = [...projects].sort((a, b) => b.newUsers30d - a.newUsers30d)[0];
  return {
    projectCount: projects.length,
    verifiedCount: projects.filter((p) => p.trust === "verified").length,
    totalUsers,
    newUsers7d,
    newUsers30d,
    // Growth of the combined user base over 30 days: new users ÷ users at the start of the window.
    growth30dPct: totalUsers - newUsers30d > 0 ? Math.round((newUsers30d / (totalUsers - newUsers30d)) * 1000) / 10 : 0,
    changeVsPrev30dPct: withPrev.length === projects.length && prev30 > 0 ? Math.round(((newUsers30d - prev30) / prev30) * 1000) / 10 : undefined,
    activatedUsers: withAct.length ? activatedUsers : undefined,
    activationRatePct: activationBase > 0 ? Math.round((activatedUsers / activationBase) * 1000) / 10 : undefined,
    activationProjects: withAct.length,
    convertedUsers,
    bestRank: ranked.length ? Math.min(...ranked.map((p) => p.rank!)) : undefined,
    trendingCount: projects.filter((p) => p.trendingRank !== undefined).length,
    biggestGrowth: biggestGrowth && biggestGrowth.newUsers30d > 0 ? { slug: biggestGrowth.slug, name: biggestGrowth.name, newUsers30d: biggestGrowth.newUsers30d } : undefined,
  };
}

export interface DailyRow { day: string; totalUsers: number; newUsers: number }

// Sum of total users across projects per day. Each project is forward-filled from its own last known day, so a project
// that has no row for a day (sync gap) keeps its last value instead of dropping the aggregate to a false dip;
// before a project's first row it contributes 0. New users are summed only where a row exists.
export function aggregateHistory(perProject: DailyRow[][]): { day: string; total: number; delta: number; byProject: number[] }[] {
  const days = [...new Set(perProject.flat().map((r) => r.day))].sort();
  const maps = perProject.map((rows) => new Map(rows.map((r) => [r.day, r])));
  const last = perProject.map(() => 0);
  return days.map((day) => {
    let total = 0;
    let delta = 0;
    const byProject = maps.map((m, i) => {
      const r = m.get(day);
      if (r) {
        last[i] = r.totalUsers;
        delta += Math.max(0, r.newUsers);
      }
      total += last[i];
      return last[i];
    });
    return { day, total, delta, byProject };
  });
}
