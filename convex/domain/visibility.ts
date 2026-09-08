// Per-metric public visibility. Rule: connection ≠ publication. A founder can connect Stripe or RevenueCat for private
// analytics while every conversion metric stays off the public page, the API and share cards.
import type { Doc } from "../_generated/dataModel";

export interface Visibility {
  totalUsers: boolean;
  growth: boolean;
  activationRate: boolean;
  conversionRate: boolean;
  trialConversion: boolean;
  convertedCount: boolean;
  traffic: boolean;
  benchmarks: boolean;
}

export const VISIBILITY_KEYS = ["totalUsers", "growth", "activationRate", "conversionRate", "trialConversion", "convertedCount", "traffic", "benchmarks"] as const;
export type VisibilityKey = (typeof VISIBILITY_KEYS)[number];

// Growth metrics are the product; conversion is private until the founder switches it on.
export const DEFAULT_VISIBILITY: Visibility = { totalUsers: true, growth: true, activationRate: true, conversionRate: false, trialConversion: false, convertedCount: false, traffic: false, benchmarks: true };

export const VISIBILITY_META: Record<VisibilityKey, { label: string; blurb: string; group: "growth" | "engagement" | "conversion" }> = {
  totalUsers: { label: "Total users", blurb: "The verified user count. Required for leaderboards.", group: "growth" },
  growth: { label: "User growth", blurb: "New users per window and growth %.", group: "growth" },
  activationRate: { label: "Activation rate", blurb: "Activated ÷ users, plus activated counts.", group: "engagement" },
  conversionRate: { label: "Conversion rate", blurb: "Signup → Converted and Activated → Converted percentages. Counts stay hidden unless enabled below.", group: "conversion" },
  trialConversion: { label: "Trial conversion", blurb: "Trial stage in the funnel and Trial → Converted rate.", group: "conversion" },
  convertedCount: { label: "Converted user count", blurb: "The absolute number of converted users.", group: "conversion" },
  traffic: { label: "Visitors", blurb: "Reached stage (visitors / sessions) in the funnel.", group: "growth" },
  benchmarks: { label: "Benchmark statement", blurb: "The public \"Top X% in <cohort>\" line and its history. Only top-quarter positions are ever shown.", group: "growth" },
};

type Legacy = Pick<Doc<"saas">, "visibility" | "showTraffic" | "showRevenue">;

// Explicit settings win; legacy v0.4 toggles map onto the new keys so nothing that was public silently disappears.
export function visibilityOf(s: Legacy): Visibility {
  const v = s.visibility ?? {};
  return {
    totalUsers: v.totalUsers ?? DEFAULT_VISIBILITY.totalUsers,
    growth: v.growth ?? DEFAULT_VISIBILITY.growth,
    activationRate: v.activationRate ?? DEFAULT_VISIBILITY.activationRate,
    conversionRate: v.conversionRate ?? s.showRevenue ?? DEFAULT_VISIBILITY.conversionRate,
    trialConversion: v.trialConversion ?? DEFAULT_VISIBILITY.trialConversion,
    convertedCount: v.convertedCount ?? s.showRevenue ?? DEFAULT_VISIBILITY.convertedCount,
    traffic: v.traffic ?? s.showTraffic ?? DEFAULT_VISIBILITY.traffic,
    benchmarks: v.benchmarks ?? DEFAULT_VISIBILITY.benchmarks,
  };
}

// Fields on `saas` that only exist publicly when the matching visibility key is on.
const GATED: Record<Exclude<VisibilityKey, "totalUsers" | "growth" | "benchmarks">, (keyof Doc<"saas">)[]> = {
  activationRate: ["activatedUsers", "activated24h", "activated7d", "activated30d", "activationRatePct"],
  conversionRate: ["signupToConvertedPct", "activatedToConvertedPct", "convertedGrowth30dPct"],
  trialConversion: ["trialUsers", "newTrials7d", "newTrials30d", "trialToConvertedPct"],
  convertedCount: ["convertedUsers", "newConverted24h", "newConverted7d", "newConverted30d", "convertedPrev30d", "payingUsers"],
  traffic: ["visitors30d", "sessions30d", "visitorsPrev30d"],
};
// Derived from daily new-user counts, so the streak follows the growth switch.
const GROWTH_GATED: (keyof Doc<"saas">)[] = ["streakDays", "bestStreakDays"];
// Never public regardless of settings.
const ALWAYS_PRIVATE: (keyof Doc<"saas">)[] = ["ownerId", "mrr", "currency", "showRevenue", "logoStorageId"];
// Anonymous mode: everything that identifies the founder or the company leaves the row; the owner is nulled by the caller.
export const ANONYMOUS_HIDDEN: (keyof Doc<"saas">)[] = ["logoUrl", "websiteUrl", "appStoreUrl", "playStoreUrl", "cofounders", "trustmrrSlug"];

export const isAnonymous = (s: Pick<Doc<"saas">, "anonymous">) => s.anonymous === true;
// Logo for compact cards built outside publicSaas (feed, watchlists, frozen rankings).
export const publicLogo = (s: Pick<Doc<"saas">, "anonymous" | "logoUrl">) => (isAnonymous(s) ? undefined : s.logoUrl);

export function stripPrivate<T extends Partial<Doc<"saas">>>(s: T, vis: Visibility): T {
  const out = { ...s };
  for (const k of ALWAYS_PRIVATE) delete out[k];
  if (isAnonymous(out)) for (const k of ANONYMOUS_HIDDEN) delete out[k];
  if (!vis.growth) for (const k of GROWTH_GATED) delete out[k];
  for (const key of Object.keys(GATED) as (keyof typeof GATED)[]) {
    if (vis[key]) continue;
    for (const f of GATED[key]) delete out[f];
  }
  return out;
}

// A handle minted by profiles.ensure is a placeholder, not a founder identity: it stays out of every public read
// until the founder confirms it in the wizard (profiles.upsert). Unset = confirmed, so old rows need no migration.
export const isHandleConfirmed = (p: Pick<Doc<"profiles">, "handleConfirmed">) => p.handleConfirmed !== false;
// Publicly readable founder profile: the handle is confirmed and the founder has not hidden the profile.
export const isProfileVisible = (p: Pick<Doc<"profiles">, "handleConfirmed" | "profilePublic">) => isHandleConfirmed(p) && p.profilePublic !== false;
