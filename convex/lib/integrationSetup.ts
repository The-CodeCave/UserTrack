// Agent-executable integration knowledge: catalog, recommendation and structured setup instructions.
// Pure data + functions, shared by the MCP server and the developer docs. No I/O.

export type ProviderKind = "clerk" | "supabase" | "firebase" | "auth0" | "posthog" | "plausible" | "ga4" | "stripe" | "endpoint" | "manual";
export type Role = "users" | "activation" | "traffic" | "revenue";

export interface Credential {
  key: string;
  label: string;
  secret: boolean;
  optional?: boolean;
  roles?: Role[];
  whereToFind: string;
  envVarHints: string[];
  format?: string;
}

export interface CatalogEntry {
  provider: ProviderKind;
  label: string;
  roles: Role[];
  trust: "verified" | "conditional" | "unverified";
  summary: string;
  detects: string[];
  credentials: Credential[];
  permissions: string[];
  reads: string;
  neverSent: string[];
}

const NEVER = ["emails", "names", "passwords", "session tokens", "per-user records", "payment details"];

export const INTEGRATION_CATALOG: CatalogEntry[] = [
  {
    provider: "clerk",
    label: "Clerk",
    roles: ["users"],
    trust: "verified",
    summary: "User count, signups and active users via the Clerk Backend API (count endpoint only).",
    detects: ["@clerk/nextjs", "@clerk/clerk-sdk-node", "@clerk/backend", "@clerk/clerk-react", "CLERK_SECRET_KEY"],
    credentials: [{ key: "secretKey", label: "Clerk secret key", secret: true, whereToFind: "Clerk Dashboard → Configure → API Keys → Secret key", envVarHints: ["CLERK_SECRET_KEY"], format: "sk_live_… or sk_test_…" }],
    permissions: ["Any Clerk secret key works; UserTrack only calls GET /v1/users/count."],
    reads: "GET /v1/users/count with created_at / last_active_at filters. Never lists users.",
    neverSent: NEVER,
  },
  {
    provider: "supabase",
    label: "Supabase",
    roles: ["users", "activation"],
    trust: "verified",
    summary: "Counts auth.users (or any table) with exact-count HEAD requests through the service role key.",
    detects: ["@supabase/supabase-js", "@supabase/ssr", "@supabase/auth-helpers-nextjs", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"],
    credentials: [
      { key: "url", label: "Project URL", secret: false, whereToFind: "Supabase → Project Settings → API → Project URL", envVarHints: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"], format: "https://xxxx.supabase.co" },
      { key: "serviceKey", label: "Service role key", secret: true, whereToFind: "Supabase → Project Settings → API → service_role (server-only)", envVarHints: ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"] },
      { key: "table", label: "Table to count", secret: false, optional: true, roles: ["users"], whereToFind: "Leave empty to count auth.users; otherwise a public table with one row per user (e.g. profiles).", envVarHints: [] },
      { key: "table", label: "Table with one row per activated user", secret: false, roles: ["activation"], whereToFind: "A table that only gets a row once a user really used the product (e.g. projects_owners).", envVarHints: [] },
      { key: "createdAtColumn", label: "created_at column", secret: false, optional: true, whereToFind: "Timestamp column on that table; unlocks 24h/7d/30d counts and 30-day history.", envVarHints: [] },
    ],
    permissions: ["The service role key is required for auth.users counts. It must stay server-side; UserTrack stores it encrypted and never returns it."],
    reads: "HEAD requests with Prefer: count=exact and /auth/v1/admin/users?per_page=1 — row counts only, never row data.",
    neverSent: NEVER,
  },
  {
    provider: "firebase",
    label: "Firebase Auth",
    roles: ["users"],
    trust: "verified",
    summary: "Total users via the Identity Toolkit admin API using a viewer-only service account.",
    detects: ["firebase", "firebase-admin", "@firebase/auth", "FIREBASE_PROJECT_ID", "GOOGLE_APPLICATION_CREDENTIALS"],
    credentials: [
      { key: "serviceAccount", label: "Service account JSON", secret: true, whereToFind: "Google Cloud Console → IAM & Admin → Service Accounts → create one with role 'Firebase Authentication Viewer' → Keys → Add key (JSON)", envVarHints: ["FIREBASE_SERVICE_ACCOUNT", "GOOGLE_APPLICATION_CREDENTIALS"], format: "Full JSON file contents" },
      { key: "projectId", label: "Project ID", secret: false, optional: true, whereToFind: "Firebase console → Project settings; taken from the JSON if empty", envVarHints: ["FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"] },
    ],
    permissions: ["Create a dedicated service account with only 'Firebase Authentication Viewer'. Do not reuse the admin SDK account."],
    reads: "accounts:query with returnUserInfo=false — a count, no user records.",
    neverSent: NEVER,
  },
  {
    provider: "auth0",
    label: "Auth0",
    roles: ["users"],
    trust: "verified",
    summary: "Users, daily signups and active users via a Machine-to-Machine app with read scopes.",
    detects: ["@auth0/nextjs-auth0", "auth0", "@auth0/auth0-react", "AUTH0_DOMAIN", "AUTH0_CLIENT_ID"],
    credentials: [
      { key: "domain", label: "Tenant domain", secret: false, whereToFind: "Auth0 → Settings → Domain", envVarHints: ["AUTH0_DOMAIN", "AUTH0_ISSUER_BASE_URL"], format: "acme.eu.auth0.com" },
      { key: "clientId", label: "M2M client ID", secret: false, whereToFind: "Auth0 → Applications → (new Machine to Machine app) → Client ID", envVarHints: ["AUTH0_M2M_CLIENT_ID"] },
      { key: "clientSecret", label: "M2M client secret", secret: true, whereToFind: "Same application → Client Secret", envVarHints: ["AUTH0_M2M_CLIENT_SECRET"] },
    ],
    permissions: ["Create a new M2M application authorised for the Auth0 Management API with only read:users and read:stats."],
    reads: "GET /api/v2/users?include_totals (count only), /stats/daily, /stats/active-users.",
    neverSent: NEVER,
  },
  {
    provider: "posthog",
    label: "PostHog",
    roles: ["activation", "traffic"],
    trust: "verified",
    summary: "Activation events (distinct persons) and web traffic via HogQL aggregates.",
    detects: ["posthog-js", "posthog-node", "NEXT_PUBLIC_POSTHOG_KEY", "POSTHOG_API_KEY"],
    credentials: [
      { key: "host", label: "Host", secret: false, whereToFind: "https://us.posthog.com, https://eu.posthog.com or your self-hosted URL", envVarHints: ["NEXT_PUBLIC_POSTHOG_HOST", "POSTHOG_HOST"] },
      { key: "projectId", label: "Project ID", secret: false, whereToFind: "PostHog → Settings → Project → Project ID", envVarHints: ["POSTHOG_PROJECT_ID"] },
      { key: "apiKey", label: "Personal API key (query:read)", secret: true, whereToFind: "PostHog → Settings → Personal API keys → create with scope query:read", envVarHints: ["POSTHOG_PERSONAL_API_KEY"], format: "phx_…" },
      { key: "activationEvent", label: "Activation event", secret: false, roles: ["activation"], whereToFind: "The event name that means a user really started (e.g. project_created, onboarding_completed). Grep the repo for posthog.capture(...) calls.", envVarHints: [] },
    ],
    permissions: ["Personal API key with only query:read. The project (phc_) key is not enough and must not be used."],
    reads: "count(distinct person_id) HogQL queries. Aggregates only.",
    neverSent: NEVER,
  },
  {
    provider: "plausible",
    label: "Plausible",
    roles: ["traffic"],
    trust: "verified",
    summary: "Visitors and visits from the Plausible Stats API.",
    detects: ["plausible", "next-plausible", "PLAUSIBLE_API_KEY"],
    credentials: [
      { key: "siteId", label: "Site ID (domain)", secret: false, whereToFind: "Exactly as shown in Plausible", envVarHints: ["PLAUSIBLE_DOMAIN", "NEXT_PUBLIC_PLAUSIBLE_DOMAIN"] },
      { key: "apiKey", label: "API key", secret: true, whereToFind: "Plausible → Settings → API keys", envVarHints: ["PLAUSIBLE_API_KEY"] },
      { key: "host", label: "Host", secret: false, optional: true, whereToFind: "Self-hosted instance URL if any", envVarHints: ["PLAUSIBLE_HOST"] },
    ],
    permissions: ["Stats API key (read-only by design)."],
    reads: "stats/aggregate and stats/timeseries — visitor counts only.",
    neverSent: NEVER,
  },
  {
    provider: "ga4",
    label: "Google Analytics 4",
    roles: ["traffic"],
    trust: "verified",
    summary: "Active users and sessions via the GA4 Data API with a Viewer service account.",
    detects: ["@next/third-parties/google", "gtag", "NEXT_PUBLIC_GA_ID", "GA_MEASUREMENT_ID"],
    credentials: [
      { key: "propertyId", label: "Property ID", secret: false, whereToFind: "GA4 → Admin → Property settings (numeric)", envVarHints: ["GA4_PROPERTY_ID"] },
      { key: "serviceAccount", label: "Service account JSON", secret: true, whereToFind: "Google Cloud → Service Accounts → create → Keys → JSON; add its email as Viewer in GA4 property access; enable the Analytics Data API", envVarHints: ["GA4_SERVICE_ACCOUNT"] },
    ],
    permissions: ["Property access: Viewer only."],
    reads: "runReport with activeUsers + sessions. Aggregates only.",
    neverSent: NEVER,
  },
  {
    provider: "stripe",
    label: "Stripe",
    roles: ["revenue"],
    trust: "verified",
    summary: "Paying customers and MRR from active subscriptions with a restricted read-only key.",
    detects: ["stripe", "@stripe/stripe-js", "STRIPE_SECRET_KEY"],
    credentials: [{ key: "secretKey", label: "Restricted key", secret: true, whereToFind: "Stripe → Developers → API keys → Create restricted key: Subscriptions = Read, everything else None", envVarHints: ["STRIPE_RESTRICTED_KEY"], format: "rk_live_…" }],
    permissions: ["Never use the full secret key (sk_live_). Create a restricted key with Subscriptions: Read only."],
    reads: "GET /v1/subscriptions?status=active (paginated). Sums recurring prices.",
    neverSent: NEVER,
  },
  {
    provider: "endpoint",
    label: "JSON endpoint on your own domain",
    roles: ["users", "activation", "traffic", "revenue"],
    trust: "conditional",
    summary: "A tiny authenticated route in your own app that returns aggregate counts. Verified when it lives on the product's domain. Works with any stack: Better Auth, NextAuth, Lucia, Convex, Prisma, Drizzle, Mongo, raw SQL.",
    detects: ["better-auth", "next-auth", "@auth/core", "lucia", "convex", "@prisma/client", "drizzle-orm", "mongoose", "pg", "mysql2", "kysely", "sequelize", "typeorm"],
    credentials: [
      { key: "url", label: "Endpoint URL", secret: false, whereToFind: "The route you add, on the same domain as the product (e.g. https://app.example.com/api/usertrack)", envVarHints: [], format: "https://…" },
      { key: "token", label: "Bearer token", secret: true, optional: true, whereToFind: "Generate a random secret (openssl rand -hex 32), set it as USERTRACK_ENDPOINT_TOKEN in the app, and give the same value to UserTrack", envVarHints: ["USERTRACK_ENDPOINT_TOKEN"] },
    ],
    permissions: ["The route runs inside your app with your own DB access; expose a count only."],
    reads: "One GET per sync, expects { \"totalUsers\": n } (plus optional newUsers24h/7d/30d, activeUsers30d, activatedUsers…).",
    neverSent: NEVER,
  },
  {
    provider: "manual",
    label: "Manual (self-reported)",
    roles: ["users"],
    trust: "unverified",
    summary: "Type a number. Always labelled self-reported, never ranked. Last resort only.",
    detects: [],
    credentials: [{ key: "totalUsers", label: "Total users", secret: false, whereToFind: "Ask the founder", envVarHints: [], format: "integer" }],
    permissions: [],
    reads: "Nothing.",
    neverSent: NEVER,
  },
];

export const catalogEntry = (provider: string) => INTEGRATION_CATALOG.find((c) => c.provider === provider) ?? null;

// Aliases an agent might report after scanning package.json / env files → UserTrack provider.
const DETECTION_ALIASES: Record<string, ProviderKind> = {
  clerk: "clerk",
  supabase: "supabase",
  firebase: "firebase",
  "firebase-auth": "firebase",
  auth0: "auth0",
  posthog: "posthog",
  plausible: "plausible",
  ga4: "ga4",
  "google-analytics": "ga4",
  gtag: "ga4",
  stripe: "stripe",
  endpoint: "endpoint",
  manual: "manual",
  "better-auth": "endpoint",
  betterauth: "endpoint",
  nextauth: "endpoint",
  "next-auth": "endpoint",
  "auth.js": "endpoint",
  authjs: "endpoint",
  lucia: "endpoint",
  convex: "endpoint",
  prisma: "endpoint",
  drizzle: "endpoint",
  mongoose: "endpoint",
  mongodb: "endpoint",
  postgres: "endpoint",
  postgresql: "endpoint",
  mysql: "endpoint",
  sqlite: "endpoint",
  kysely: "endpoint",
  "custom-db": "endpoint",
  custom: "endpoint",
  "custom-auth": "endpoint",
};

export function normalizeDetected(detected: readonly string[] = []) {
  const out: { raw: string; provider: ProviderKind }[] = [];
  for (const raw of detected) {
    const key = raw.trim().toLowerCase().replace(/^@/, "").replace(/\/.*$/, "").replace(/_/g, "-");
    const hit = DETECTION_ALIASES[key] ?? INTEGRATION_CATALOG.find((c) => c.detects.some((d) => d.toLowerCase() === raw.trim().toLowerCase() || d.toLowerCase().replace(/^@/, "").split("/")[0] === key))?.provider;
    if (hit) out.push({ raw, provider: hit });
  }
  return out;
}

const USERS_PRIORITY: ProviderKind[] = ["clerk", "supabase", "auth0", "firebase", "endpoint", "manual"];

// Best users-role source first, then optional extras (activation, traffic, revenue) the agent can offer afterwards.
export function recommendIntegrations(input: { detectedProviders?: readonly string[]; framework?: string }) {
  const detected = normalizeDetected(input.detectedProviders);
  const kinds = new Set(detected.map((d) => d.provider));
  const reasoning: string[] = [];
  let users: ProviderKind = "endpoint";
  for (const k of USERS_PRIORITY) {
    if (kinds.has(k) && k !== "manual") {
      users = k;
      reasoning.push(`${catalogEntry(k)!.label} detected (${detected.filter((d) => d.provider === k).map((d) => d.raw).join(", ")}) — it can report user counts directly with a read-only credential.`);
      break;
    }
  }
  if (users === "endpoint") reasoning.push(kinds.size ? "No supported auth provider was detected, so the safest verified path is a small JSON endpoint on the product's own domain that returns aggregate counts from your existing database." : "Nothing was detected; a JSON endpoint on the product's own domain is the universal verified option. Use manual only if no data source can be exposed.");
  const extras: { role: Role; provider: ProviderKind; reason: string }[] = [];
  if (kinds.has("posthog")) extras.push({ role: "activation", provider: "posthog", reason: "PostHog detected — pick the event that means a user really started and UserTrack will show activated users + activation rate." });
  else if (users === "supabase") extras.push({ role: "activation", provider: "supabase", reason: "A Supabase table with one row per activated user unlocks activation metrics." });
  if (kinds.has("plausible")) extras.push({ role: "traffic", provider: "plausible", reason: "Plausible detected — visitors and sessions for the funnel (private by default)." });
  else if (kinds.has("ga4")) extras.push({ role: "traffic", provider: "ga4", reason: "Google Analytics detected — active users and sessions for the funnel (private by default)." });
  if (kinds.has("stripe")) extras.push({ role: "revenue", provider: "stripe", reason: "Stripe detected — paying customers and MRR from a restricted read-only key (private by default)." });
  return {
    recommended: { role: "users" as Role, provider: users, entry: catalogEntry(users)! },
    alternatives: USERS_PRIORITY.filter((k) => k !== users).map((k) => ({ provider: k, label: catalogEntry(k)!.label, trust: catalogEntry(k)!.trust })),
    optionalExtras: extras,
    detected,
    reasoning,
  };
}

export interface SetupStep {
  id: string;
  title: string;
  detail: string;
  action: "collect_credential" | "modify_repo" | "deploy" | "call_tool" | "ask_user" | "verify";
  tool?: string;
}

const SECURITY_RULES = [
  "Use the least privilege credential listed in requirements; never a full-access or admin key when a read-only one exists.",
  "Credentials go straight into usertrack_configure_integration; never print, log, or commit them, and never paste them into chat.",
  "UserTrack stores only aggregate counts and timestamps. Do not send emails, names, passwords, session tokens or per-user rows.",
  "Do not modify authentication, billing or database code beyond adding a read-only count endpoint when the endpoint provider is used.",
  "If a credential is missing, ask the founder for it — do not guess, and do not create new keys without telling them.",
];

function endpointTemplate(framework: string | undefined, orm: string | undefined) {
  const count = orm === "prisma" ? "await prisma.user.count()" : orm === "drizzle" ? "(await db.select({ n: count() }).from(users))[0].n" : orm === "mongoose" ? "await User.countDocuments()" : orm === "convex" ? "await fetchQuery(api.usertrack.totalUsers, {})" : orm === "better-auth" ? "/* count rows in your Better Auth `user` table */ await db.user.count()" : "/* replace with your own count query */ 0";
  const next = `// app/api/usertrack/route.ts — returns aggregate counts only. Verified by UserTrack because it lives on your domain.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== \`Bearer \${process.env.USERTRACK_ENDPOINT_TOKEN}\`) return new Response("Unauthorized", { status: 401 });
  const totalUsers = ${count};
  return Response.json({ totalUsers });
}
`;
  const express = `// routes/usertrack.js — returns aggregate counts only.
app.get("/api/usertrack", async (req, res) => {
  if (req.headers.authorization !== \`Bearer \${process.env.USERTRACK_ENDPOINT_TOKEN}\`) return res.status(401).end();
  const totalUsers = ${count};
  res.json({ totalUsers });
});
`;
  if (framework === "express" || framework === "fastify" || framework === "hono" || framework === "node") return { framework: "express", path: "routes/usertrack.js", language: "javascript", code: express };
  return { framework: "nextjs", path: "app/api/usertrack/route.ts", language: "typescript", code: next };
}

// Deterministic instructions another coding agent can execute step by step.
export function integrationSetup(input: { provider: string; role?: Role; framework?: string; detectedProviders?: readonly string[]; websiteUrl?: string; projectId?: string }) {
  const entry = catalogEntry(input.provider);
  if (!entry) return null;
  const role: Role = input.role ?? (entry.roles.includes("users") ? "users" : entry.roles[0]);
  if (!entry.roles.includes(role)) return null;
  const rec = recommendIntegrations({ detectedProviders: input.detectedProviders, framework: input.framework });
  const endpointHints = normalizeDetected(input.detectedProviders).filter((d) => d.provider === "endpoint").map((d) => d.raw.toLowerCase().replace(/^@/, "").split("/")[0]);
  const detectedOrm = ["prisma", "drizzle", "mongoose", "convex"].find((o) => endpointHints.some((h) => h.startsWith(o))) ?? endpointHints[0];
  const requirements = entry.credentials.filter((c) => !c.roles || c.roles.includes(role));
  const projectRef = input.projectId ?? "<projectId>";
  const steps: SetupStep[] = [];
  for (const c of requirements) {
    steps.push({
      id: `collect:${c.key}`,
      title: `${c.optional ? "Optionally locate" : "Locate"} ${c.label}`,
      detail: `${c.whereToFind}${c.envVarHints.length ? ` Check the repo's env files for ${c.envVarHints.join(" / ")} first.` : ""}${c.secret ? " Keep it server-side; never commit it." : ""}`,
      action: c.secret ? "collect_credential" : "ask_user",
    });
  }
  const codeTemplates: { framework: string; path: string; language: string; code: string }[] = [];
  if (entry.provider === "endpoint") {
    const tpl = endpointTemplate(input.framework, detectedOrm);
    codeTemplates.push(tpl);
    steps.unshift(
      { id: "endpoint:token", title: "Create the endpoint token", detail: "Generate a random secret (e.g. openssl rand -hex 32) and add it to the app's environment as USERTRACK_ENDPOINT_TOKEN in every environment that serves the product domain.", action: "modify_repo" },
      { id: "endpoint:route", title: "Add the count route", detail: `Add ${tpl.path} using the code template. Return { "totalUsers": <integer> } from your users table; add newUsers24h/7d/30d and activeUsers30d if cheap. Never return user records.`, action: "modify_repo" },
      { id: "endpoint:deploy", title: "Deploy", detail: `The route must be reachable over HTTPS on the product domain${input.websiteUrl ? ` (${input.websiteUrl})` : ""} — endpoints on other hosts are accepted but labelled self-reported.`, action: "deploy" },
    );
  }
  if (entry.provider === "manual") {
    steps.push({ id: "manual:ask", title: "Confirm the number with the founder", detail: "Manual numbers are labelled self-reported and never ranked. Prefer any verified provider if one exists.", action: "ask_user" });
  }
  steps.push(
    { id: "configure", title: "Submit the configuration to UserTrack", detail: `Call usertrack_configure_integration with { projectId: "${projectRef}", provider: "${entry.provider}", role: "${role}", config: { ${requirements.map((r) => `${r.key}: …`).join(", ")} } }. UserTrack validates the shape, stores secrets encrypted and starts the first sync immediately.`, action: "call_tool", tool: "usertrack_configure_integration" },
    { id: "verify", title: "Verify the connection", detail: `Call usertrack_verify_integration with { projectId: "${projectRef}", role: "${role}" }. It performs a live read and returns the detected count, the verification level and an actionable error if anything is wrong. Wait ~5 seconds after configuring; retry at most 3 times.`, action: "verify", tool: "usertrack_verify_integration" },
    { id: "publish", title: "Publish and share", detail: `Once verified, call usertrack_update_project with { projectId: "${projectRef}", isPublic: true }, then usertrack_get_share_url and hand the public URL to the founder.`, action: "call_tool", tool: "usertrack_update_project" },
  );
  return {
    provider: entry.provider,
    label: entry.label,
    role,
    recommended: rec.recommended.provider === entry.provider && role === "users",
    trust: entry.trust,
    summary: entry.summary,
    requirements: requirements.map((c) => ({ ...c, roles: undefined })),
    permissions: entry.permissions,
    reads: entry.reads,
    neverSent: entry.neverSent,
    steps,
    securityRules: SECURITY_RULES,
    configShape: Object.fromEntries(requirements.map((r) => [r.key, `${r.secret ? "secret " : ""}${r.format === "integer" ? "integer" : "string"}${r.optional ? " (optional)" : ""}`])),
    codeTemplates,
    verification: { tool: "usertrack_verify_integration", args: { projectId: projectRef, role } },
    nextTool: "usertrack_configure_integration",
    optionalExtras: rec.optionalExtras,
  };
}
