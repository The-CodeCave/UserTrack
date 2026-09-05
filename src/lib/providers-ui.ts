export type ProviderKind = "clerk" | "supabase" | "firebase" | "native" | "auth0" | "posthog" | "plausible" | "ga4" | "stripe" | "revenuecat" | "paddle" | "lemonsqueezy" | "chargebee" | "postgres" | "endpoint" | "manual";
// Lifecycle roles: users → Signed up, activation → Activated, traffic → Reached, conversion → Trial + Converted.
export type Role = "users" | "activation" | "traffic" | "conversion";
export const ROLES: Role[] = ["users", "activation", "traffic", "conversion"];
export type LifecycleStage = "reached" | "signed_up" | "activated" | "trial" | "converted";

export interface ProviderField {
  name: string;
  label: string;
  placeholder: string;
  type?: "text" | "password" | "number" | "url" | "textarea" | "select";
  options?: { value: string; label: string }[];
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
  // Which lifecycle stages this source feeds. Informational for the wizard and provenance panels.
  stages: LifecycleStage[];
  platforms?: ("web" | "mobile")[];
  fields: ProviderField[];
  reads: string;
  steps: string[];
  code?: { label: string; text: string };
}

export const ROLE_META: Record<Role, { label: string; title: string; blurb: string; optional: boolean; stage: string; group: "growth" | "engagement" | "conversion" }> = {
  users: { label: "Users", title: "Identity source · Signed up", blurb: "Where your registered user count comes from (auth provider or database). Required, read-only, synced every 4 hours. Sign in with Apple / Google are sign-in methods, not the user store.", optional: false, stage: "Signed up", group: "growth" },
  activation: { label: "Activation", title: "Activation source · Activated", blurb: "An activated user reached the first meaningful value in your product. Tell UserTrack which event or table means that — e.g. onboarding_completed, project_created.", optional: true, stage: "Activated", group: "engagement" },
  traffic: { label: "Reach", title: "Reach source · Visitors", blurb: "Visitors and sessions for the top of the funnel. Private unless you publish it.", optional: true, stage: "Reached", group: "growth" },
  conversion: { label: "Conversion", title: "Conversion source · Trial & Converted", blurb: "Your payment provider is read only to determine who converted (and who is on a trial). UserTrack never needs your revenue numbers — no amounts, prices or MRR are read or stored. Private unless you publish it.", optional: true, stage: "Converted", group: "conversion" },
};

export const CONVERSION_MODE_OPTIONS = [
  { value: "active_paid", label: "Active paid (default) — currently has a paid subscription" },
  { value: "ever_paid", label: "Ever paid — paid at least once, even if churned" },
  { value: "first_payment", label: "First successful payment — same as ever paid, counted at the first payment" },
];
const modeField: ProviderField = { name: "mode", label: "Converted means", placeholder: "", type: "select", options: CONVERSION_MODE_OPTIONS, optional: true, hint: "Provider-independent definition of a converted user. Change later without reconnecting." };

export const NO_REVENUE_NOTE = "UserTrack never needs your revenue numbers. Payment providers are used only to calculate user conversion metrics.";

