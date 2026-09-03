// Maps onboarding stack answers to UserTrack providers. Pure; answers other than authMethods are never persisted.
import type { ProviderKind } from "@/lib/providers-ui";

export type Platform = "web" | "mobile" | "hybrid";
export type StackKey = "identity" | "analytics" | "monetization";
export interface StackChoices { identity?: string; analytics?: string; monetization?: string; authMethods?: string[] }
export type StackAnswers = StackChoices & { platform: Platform };
export type NativeSource = "better-auth" | "prisma" | "drizzle" | "convex" | "authjs" | "custom";
export interface StackRecommendation { users: ProviderKind | null; nativeSource?: NativeSource; activation?: ProviderKind; traffic?: ProviderKind; conversion?: ProviderKind; notes: string[] }
export interface Option { value: string; label: string }
export interface StackQuestion { key: StackKey; title: string; options: Option[] }

const IDENTITY: Record<string, string> = { clerk: "Clerk", supabase: "Supabase", firebase: "Firebase", better_auth: "Better Auth", authjs: "Auth.js / NextAuth", convex: "Convex", auth0: "Auth0", postgres: "PostgreSQL", custom: "Custom Backend", other: "Other" };
const ANALYTICS: Record<string, string> = { posthog: "PostHog", plausible: "Plausible", ga4: "GA4", firebase_analytics: "Firebase Analytics", amplitude: "Amplitude", mixpanel: "Mixpanel", other: "Other", none: "None" };
const MONETIZATION: Record<string, string> = { revenuecat: "RevenueCat", storekit: "StoreKit directly", play_billing: "Google Play Billing", stripe: "Stripe", paddle: "Paddle", lemonsqueezy: "Lemon Squeezy", chargebee: "Chargebee", none: "Not monetized", other: "Other" };

export const AUTH_METHOD_OPTIONS: Option[] = [{ value: "apple", label: "Sign in with Apple" }, { value: "google", label: "Google" }, { value: "email", label: "Email" }, { value: "other", label: "Other" }];

const pick = (labels: Record<string, string>, values: string[]): Option[] => values.map((value) => ({ value, label: labels[value] }));

export function stackQuestions(platform: Platform): StackQuestion[] {
  const mobile = platform === "mobile";
  const identity: StackQuestion = { key: "identity", title: "How do users sign in?", options: pick(IDENTITY, mobile ? ["firebase", "supabase", "auth0", "custom", "other"] : ["clerk", "supabase", "firebase", "better_auth", "authjs", "convex", "auth0", "postgres", "custom", "other"]) };
  const analytics: StackQuestion = { key: "analytics", title: "How do you track product usage?", options: pick(ANALYTICS, mobile ? ["posthog", "firebase_analytics", "amplitude", "mixpanel", "other", "none"] : ["posthog", "plausible", "ga4", "amplitude", "mixpanel", "none"]) };
  const monetization: StackQuestion = { key: "monetization", title: "How do you monetize?", options: pick(MONETIZATION, mobile ? ["revenuecat", "storekit", "play_billing", "stripe", "paddle", "none", "other"] : platform === "hybrid" ? ["revenuecat", "stripe", "paddle", "lemonsqueezy", "chargebee", "none"] : ["stripe", "paddle", "lemonsqueezy", "chargebee", "none"]) };
  return mobile ? [identity, monetization, analytics] : [identity, analytics, monetization];
}

const IDENTITY_PROVIDER: Record<string, ProviderKind> = { clerk: "clerk", supabase: "supabase", firebase: "firebase", auth0: "auth0", postgres: "postgres", better_auth: "native", authjs: "native", convex: "native", custom: "native", other: "endpoint" };
const NATIVE_SOURCE: Record<string, NativeSource> = { better_auth: "better-auth", authjs: "authjs", convex: "convex", custom: "custom" };
const CONVERSION_PROVIDER: Record<string, ProviderKind> = { revenuecat: "revenuecat", stripe: "stripe", paddle: "paddle", lemonsqueezy: "lemonsqueezy", chargebee: "chargebee", storekit: "endpoint", play_billing: "endpoint", other: "endpoint" };

export function recommendStack(a: StackAnswers): StackRecommendation {
  const notes: string[] = [];
  const rec: StackRecommendation = { users: (a.identity && IDENTITY_PROVIDER[a.identity]) || null, notes };
  if (a.identity && NATIVE_SOURCE[a.identity]) rec.nativeSource = NATIVE_SOURCE[a.identity];
  if (a.identity === "custom" && a.platform !== "mobile") notes.push("Custom backend: install @usertrack/node and mount one signed count handler — verified, no database credentials shared.");
  switch (a.analytics) {
    case "posthog":
      rec.activation = "posthog";
      if (a.platform !== "mobile") rec.traffic = "posthog";
      break;
    case "plausible":
      rec.traffic = "plausible";
      break;
    case "ga4":
      rec.traffic = "ga4";
      break;
    case "firebase_analytics":
      rec.traffic = "ga4";
      notes.push("Firebase Analytics data is read through its linked GA4 property.");
      break;
    case "amplitude":
    case "mixpanel":
      rec.activation = "endpoint";
      notes.push(`${ANALYTICS[a.analytics]} is not yet a native provider — expose an activation count via the JSON endpoint.`);
      break;
  }
  const conversion = a.monetization ? CONVERSION_PROVIDER[a.monetization] : undefined;
  if (conversion) rec.conversion = conversion;
  if (a.monetization === "none") notes.push("Free product: funnel ends at Activated.");
  if (a.monetization === "storekit" || a.monetization === "play_billing") notes.push("Read StoreKit/Play Billing state from your backend and expose convertedUsers/trialUsers via the JSON endpoint; or route purchases through RevenueCat.");
  if (a.authMethods?.includes("apple")) {
    const source = a.identity && a.identity !== "custom" && IDENTITY_PROVIDER[a.identity] !== "endpoint" ? IDENTITY[a.identity] : "your own backend";
    notes.push(`Sign in with Apple is an authentication method — your registered user count comes from ${source}.`);
  }
  return rec;
}
