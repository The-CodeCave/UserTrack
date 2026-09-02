// Retention estimate from "active in the last 30 days" counts. Providers rarely expose true cohorts, so:
//   cohort   = users that existed 30 days ago
//   retained ≈ active30d − newUsers30d   (new users are active by definition)
//   churned  = cohort − retained
export function estimateRetention(i: { totalUsers: number; newUsers30d: number; activeUsers30d: number }) {
  const cohort = i.totalUsers - Math.max(0, i.newUsers30d);
  if (cohort < 20 || i.activeUsers30d < 0) return null;
  const retained = Math.max(0, Math.min(cohort, i.activeUsers30d - Math.max(0, i.newUsers30d)));
  const churned = cohort - retained;
  return { cohort, retained, churned, ratePct: Math.round((retained / cohort) * 1000) / 10 };
}