export const PROVIDERS: ProviderMeta[] = [
  {
    kind: "native",
    label: "My app (SDK)",
    tagline: "Native SDK · ~2 min setup — your app answers signed aggregate requests: Better Auth plugin, or @usertrack/node for Prisma, Drizzle, Convex, Auth.js and custom apps",
    trust: "verified",
    roles: ["users", "activation", "conversion"],
    stages: ["signed_up", "activated", "trial", "converted"],
    platforms: ["web"],
    fields: [{ name: "url", label: "Base URL", placeholder: "https://app.example.com/api/usertrack", type: "url", hint: "Where the handler is mounted (Better Auth: baseURL + basePath)" }],
    reads: "POST …/metrics on your app, signed with the integration secret: total users, signups 24h / 7d / 30d, a daily series and — if you wire them — activated and converted users. No emails, names or user records — ever.",
    steps: ["Create the integration — UserTrack generates a project id and a secret (shown once)", "Install @usertrack/better-auth (plugin) or @usertrack/node (one route + a count function)", "Set USERTRACK_PROJECT_ID / USERTRACK_SECRET, deploy, click Verify"],
  },
  {
    kind: "clerk",
    label: "Clerk",
    tagline: "User count, signups and active users via the Clerk Backend API",
    trust: "verified",
    roles: ["users"],
    stages: ["signed_up"],
    platforms: ["web"],
    fields: [{ name: "secretKey", label: "Secret key", placeholder: "sk_live_…", type: "password" }],
    reads: "GET /v1/users/count with created_at / last_active_at filters. Nothing else.",
    steps: ["Clerk Dashboard → Configure → API Keys", "Copy the Secret key (sk_live_…)", "Paste it here — it is stored server-side and never shown again"],
  },
  {
    kind: "supabase",
    label: "Supabase",
    tagline: "auth.users signups via a read-only connection string, or totals via the service role key",
    trust: "verified",
    roles: ["users", "activation"],
    stages: ["signed_up", "activated"],
    platforms: ["web", "mobile"],
    fields: [
      { name: "connectionString", label: "Database connection string", placeholder: "postgresql://postgres.<ref>:…@aws-0-eu-central-1.pooler.supabase.com:5432/postgres", type: "password", optional: true, hint: "Recommended · Supabase → Connect → Session pooler. Unlocks 24h/7d/30d signups + full history from auth.users" },
      { name: "url", label: "Project URL", placeholder: "https://xxxx.supabase.co", type: "url", optional: true, hint: "Fallback without a connection string" },
      { name: "serviceKey", label: "Service role key", placeholder: "eyJhbGciOi…", type: "password", optional: true, hint: "Fallback · counts auth.users only" },
      { name: "table", label: "Table", placeholder: "profiles", optional: true, roles: ["users"], hint: "Leave empty to count auth.users" },
      { name: "table", label: "Table with one row per activated user", placeholder: "public.workspaces", roles: ["activation"], optional: true },
      { name: "createdAtColumn", label: "created_at column", placeholder: "created_at", optional: true, hint: "Enables 24h/7d/30d counts and full history backfill" },
      { name: "idColumn", label: "User id column", placeholder: "id", optional: true, hint: "Enables cohort matching (ids are hashed, never stored raw). auth.users uses id automatically" },
      { name: "sql", label: "Custom SQL (activation, connection string only)", placeholder: "SELECT count(distinct user_id) FROM projects WHERE created_at >= $1", type: "textarea", optional: true, roles: ["activation"], hint: "One read-only SELECT returning a count · $1 = since timestamp" },
    ],
    reads: "count(*) on auth.users with created_at / deleted_at filters (database mode) or exact-count HEAD requests (API mode). Never row data.",
    steps: ["Supabase → Connect → Session pooler → copy the URI (a dedicated read-only role is best: GRANT SELECT ON auth.users)", "Or: Project Settings → API → Project URL + service_role key (totals only)", "Optionally name a table + created_at column"],
  },
  {
    kind: "postgres",
    label: "PostgreSQL",
    tagline: "Any Postgres database: read-only connection + your users table",
    trust: "verified",
    roles: ["users", "activation"],
    stages: ["signed_up", "activated"],
    platforms: ["web", "mobile"],
    fields: [
      { name: "connectionString", label: "Read-only connection string", placeholder: "postgresql://usertrack_ro:…@host:5432/db?sslmode=require", type: "password" },
      { name: "tableRef", label: "Users table", placeholder: "public.users", roles: ["users"] },
      { name: "tableRef", label: "Activation table", placeholder: "public.workspaces", roles: ["activation"], optional: true, hint: "One row per activated user — or use custom SQL below" },
      { name: "createdAtColumn", label: "Signup timestamp column", placeholder: "created_at", optional: true, hint: "Unlocks 24h/7d/30d signups and full history" },
      { name: "idColumn", label: "User id column", placeholder: "id", optional: true, hint: "Enables cohort matching (ids are hashed before storage)" },
      { name: "deletedAtColumn", label: "Soft-delete column", placeholder: "deleted_at", optional: true },
      { name: "sql", label: "Custom SQL", placeholder: "SELECT count(distinct user_id) FROM projects WHERE created_at >= $1", type: "textarea", optional: true, roles: ["activation"], hint: "One read-only SELECT returning a count · $1 = since timestamp" },
    ],
    reads: "SELECT count(*) with created_at / deleted_at filters and one GROUP BY day query for history. Session forced read-only, 20s statement timeout.",
    steps: ["Create a read-only role: CREATE ROLE usertrack_ro LOGIN PASSWORD '…'; GRANT SELECT ON public.users TO usertrack_ro;", "Allow connections from the internet (or use your provider's pooler) with SSL", "Paste the connection string, pick the table and the signup column"],
  },
  {
    kind: "firebase",
    label: "Firebase Auth",
    tagline: "Registered users via the Identity Toolkit admin API — the identity source for most mobile apps",
    trust: "verified",
    roles: ["users"],
    stages: ["signed_up"],
    platforms: ["web", "mobile"],
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
    stages: ["signed_up"],
    platforms: ["web", "mobile"],
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
    stages: ["activated", "reached"],
    platforms: ["web", "mobile"],
    fields: [
      { name: "host", label: "Host", placeholder: "https://us.posthog.com", type: "url", hint: "us / eu cloud or self-hosted" },
      { name: "projectId", label: "Project ID", placeholder: "12345" },
      { name: "apiKey", label: "Personal API key", placeholder: "phx_…", type: "password" },
      { name: "activationEvent", label: "Activation event", placeholder: "onboarding_completed", roles: ["activation"], hint: "Distinct persons who triggered this event count as activated. Call posthog.identify(userId) in your app to enable cohort matching." },
    ],
    reads: "count(distinct person_id) queries plus identified distinct_ids of activated persons (hashed before storage). No person properties.",
    steps: ["PostHog → Settings → Personal API keys → Create (scope: query:read)", "Project ID is in Settings → Project", "Pick the event that means a user really started (e.g. project_created)"],
  },
  {
    kind: "plausible",
    label: "Plausible",
    tagline: "Visitors and visits from the Plausible Stats API",
    trust: "verified",
    roles: ["traffic"],
    stages: ["reached"],
    platforms: ["web"],
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
    tagline: "Active users and sessions via the GA4 Data API (also Firebase Analytics-linked properties)",
    trust: "verified",
    roles: ["traffic"],
    stages: ["reached"],
    platforms: ["web", "mobile"],
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
    tagline: "Converted and trial users from subscription state — no amounts, no MRR",
    trust: "verified",
    roles: ["conversion"],
    stages: ["trial", "converted"],
    platforms: ["web", "mobile"],
    fields: [
      { name: "secretKey", label: "Restricted key", placeholder: "rk_live_…", type: "password", hint: "Permissions: Subscriptions → Read. Nothing else." },
      modeField,
    ],
    reads: "GET /v1/subscriptions by status (paginated): status, customer id, trial and start dates, metadata.userId. Prices, invoices and amounts are never requested. A Stripe customer that never paid is not a converted user.",
    steps: ["Stripe → Developers → API keys → Create restricted key", "Permissions: Subscriptions → Read, everything else None", "Paste the rk_live_… key here. Optional: set metadata.userId on subscriptions to enable cohort matching"],
  },
  {
    kind: "revenuecat",
    label: "RevenueCat",
    tagline: "Trial and converted users for iOS / Android subscription apps",
    trust: "verified",
    roles: ["conversion"],
    stages: ["trial", "converted"],
    platforms: ["mobile"],
    fields: [
      { name: "apiKey", label: "Secret API key (v2)", placeholder: "sk_…", type: "password", hint: "Permission: Charts & Metrics → Read only" },
      { name: "projectId", label: "Project ID", placeholder: "proj1ab2c3d4", hint: "RevenueCat → Project settings → General" },
    ],
    reads: "GET /v2/projects/{id}/metrics/overview → active_trials and active_subscriptions only. MRR / revenue values in the same response are discarded. RevenueCat customers (incl. anonymous app user ids) are never counted as registered users.",
    steps: ["RevenueCat → Project settings → API keys → New secret key (v2)", "Permissions: Charts & Metrics → Read. Leave everything else off", "Copy the project ID from Project settings → General"],
  },
  {
    kind: "paddle",
    label: "Paddle",
    tagline: "Converted and trial users from Paddle Billing subscriptions",
    trust: "verified",
    roles: ["conversion"],
    stages: ["trial", "converted"],
    platforms: ["web"],
    fields: [
      { name: "apiKey", label: "API key", placeholder: "pdl_live_apikey_…", type: "password", hint: "Read-only permission on Subscriptions" },
      { name: "environment", label: "Environment", placeholder: "", type: "select", options: [{ value: "live", label: "Live" }, { value: "sandbox", label: "Sandbox" }], optional: true },
      modeField,
    ],
    reads: "GET /subscriptions by status: status, customer id, first_billed_at, custom_data.userId. No transactions or prices.",
    steps: ["Paddle → Developer tools → Authentication → New API key", "Permissions: Subscriptions → Read only", "Paste it here"],
  },
  {
    kind: "lemonsqueezy",
    label: "Lemon Squeezy",
    tagline: "Converted and trial users from subscriptions and paid orders",
    trust: "verified",
    roles: ["conversion"],
    stages: ["trial", "converted"],
    platforms: ["web"],
    fields: [
      { name: "apiKey", label: "API key", placeholder: "eyJ0eXAiOiJKV1Qi…", type: "password" },
      { name: "storeId", label: "Store ID", placeholder: "12345", optional: true, hint: "Limit to one store; empty = all stores of the account" },
      modeField,
    ],
    reads: "GET /v1/subscriptions (status, customer id, trial dates) and, for ever-paid modes, GET /v1/orders (status, customer id). Prices and emails in the response are dropped at parse time.",
    steps: ["Lemon Squeezy → Settings → API → Create API key", "Optionally note your Store ID (Settings → Stores)", "Paste the key here"],
  },
  {
    kind: "chargebee",
    label: "Chargebee",
    tagline: "Converted and trial users from Chargebee subscriptions",
    trust: "verified",
    roles: ["conversion"],
    stages: ["trial", "converted"],
    platforms: ["web"],
    fields: [
      { name: "site", label: "Site", placeholder: "acme", hint: "The part before .chargebee.com" },
      { name: "apiKey", label: "Read-only API key", placeholder: "live_…", type: "password" },
      modeField,
    ],
    reads: "GET /api/v2/subscriptions by status: status, customer id, trial and activation timestamps, meta_data.userId. No invoices or amounts.",
    steps: ["Chargebee → Settings → Configure Chargebee → API keys → Add API key", "Type: Read-only key", "Paste site name and key here"],
  },
  {
    kind: "endpoint",
    label: "JSON endpoint",
    tagline: "Your own URL returning the numbers as JSON — any stack, any billing model",
    trust: "conditional",
    roles: ["users", "activation", "traffic", "conversion"],
    stages: ["reached", "signed_up", "activated", "trial", "converted"],
    platforms: ["web", "mobile"],
    fields: [
      { name: "url", label: "Endpoint URL", placeholder: "https://api.yourapp.com/usertrack", type: "url" },
      { name: "token", label: "Bearer token", placeholder: "Sent as Authorization: Bearer …", type: "password", optional: true },
    ],
    reads: "One GET per sync. Verified only when the URL is on your product's own domain.",
    steps: ["Expose a GET endpoint on your own domain", "Return the JSON below (only the required key for the role is mandatory)", "Optionally protect it with a bearer token"],
    code: {
      label: "Response shape",
      text: '{ "totalUsers": 1234, "newUsers24h": 12, "newUsers7d": 80, "newUsers30d": 310, "activeUsers30d": 900,\n  "activatedUsers": 700, "visitors30d": 48200, "sessions30d": 61000,\n  "convertedUsers": 61, "newConverted30d": 9, "trialUsers": 14, "newTrials30d": 20, "mode": "active_paid",\n  "identities": { "signedUp": [{ "id": "usr_1", "at": "2026-08-01T00:00:00Z" }], "activated": ["usr_1"], "converted": ["usr_1"] } }',
    },
  },
  {
    kind: "manual",
    label: "Manual",
    tagline: "Type a number. Always labelled self-reported, never ranked.",
    trust: "unverified",
    roles: ["users"],
    stages: ["signed_up"],
    fields: [{ name: "totalUsers", label: "Total users", placeholder: "1200", type: "number" }],
    reads: "Nothing — the number is what you typed.",
    steps: ["Good for a quick start", "Connect a real source later to get verified and ranked"],
  },
];

export const providersForRole = (role: Role, platform?: "web" | "mobile") => PROVIDERS.filter((p) => p.roles.includes(role) && (!platform || !p.platforms || p.platforms.includes(platform)));
export const providerLabel = (kind: string) => PROVIDERS.find((p) => p.kind === kind)?.label ?? kind;
