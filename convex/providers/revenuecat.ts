import { asCount, fetchJson, str, type Provider, type ProviderMetrics, ProviderError, CONVERSION_MODE_LABEL } from "./types";
import { parseMode } from "./conversion";

export interface RevenueCatConfig { apiKey: string; projectId: string; mode: "active_paid" }

interface OverviewMetric { id: string; value?: number | null }

// RevenueCat is a conversion source for mobile / subscription apps, read through the v2 REST API with a secret key that
// only has `charts_metrics:overview:read`. Semantics (see docs/PROVIDERS.md):
//   trial      = "Active Trials"        (users currently in a free trial)
//   converted  = "Active Subscriptions"  (users with an active paid subscription; RevenueCat excludes trials here)
// A RevenueCat *customer* is never a UserTrack registered user: RevenueCat contains anonymous app-user ids
// ($RCAnonymousID:…) and every install, so it only owns the trial / converted stages. Registered users come from the
// identity source (Firebase Auth, Supabase, Auth0, a database…). `mrr`, `revenue`, `new_customers` and `active_users`
// are present in the same response and are deliberately ignored — never persisted, never displayed.
export const revenuecat: Provider<RevenueCatConfig> = {
  kind: "revenuecat",
  label: "RevenueCat",
  roles: ["conversion"],
  capabilities: ["trial", "converted"],
  validate(c) {
    const apiKey = str(c, "apiKey");
    const projectId = str(c, "projectId");
    if (!apiKey || !/^sk_/.test(apiKey)) return { ok: false, error: "Enter a RevenueCat v2 secret API key (sk_…) with read-only Charts & Metrics permission" };
    if (!projectId || !/^[A-Za-z0-9_-]{3,64}$/.test(projectId)) return { ok: false, error: "Enter the RevenueCat project ID (Project settings → General)" };
    const mode = parseMode(c);
    if (!mode) return { ok: false, error: "Invalid conversion mode" };
    if (mode !== "active_paid") return { ok: false, error: "RevenueCat only supports the “Active paid” conversion definition (active subscriptions). Use a JSON endpoint for other definitions." };
    return { ok: true, config: { apiKey, projectId, mode } };
  },
  trust: () => "verified",
  async fetch({ apiKey, projectId }): Promise<ProviderMetrics> {
    const json = await fetchJson<{ metrics?: OverviewMetric[] }>(`https://api.revenuecat.com/v2/projects/${projectId}/metrics/overview`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    const metric = (id: string) => json.metrics?.find((m) => m.id === id);
    const subs = metric("active_subscriptions");
    const trials = metric("active_trials");
    if (!subs) throw new ProviderError("RevenueCat overview did not include active_subscriptions — check the key's Charts & Metrics permission", false);
    return {
      convertedUsers: asCount(subs.value ?? 0, "RevenueCat active subscriptions"),
      trialUsers: trials ? asCount(trials.value ?? 0, "RevenueCat active trials") : undefined,
      conversionMode: "active_paid",
    };
  },
  publicConfig: ({ projectId, mode }) => ({ project: projectId, conversion: CONVERSION_MODE_LABEL[mode] }),
};
