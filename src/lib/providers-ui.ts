export type ProviderKind = "clerk" | "supabase" | "firebase" | "auth0" | "posthog" | "plausible" | "ga4" | "stripe" | "endpoint" | "manual";
export type Role = "users" | "activation" | "traffic" | "revenue";

export interface ProviderField {
  name: string;
  label: string;
  placeholder: string;
  type?: "text" | "password" | "number" | "url" | "textarea";
  optional?: boolean;
  roles?: Role[];
  hint?: string;
}

export interface ProviderMeta {
  kind: ProviderKind;
  label: string;
  tagline: string;
  trust: "verified" | "conditional" | "unverified";
  roles: Role[];
  fields: ProviderField[];
  reads: string;
  steps: string[];
  code?: { label: string; text: string };
}

export const ROLE_META: Record<Role, { label: string; title: string; blurb: string; optional: boolean }> = {
  users: { label: "Users", title: "User count source", blurb: "Where your total user count comes from. Required, read-only, synced every 4 hours.", optional: false },
  activation: { label: "Activation", title: "Activated users", blurb: "Signups are a weak signal. Tell UserTrack which event means a user really started using your product — e.g. onboarding_completed, project_created.", optional: true },
  traffic: { label: "Traffic", title: "Website traffic", blurb: "Visitors and sessions for the funnel. Only shown publicly if you switch it on.", optional: true },
  revenue: { label: "Revenue", title: "Revenue (Stripe)", blurb: "Paying customers and MRR from a restricted, read-only Stripe key. Never required, only shown publicly if you switch it on.", optional: true },
};

