/**
 * Trust score (0–100) and anomaly heuristics. Statistical, explainable, no ML.
 *
 *   provider    ≤ 40   auth providers 40 · analytics/endpoint-on-own-domain 30 · foreign endpoint 10 · manual 5
 *   age         ≤ 25   linear over 30 days of continuous connection
 *   continuity  ≤ 20   share of successful sync runs in the recent window
 *   activation  ≤ 5    activation data present and ≤ 100% of users
 *   penalties          −15 per open high flag, −8 medium, −3 low
 */
export type TrustState = "healthy" | "anomaly" | "review" | "low_confidence";
export type FlagKind = "impossible_growth" | "sudden_drop" | "reconnect_churn" | "source_switching" | "activation_exceeds_users" | "stale_source";
export type Severity = "low" | "medium" | "high";
export interface Flag { kind: FlagKind; severity: Severity; detail: string }

const PROVIDER_BASE: Record<string, number> = {
  clerk: 40, supabase: 40, firebase: 40, auth0: 40,
  posthog: 30, plausible: 30, ga4: 30, stripe: 30,
  endpoint: 30, manual: 5,
};

export interface TrustInput {
  provider: string;
  trust: "verified" | "unverified" | "pending";
  connectedAt?: number;
  now: number;
  recentRuns: { status: "ok" | "error" | "running" }[];
  activationRatePct?: number;
  openFlags: { severity: Severity }[];
}

export function trustScore(i: TrustInput) {
  let base = PROVIDER_BASE[i.provider] ?? 10;
  if (i.provider === "endpoint" && i.trust !== "verified") base = 10;
  const ageDays = i.connectedAt === undefined ? 0 : (i.now - i.connectedAt) / 86_400_000;
  const age = 25 * Math.min(1, Math.max(0, ageDays) / 30);
  const finished = i.recentRuns.filter((r) => r.status !== "running");
  const continuity = finished.length === 0 ? 0 : 20 * (finished.filter((r) => r.status === "ok").length / finished.length);
  const activation = i.activationRatePct !== undefined && i.activationRatePct <= 100 ? 5 : 0;
  const penalty = i.openFlags.reduce((a, f) => a + (f.severity === "high" ? 15 : f.severity === "medium" ? 8 : 3), 0);
  return Math.round(Math.max(0, Math.min(100, base + age + continuity + activation - penalty)));
}

export function trustState(score: number, openFlags: { severity: Severity }[]): TrustState {
  if (openFlags.some((f) => f.severity === "high")) return "review";
  if (openFlags.length > 0) return "anomaly";
  return score < 35 ? "low_confidence" : "healthy";
}

// Public wording. Never mentions fraud.
export function publicTrustLabel(trust: "verified" | "unverified" | "pending", state: TrustState | undefined, score: number | undefined) {
  if (trust === "pending") return "Pending";
  if (state === "review") return "Data under review";
  if (trust === "unverified") return "Self-reported";
  if ((score ?? 100) < 60 || state === "low_confidence") return "Partially verified";
  return "Verified";
}

export interface SnapshotCheck {
  prevTotal: number | null;
  newTotal: number;
  elapsedMs: number;
  prevProvider?: string;
  provider: string;
  reconnectsLast7d: number;
  activatedUsers?: number;
}

// Heuristic checks on one new snapshot. Returns flags to open (deduplicated by the caller).
export function checkSnapshot(c: SnapshotCheck): Flag[] {
  const flags: Flag[] = [];
  if (c.prevTotal !== null && c.prevTotal >= 0) {
    const delta = c.newTotal - c.prevTotal;
    const hours = Math.max(1, c.elapsedMs / 3_600_000);
    const perHour = delta / hours;
    // > 5× the prior base within a day and at least 500 users is not organic for an established product.
    if (c.prevTotal >= 100 && delta >= 500 && delta > 5 * c.prevTotal && hours <= 24) {
      flags.push({ kind: "impossible_growth", severity: "high", detail: `+${delta} users in ${hours.toFixed(0)}h on a base of ${c.prevTotal}` });
    } else if (c.prevTotal >= 1000 && perHour > Math.max(200, c.prevTotal * 0.25)) {
      flags.push({ kind: "impossible_growth", severity: "medium", detail: `${Math.round(perHour)} users/hour on a base of ${c.prevTotal}` });
    }
    if (c.prevTotal >= 50 && delta < 0 && -delta / c.prevTotal >= 0.2) {
      flags.push({ kind: "sudden_drop", severity: -delta / c.prevTotal >= 0.5 ? "high" : "medium", detail: `${delta} users (${Math.round((-delta / c.prevTotal) * 100)}% drop)` });
    }
  }
  if (c.reconnectsLast7d >= 3) flags.push({ kind: "reconnect_churn", severity: "medium", detail: `${c.reconnectsLast7d} source reconnects in 7 days` });
  if (c.prevProvider && c.prevProvider !== c.provider) flags.push({ kind: "source_switching", severity: "low", detail: `${c.prevProvider} → ${c.provider}` });
  if (c.activatedUsers !== undefined && c.newTotal > 0 && c.activatedUsers > c.newTotal * 1.05) {
    flags.push({ kind: "activation_exceeds_users", severity: "medium", detail: `${c.activatedUsers} activated vs ${c.newTotal} users` });
  }
  return flags;
}
