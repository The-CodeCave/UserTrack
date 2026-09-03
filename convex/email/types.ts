export type EmailCategory = "transactional" | "product" | "growth";

export type EmailType =
  | "welcome"
  | "verify-email"
  | "reset-password"
  | "profile-reminder"
  | "missing-source"
  | "source-connected"
  | "source-failed"
  | "source-recovered"
  | "user-milestone"
  | "rank-milestone"
  | "growth-spike"
  | "no-growth"
  | "monthly-report"
  | "weekly-digest"
  | "followed-update";

export interface EmailPreferences {
  productNudges: boolean;
  growthMilestones: boolean;
  rankingMilestones: boolean;
  growthAlerts: boolean;
  monthlyReport: boolean;
  weeklyDigest: boolean;
  followedSaasUpdates: boolean;
  // Sub-preferences of followedSaasUpdates (which kinds of followed-product updates are mailed).
  followedMilestones: boolean;
  followedRanking: boolean;
  followedSpikes: boolean;
}

export type PreferenceKey = keyof EmailPreferences;

export const DEFAULT_PREFERENCES: EmailPreferences = {
  productNudges: true,
  growthMilestones: true,
  rankingMilestones: true,
  growthAlerts: true,
  monthlyReport: true,
  weeklyDigest: false,
  followedSaasUpdates: false,
  followedMilestones: true,
  followedRanking: true,
  followedSpikes: true,
};

export const PREFERENCE_KEYS = Object.keys(DEFAULT_PREFERENCES) as PreferenceKey[];

// null = transactional: always sent, never behind a preference.
export const EMAIL_META: Record<EmailType, { category: EmailCategory; pref: PreferenceKey | null }> = {
  welcome: { category: "transactional", pref: null },
  "verify-email": { category: "transactional", pref: null },
  "reset-password": { category: "transactional", pref: null },
  "source-failed": { category: "transactional", pref: null },
  "source-recovered": { category: "transactional", pref: null },
  "profile-reminder": { category: "product", pref: "productNudges" },
  "missing-source": { category: "product", pref: "productNudges" },
  "source-connected": { category: "product", pref: "productNudges" },
  "user-milestone": { category: "growth", pref: "growthMilestones" },
  "rank-milestone": { category: "growth", pref: "rankingMilestones" },
  "growth-spike": { category: "growth", pref: "growthAlerts" },
  "no-growth": { category: "growth", pref: "growthAlerts" },
  "monthly-report": { category: "growth", pref: "monthlyReport" },
  "weekly-digest": { category: "growth", pref: "weeklyDigest" },
  "followed-update": { category: "growth", pref: "followedSaasUpdates" },
};

export const EMAIL_TYPES = Object.keys(EMAIL_META) as EmailType[];

export function isTransactional(type: EmailType) {
  return EMAIL_META[type].pref === null;
}

export function allowedByPreferences(type: EmailType, prefs: EmailPreferences) {
  const key = EMAIL_META[type].pref;
  return key === null ? true : prefs[key];
}

// Security mail is attempted even for suppressed recipients; everything else stops at a hard bounce or complaint.
export function allowedByRecipientStatus(type: EmailType, status: "active" | "bounced" | "complained" | "suppressed" | undefined) {
  if (!status || status === "active") return true;
  return type === "reset-password" || type === "verify-email";
}

// Which sub-preference gates a followed-product update of a given kind.
export const FOLLOWED_KIND_PREF: Record<"milestone" | "rank" | "spike", PreferenceKey> = { milestone: "followedMilestones", rank: "followedRanking", spike: "followedSpikes" };