export const PROVIDERS: ProviderMeta[] = [
  {
    kind: "clerk",
    label: "Clerk",
    tagline: "User count, signups and active users via the Clerk Backend API",
    trust: "verified",
    roles: ["users"],
    fields: [{ name: "secretKey", label: "Secret key", placeholder: "sk_live_…", type: "password" }],
    reads: "GET /v1/users/count with created_at / last_active_at filters. Nothing else.",
    steps: ["Clerk Dashboard → Configure → API Keys", "Copy the Secret key (sk_live_…)", "Paste it here — it is stored server-side and never shown again"],
  },
  {
    kind: "supabase",
    label: "Supabase",
    tagline: "Counts auth.users, or any table, via the service role key",
    trust: "verified",
    roles: ["users", "activation"],
    fields: [
      { name: "url", label: "Project URL", placeholder: "https://xxxx.supabase.co", type: "url" },
      { name: "serviceKey", label: "Service role key", placeholder: "eyJhbGciOi…", type: "password" },
      { name: "table", label: "Table", placeholder: "profiles", optional: true, roles: ["users"], hint: "Leave empty to count auth.users" },
      { name: "table", label: "Table with one row per activated user", placeholder: "projects_owners", roles: ["activation"] },
      { name: "createdAtColumn", label: "created_at column", placeholder: "created_at", optional: true, hint: "Enables 24h/7d/30d counts and 30-day history backfill" },
    ],
    reads: "HEAD requests with Prefer: count=exact — row counts only, never row data.",
    steps: ["Supabase → Project Settings → API", "Copy Project URL and the service_role key", "Optionally name a table + created_at column for range metrics"],
  },
  {
    kind: "firebase",
    label: "Firebase Auth",
    tagline: "Total users via the Identity Toolkit admin API",
    trust: "verified",
    roles: ["users"],
    fields: [
      { name: "serviceAccount", label: "Service account JSON", placeholder: '{ "type": "service_account", … }', type: "textarea" },
      { name: "projectId", label: "Project ID", placeholder: "my-app-1234", optional: true, hint: "Taken from the JSON if empty" },
    ],
    reads: "accounts:query with returnUserInfo=false — a count, no user records.",
    steps: ["Google Cloud Console → IAM & Admin → Service Accounts → Create", 'Grant the role "Firebase Authentication Viewer"', "Keys → Add key → JSON, paste the file contents here"],
  },
  {
    kind: "auth0",
    label: "Auth0",
    tagline: "Users, daily signups, and active users via the Management API",
    trust: "verified",
    roles: ["users"],
    fields: [
      { name: "domain", label: "Tenant domain", placeholder: "acme.eu.auth0.com" },
      { name: "clientId", label: "M2M client ID", placeholder: "abc123…" },
      { name: "clientSecret", label: "M2M client secret", placeholder: "•••••", type: "password" },
    ],
    reads: "GET /api/v2/users?include_totals (count only), /stats/daily, /stats/active-users.",
    steps: ["Auth0 → Applications → Create → Machine to Machine", 'Authorize "Auth0 Management API" with scopes read:users and read:stats', "Copy Domain, Client ID and Client Secret"],
  },
  {
    kind: "posthog",
    label: "PostHog",
    tagline: "Activation events and web traffic via HogQL",
    trust: "verified",
    roles: ["activation", "traffic"],
    fields: [
      { name: "host", label: "Host", placeholder: "https://us.posthog.com", type: "url", hint: "us / eu cloud or self-hosted" },
      { name: "projectId", label: "Project ID", placeholder: "12345" },
      { name: "apiKey", label: "Personal API key", placeholder: "phx_…", type: "password" },
      { name: "activationEvent", label: "Activation event", placeholder: "onboarding_completed", roles: ["activation"], hint: "Distinct persons who triggered this event count as activated" },
    ],
    reads: "count(distinct person_id) queries. Aggregates only, no person data.",
    steps: ["PostHog → Settings → Personal API keys → Create (scope: query:read)", "Project ID is in Settings → Project", "Pick the event that means a user really started (e.g. project_created)"],
  },
  {
    kind: "plausible",
    label: "Plausible",
    tagline: "Visitors and visits from the Plausible Stats API",
    trust: "verified",
    roles: ["traffic"],
    fields: [
      { name: "siteId", label: "Site (domain)", placeholder: "acme.com" },
      { name: "apiKey", label: "API key", placeholder: "•••••", type: "password" },
      { name: "host", label: "Host", placeholder: "https://plausible.io", type: "url", optional: true, hint: "Self-hosted instance URL if any" },
    ],
    reads: "stats/aggregate and stats/timeseries — visitor counts only.",
    steps: ["Plausible → Settings → API keys → New API key", "Site ID is the domain exactly as it appears in Plausible"],
  },
  {
    kind: "ga4",
    label: "Google Analytics 4",
    tagline: "Active users and sessions via the GA4 Data API",
    trust: "verified",
    roles: ["traffic"],
    fields: [
      { name: "propertyId", label: "Property ID", placeholder: "123456789", hint: "Admin → Property settings" },
      { name: "serviceAccount", label: "Service account JSON", placeholder: '{ "type": "service_account", … }', type: "textarea" },
    ],
    reads: "runReport with activeUsers + sessions. Aggregates only.",
    steps: ["Google Cloud → Service Accounts → Create → Keys → JSON", "GA4 → Admin → Property access management → add the service-account email as Viewer", "Enable the Google Analytics Data API for the project"],
  },
  {
    kind: "stripe",
    label: "Stripe",
    tagline: "Paying customers and MRR from active subscriptions",
    trust: "verified",
    roles: ["revenue"],
    fields: [{ name: "secretKey", label: "Restricted key", placeholder: "rk_live_…", type: "password", hint: "Read-only on Subscriptions is enough" }],
    reads: "GET /v1/subscriptions?status=active (paginated). Sums recurring prices, ignores discounts.",
    steps: ["Stripe → Developers → API keys → Create restricted key", "Permissions: Subscriptions → Read, everything else None", "Paste the rk_live_… key here"],
  },
  {
    kind: "endpoint",
    label: "JSON endpoint",
    tagline: "Your own URL returning the numbers as JSON",
    trust: "conditional",
    roles: ["users", "activation", "traffic", "revenue"],
    fields: [
      { name: "url", label: "Endpoint URL", placeholder: "https://api.yourapp.com/usertrack", type: "url" },
      { name: "token", label: "Bearer token", placeholder: "Sent as Authorization: Bearer …", type: "password", optional: true },
    ],
    reads: "One GET per sync. Verified only when the URL is on your product's own domain.",
    steps: ["Expose a GET endpoint on your own domain", "Return the JSON below (only the required key is mandatory)", "Optionally protect it with a bearer token"],
    code: {
      label: "Response shape",
      text: '{ "totalUsers": 1234, "newUsers24h": 12, "newUsers7d": 80, "newUsers30d": 310, "activeUsers30d": 900,\n  "activatedUsers": 700, "visitors30d": 48200, "sessions30d": 61000, "payingUsers": 61, "mrr": 482000, "currency": "USD" }',
    },
  },
  {
    kind: "manual",
    label: "Manual",
    tagline: "Type a number. Always labelled self-reported, never ranked.",
    trust: "unverified",
    roles: ["users"],
    fields: [{ name: "totalUsers", label: "Total users", placeholder: "1200", type: "number" }],
    reads: "Nothing — the number is what you typed.",
    steps: ["Good for a quick start", "Connect a real source later to get verified and ranked"],
  },
];

export const providersForRole = (role: Role) => PROVIDERS.filter((p) => p.roles.includes(role));
export const providerLabel = (kind: string) => PROVIDERS.find((p) => p.kind === kind)?.label ?? kind;
