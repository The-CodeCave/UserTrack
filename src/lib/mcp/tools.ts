// The UserTrack MCP tool set. Each tool is a thin, typed adapter over one Convex gateway function.
import { z } from "zod";
import { fetchAction, fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { RANGES } from "@convex/lib/time";
import { TIMEFRAMES } from "@convex/domain/metrics";
import type { Scope } from "@convex/lib/tokens";
import { CARD_RANGES, CARD_STYLES } from "@/lib/share-card";
import type { Id } from "@convex/_generated/dataModel";
import { WEBHOOK_EVENTS } from "@convex/lib/webhooks";
import { DATASET_WINDOWS } from "@/lib/api/datasets";
import { MARKETS, MARKETING_CHANNELS } from "@/lib/profile-options";

type Auth = { hash: string; gateway?: string };
const ROLES = ["users", "activation", "traffic", "conversion"] as const;
const PROVIDERS = ["clerk", "supabase", "firebase", "native", "better_auth", "auth0", "posthog", "plausible", "ga4", "stripe", "revenuecat", "paddle", "lemonsqueezy", "chargebee", "postgres", "endpoint", "manual"] as const;
const NATIVE_SOURCES = ["better-auth", "prisma", "drizzle", "convex", "authjs", "custom"] as const;
const PROJECT_TYPES = ["web", "mobile", "hybrid"] as const;

const detectInput = {
  detectedProviders: z.array(z.string()).optional().describe("Packages / env var names found in the repo, e.g. ['@supabase/supabase-js', 'posthog-js', 'DATABASE_URL']"),
  framework: z.string().optional().describe("e.g. 'nextjs', 'express', 'react-native', 'expo', 'flutter', 'swiftui'"),
  projectType: z.enum(PROJECT_TYPES).optional().describe("web (default) | mobile (iOS / Android app) | hybrid"),
  detectedAuth: z.array(z.string()).optional().describe("Auth SDKs and sign-in methods, e.g. ['@react-native-firebase/auth', 'expo-apple-authentication', 'google-signin']. Sign in with Apple / Google are classified as auth methods, never as the users source."),
  detectedAnalytics: z.array(z.string()).optional().describe("Product analytics SDKs, e.g. ['posthog-react-native', 'posthog-ios', 'amplitude', 'mixpanel']"),
  detectedPayments: z.array(z.string()).optional().describe("Billing / subscription SDKs, e.g. ['react-native-purchases', 'purchases_flutter', 'stripe', '@paddle/paddle-js', 'StoreKit']. Read for conversion state only, never revenue."),
};

const ref = {
  projectId: z.string().optional().describe("UserTrack project id (from usertrack_get_projects)"),
  slug: z.string().optional().describe("Project slug, e.g. 'acme' — either projectId or slug is required"),
};

export interface Tool<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  readOnly: boolean;
  input: S;
  run: (auth: Auth, args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}

const tool = <S extends z.ZodRawShape>(t: Tool<S>) => t as unknown as Tool;

export const TOOLS: Tool[] = [
  tool({
    name: "usertrack_get_account",
    title: "Get account",
    description: "Current UserTrack account: founder profile, token scopes and a short list of owned projects. Call this first to orient yourself.",
    scope: "profile:read",
    readOnly: true,
    input: {},
    run: (auth) => fetchQuery(api.gateway.account, { auth }),
  }),
  tool({
    name: "usertrack_get_projects",
    title: "List projects",
    description: "All SaaS projects owned by this account with metrics, verification and public URLs.",
    scope: "projects:read",
    readOnly: true,
    input: {},
    run: (auth) => fetchQuery(api.gateway.projects, { auth }),
  }),
  tool({
    name: "usertrack_get_project",
    title: "Get project",
    description: "One project in full: metadata, integration state per role, verification, current metrics, URLs and the recommended next setup step.",
    scope: "projects:read",
    readOnly: true,
    input: ref,
    run: (auth, a) => fetchQuery(api.gateway.project, { auth, ...a }),
  }),
  tool({
    name: "usertrack_create_project",
    title: "Create project",
    description: "Create a SaaS project. Idempotent: if this account already has a project for the same domain, the existing one is returned (created: false) instead of a duplicate. Returns the recommended integration for the detected stack.",
    scope: "projects:write",
    readOnly: false,
    input: {
      name: z.string().min(2).max(100).describe("Product name"),
      websiteUrl: z.string().describe("Product website, e.g. https://acme.com — used for duplicate detection and verification"),
      description: z.string().max(500).optional().describe("Short description shown on the public page"),
      category: z.string().optional().describe("Category slug (see usertrack_get_supported_integrations → categories are not needed; any invalid value is rejected)"),
      tags: z.array(z.string()).max(5).optional(),
      logoUrl: z.string().optional(),
      detectedStack: z.array(z.string()).optional().describe("Packages/providers detected in the repo, e.g. ['@clerk/nextjs', 'posthog-js', 'nextjs']"),
    },
    run: (auth, a) => fetchMutation(api.gateway.createProjectTool, { auth, ...a }),
  }),
  tool({
    name: "usertrack_update_project",
    title: "Update project",
    description: "Safe metadata changes: name, description, website, category, tags, logo, slug, publishing (isPublic) and the product profile (markets, tech stack, marketing channels, cofounders, country, funding, team size, founded month, value proposition, problem, audience, pricing model, anonymous mode, hide from search engines). Descriptive only — there are no revenue fields. Never deletes.",
    scope: "projects:write",
    readOnly: false,
    input: {
      ...ref,
      name: z.string().min(2).max(100).optional(),
      description: z.string().max(500).optional(),
      websiteUrl: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).max(5).optional(),
      logoUrl: z.string().optional(),
      newSlug: z.string().optional().describe("Change the public slug (/s/<slug>)"),
      isPublic: z.boolean().optional().describe("true publishes the growth page and makes it eligible for leaderboards"),
      foundedAt: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Founding month YYYY-MM (benchmark age cohorts use it)"),
      markets: z.array(z.string()).max(5).optional().describe(`Up to 5 of: ${MARKETS.map((m) => m.slug).join(", ")}`),
      techStack: z.array(z.string()).max(20).optional().describe("Up to 20 slugs from the curated catalog (react, nextjs, postgresql, stripe, vercel, …); unknown entries are kept as free text without an icon"),
      marketingChannels: z.array(z.string()).max(15).optional().describe(`Up to 15 of: ${MARKETING_CHANNELS.map((c) => c.slug).join(", ")}`),
      cofounders: z.array(z.object({ name: z.string().max(60).optional(), x: z.string().optional(), github: z.string().optional() })).max(5).optional().describe("The owner's own X handle comes from the profile"),
      country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2, e.g. DE"),
      funding: z.enum(["bootstrapped", "vc"]).optional(),
      teamSize: z.enum(["1", "2-5", "6-10", "11-50", "50+"]).optional(),
      valueProposition: z.string().max(300).optional(),
      problemSolved: z.string().max(300).optional(),
      audience: z.string().max(200).optional(),
      pricingSummary: z.string().max(300).optional().describe("Pricing model in words (free tier, per seat, …) — never revenue numbers"),
      additionalInfo: z.string().max(500).optional(),
      anonymous: z.boolean().optional().describe("Hide founder identity, cofounders, logo, website and store links on every public surface"),
      hideFromSearch: z.boolean().optional().describe("noindex the public page and drop it from the sitemap; boards and the API still list it"),
    },
    run: (auth, { foundedAt, ...a }) => fetchMutation(api.gateway.updateProjectTool, { auth, ...a, foundedAt: foundedAt ? Date.UTC(Number(foundedAt.slice(0, 4)), Number(foundedAt.slice(5, 7)) - 1, 1) : undefined }),
  }),
  tool({
    name: "usertrack_import_from_trustmrr",
    title: "Import from TrustMRR",
    description: "Prefill a product profile from its TrustMRR startup page: name, description, website, logo, category, markets, tech stack, marketing channels, cofounders, country, funding, team size, founded month, value proposition, problem, audience, pricing model. Revenue, MRR, prices and growth figures are never read or returned. Without a project ref it only returns { prefill, unmapped, source }; with projectId/slug and apply: true it fills the project's empty fields (overwrite: true replaces them) through the same update path as usertrack_update_project and links the TrustMRR slug. Uses the deployment's operator key — `not_configured` when none is set; 5 imports per founder per 10 minutes.",
    scope: "projects:write",
    readOnly: false,
    input: {
      ...ref,
      urlOrSlug: z.string().min(1).describe("https://trustmrr.com/startup/<slug> or the bare slug"),
      apply: z.boolean().optional().describe("Apply the prefill to the referenced project (default: preview only)"),
      overwrite: z.boolean().optional().describe("With apply: replace fields that already have a value (default: fill empty fields only)"),
    },
    run: (auth, a) => fetchAction(api.gateway.importFromTrustmrr, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_supported_integrations",
    title: "Supported integrations",
    description: "Catalog of supported data sources (native SDK for Better Auth / Prisma / Drizzle / Convex / Auth.js / custom apps, Supabase, Clerk, Firebase, Auth0, PostgreSQL read-only, PostHog, Plausible, GA4, Stripe, RevenueCat, Paddle, Lemon Squeezy, Chargebee, JSON endpoint, manual) with roles (users | activation | traffic | conversion), trust level, required credentials and what is read. Pass what you detected to get a lifecycle recommendation.",
    scope: "integrations:read",
    readOnly: true,
    input: detectInput,
    run: (auth, a) => fetchQuery(api.gateway.supportedIntegrations, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_integration_setup",
    title: "Integration setup instructions",
    description: "Structured, executable setup instructions for one provider: requirements, least-privilege permissions, ordered steps, code templates, security rules, the exact configure call and the verification call. Follow it step by step.",
    scope: "integrations:read",
    readOnly: true,
    input: {
      ...ref,
      provider: z.enum(PROVIDERS).describe("better_auth is a deprecated alias of native"),
      role: z.enum(ROLES).optional().describe("users (default) | activation | traffic | conversion"),
      framework: z.string().optional(),
      detectedProviders: z.array(z.string()).optional(),
    },
    run: (auth, a) => fetchQuery(api.gateway.setupInstructions, { auth, ...a }),
  }),
  tool({
    name: "usertrack_configure_integration",
    title: "Configure integration",
    description: "Store a data-source configuration for a project and start the first sync. Secrets are validated, stored server-side and never returned to the dashboard, the API or an agent. Re-running replaces the source for that role (idempotent).",
    scope: "integrations:write",
    readOnly: false,
    input: {
      ...ref,
      provider: z.enum(PROVIDERS),
      role: z.enum(ROLES).optional(),
      config: z.record(z.string(), z.unknown()).describe("Provider config exactly as described by usertrack_get_integration_setup.configShape"),
    },
    run: (auth, a) => fetchMutation(api.gateway.configureIntegration, { auth, ...a }),
  }),
  tool({
    name: "usertrack_verify_integration",
    title: "Verify integration",
    description: "Live connection test. Uses the stored config, or pass provider+config to test before saving. Returns connected/failed, detected user count, verification level and an actionable error. Cooldown: 20s per project.",
    scope: "integrations:write",
    readOnly: false,
    input: {
      ...ref,
      role: z.enum(ROLES).optional(),
      provider: z.enum(PROVIDERS).optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    },
    run: (auth, a) => fetchAction(api.gateway.verifyIntegration, { auth, ...a }),
  }),
  tool({
    name: "usertrack_sync_project",
    title: "Sync now",
    description: "Trigger an immediate sync of the project's data sources (60s cooldown per source). Results land within seconds.",
    scope: "integrations:write",
    readOnly: false,
    input: { ...ref, role: z.enum(ROLES).optional() },
    run: (auth, a) => fetchMutation(api.gateway.syncProject, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_metrics",
    title: "Get metrics",
    description: "Growth summary for one project: total users, new users in the window vs the previous window, growth %, activation, retention, leaderboard/trending ranks with movement, recent milestones.",
    scope: "metrics:read",
    readOnly: true,
    input: { ...ref, timeframe: z.enum(TIMEFRAMES).optional().describe("24h | 7d (default) | 30d") },
    run: (auth, a) => fetchQuery(api.gateway.metrics, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_growth_history",
    title: "Growth history",
    description: "Graph-ready time series (totalUsers, newUsers, activatedUsers, visitors) for a range.",
    scope: "metrics:read",
    readOnly: true,
    input: { ...ref, range: z.enum(RANGES).optional().describe("24h | 7d | 30d (default) | 90d | 1y | all") },
    run: (auth, a) => fetchQuery(api.gateway.history, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_rank",
    title: "Get rank",
    description: "Current leaderboard and trending positions, previous positions, best rank, and whether the project is eligible (and why not).",
    scope: "metrics:read",
    readOnly: true,
    input: ref,
    run: (auth, a) => fetchQuery(api.gateway.rank, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_milestones",
    title: "Get milestones",
    description: "Achieved milestones (user counts, best day, top-10, streaks) with share page and share image URLs — everything needed to write a launch post.",
    scope: "metrics:read",
    readOnly: true,
    input: { ...ref, limit: z.number().int().min(1).max(50).optional() },
    run: (auth, a) => fetchQuery(api.gateway.milestones, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_share_url",
    title: "Share URLs",
    description: "Public project page, founder profile, badge, OG image, share cards per metric and recent milestone shares.",
    scope: "metrics:read",
    readOnly: true,
    input: ref,
    run: (auth, a) => fetchQuery(api.gateway.shareUrls, { auth, ...a }),
  }),
];

const TOOLS_V04: Tool[] = [
  tool({
    name: "usertrack_get_provider_recommendation",
    title: "Provider recommendation",
    description: "Given what you detected in the repo (packages, env vars, framework, project type), returns the lifecycle composition: the users source in priority order (Better Auth via the official @usertrack/better-auth plugin, then Supabase, Clerk, Firebase, Auth0, PostgreSQL, then the universal JSON endpoint) plus optional activation, traffic and conversion sources, with reasoning, detected auth methods and the stages that will be available. Mobile example: Firebase Auth + Sign in with Apple + PostHog + RevenueCat → Signed up: Firebase, Activated: PostHog, Trial/Converted: RevenueCat (Sign in with Apple is an auth method, never the users source). Call before creating or configuring.",
    scope: "integrations:read",
    readOnly: true,
    input: detectInput,
    run: (auth, a) => fetchQuery(api.gateway.providerRecommendation, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_activation_setup",
    title: "Activation setup",
    description: "How to track activated users (the first meaningful value in the product) for a project: definition, example events, a ranking of your candidateEvents (outcome events such as first_*, *_created, *_completed, onboarding_completed win; $pageview, app_open, session_start, login, signup, $identify, click, screen_view are rejected with a reason), the recommended source given the detected stack (PostHog event, Supabase/Postgres table or SQL, endpoint) and the exact next calls. Optional step after the users source works.",
    scope: "integrations:read",
    readOnly: true,
    input: { ...ref, detectedProviders: z.array(z.string()).optional(), candidateEvents: z.array(z.string()).optional().describe("Event names found in the repo, e.g. from posthog.capture(...) calls") },
    run: (auth, a) => fetchQuery(api.gateway.activationSetup, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_funnel",
    title: "Get funnel",
    description: "Lifecycle funnel Reached → Signed up → Activated → Trial → Converted for one project over 7d / 30d / 90d: per-stage counts, conversion from the previous stage, previous-window comparison, strategic rates (Signup → Converted, Activated → Converted, Trial → Converted), per-stage provenance, freshness and health. basis is 'aggregate' (period ratios); identityQuality (aggregate_only | partially_mapped | cohort_verified) says whether the same users can be traced across stages — use usertrack_get_cohorts for the cohort view. Only stages with a connected source are returned; missingStages + hint say what to connect next.",
    scope: "metrics:read",
    readOnly: true,
    input: { ...ref, timeframe: z.enum(["7d", "30d", "90d"]).optional() },
    run: (auth, a) => fetchQuery(api.gateway.funnel, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_trending",
    title: "Get trending",
    description: "The public trending board (24h / 7d / 30d, optional category) with scores, ranks, movement and a one-line explanation per product; pass a project to also get its own position and score factors.",
    scope: "metrics:read",
    readOnly: true,
    input: { ...ref, window: z.enum(["24h", "7d", "30d"]).optional(), category: z.string().optional(), limit: z.number().int().min(1).max(50).optional() },
    run: (auth, a) => fetchQuery(api.gateway.trending, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_benchmark",
    title: "Get benchmarks",
    description: "Where the project stands against cohorts (all SaaS, its category, products its size): percentile, median, p10–p90 range, multiple of the median and a plain-language insight per metric. Cohorts below the minimum size are omitted.",
    scope: "metrics:read",
    readOnly: true,
    input: ref,
    run: (auth, a) => fetchQuery(api.gateway.benchmark, { auth, ...a }),
  }),
  tool({
    name: "usertrack_compare_projects",
    title: "Compare projects",
    description: "Compare 2–4 public products (any slugs, not only your own) over 7 / 30 / 90 / 365 days or all history: current metrics, window growth and daily series in absolute and indexed (100 at start) form, plus the shareable /compare URL.",
    scope: "metrics:read",
    readOnly: true,
    input: { slugs: z.array(z.string()).min(2).max(4), days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365), z.literal(0)]).optional().describe("0 = all shared history") },
    run: (auth, a) => fetchQuery(api.gateway.compareProjects, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_share_card",
    title: "Share card",
    description: "Share page + image URLs (1200×630 and 1080×1080) for a card kind — users, growth (30d), week (7d), rank, trending, activation, milestone-<id> — plus an X intent link. Everything needed to post growth on social.",
    scope: "metrics:read",
    readOnly: true,
    input: { ...ref, kind: z.string().optional() },
    run: (auth, a) => fetchQuery(api.gateway.shareCard, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_embed_code",
    title: "Embed code",
    description: "Copy-paste embed code. format 'widget' (recommended for websites): a live iframe widget via one <script> tag (types: users = live user count, growth = growth %, verified = Verified by UserTrack, chart = mini chart; theme auto/dark/light; 7d/30d) that refreshes every 5 minutes and links back to the growth page. format 'badge' (default, for READMEs): static SVG HTML/Markdown (types: users, growth, trending, verified, chart; dark/light; compact). Public metrics only, no API key involved.",
    scope: "metrics:read",
    readOnly: true,
    input: { ...ref, format: z.enum(["badge", "widget"]).optional(), type: z.enum(["users", "growth", "trending", "verified", "chart"]).optional(), theme: z.enum(["auto", "dark", "light"]).optional(), window: z.enum(["7d", "30d"]).optional(), compact: z.boolean().optional() },
    run: (auth, a) => fetchQuery(api.gateway.embedCode, { auth, ...a }),
  }),
];
TOOLS.push(...TOOLS_V04);

const TOOLS_LIFECYCLE: Tool[] = [
  tool({
    name: "usertrack_get_conversion_setup",
    title: "Conversion setup",
    description: "How to add the Trial and Converted stages from a payment provider (Stripe, RevenueCat, Paddle, Lemon Squeezy, Chargebee or a JSON endpoint): the recommended definition of 'converted' (active_paid default, ever_paid, first_payment), least-privilege read-only credential, identity matching (metadata.userId / app_user_id / custom_data.userId), privacy rules and the exact configure + verify calls with role 'conversion'. Payment providers are read for conversion state only — never amounts, prices, invoices or MRR. Optional; private by default.",
    scope: "integrations:read",
    readOnly: true,
    input: { ...ref, provider: z.enum(["stripe", "revenuecat", "paddle", "lemonsqueezy", "chargebee", "endpoint"]).optional().describe("Omit to pick from detectedProviders (revenuecat > stripe > paddle > lemonsqueezy > chargebee > endpoint)"), detectedProviders: z.array(z.string()).optional(), projectType: z.enum(PROJECT_TYPES).optional() },
    run: (auth, a) => fetchQuery(api.gateway.conversionSetup, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_identity_mapping",
    title: "Identity mapping",
    description: "How to carry one stable user id across the identity source (Firebase uid, Supabase auth id, Clerk userId…), the analytics source (posthog.identify) and the conversion source (Stripe metadata.userId, RevenueCat app_user_id, Paddle custom_data.userId, Chargebee meta_data.userId) so UserTrack can trace signup cohorts to activation and conversion. Explains how ids are salted + hashed, the identity quality levels and the Cohort Verified thresholds. Never send emails, names or phone numbers.",
    scope: "integrations:read",
    readOnly: true,
    input: { ...ref, identitySource: z.string().optional().describe("Defaults to the project's users source"), analyticsSource: z.string().optional(), conversionSource: z.string().optional(), projectType: z.enum(PROJECT_TYPES).optional() },
    run: (auth, a) => fetchQuery(api.gateway.identityMapping, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_funnel_history",
    title: "Funnel history",
    description: "Daily history of the strategic rates (Signup → Activated, Signup → Converted, Activated → Converted, Trial → Converted) as trailing-7-day ratios for 14–365 days. Graph-ready.",
    scope: "metrics:read",
    readOnly: true,
    input: { ...ref, days: z.number().int().min(14).max(365).optional().describe("Default 90") },
    run: (auth, a) => fetchQuery(api.gateway.funnelHistory, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_cohorts",
    title: "Get cohorts",
    description: "Monthly signup cohorts traced through the lifecycle from pseudonymous identities: signed up, activated (+ D7), trial, converted (+ D30), rates, median time to activation / conversion, plus identityQuality, coverage and an explanation. Empty until sources report identities (see usertrack_get_identity_mapping).",
    scope: "metrics:read",
    readOnly: true,
    input: ref,
    run: (auth, a) => fetchQuery(api.gateway.cohorts, { auth, ...a }),
  }),
];
TOOLS.push(...TOOLS_LIFECYCLE);

const nativeSetupInput = {
  ...ref,
  packageManager: z.enum(["npm", "pnpm", "yarn", "bun"]).optional().describe("Detected from the lockfile: package-lock.json → npm, pnpm-lock.yaml → pnpm, yarn.lock → yarn, bun.lock(b) → bun"),
  betterAuthVersion: z.string().optional().describe("Installed better-auth version from package.json / lockfile, e.g. '1.6.22' (Better Auth only)"),
  framework: z.string().optional(),
  authConfigPath: z.string().optional().describe("Path of the file that calls betterAuth({...}) / NextAuth({...}), if already located"),
};
const TOOLS_NATIVE: Tool[] = [
  tool({
    name: "usertrack_get_native_setup",
    title: "Native SDK setup",
    description: "Structured install plan for a native UserTrack source — the app itself answers signed aggregate requests (verified, no credentials shared). source: better-auth (official plugin @usertrack/better-auth: append userTrack() to the existing plugins array), prisma / drizzle / convex / authjs / custom (@usertrack/node: one route file exporting createUserTrackHandler with a count source; optional activation and conversion sources; optional push hook). Returns the install command for your package manager, the exact files to add (route, optional push hook, .env.example), env vars USERTRACK_PROJECT_ID / USERTRACK_SECRET, code-modification safety rules, what is sent (aggregate counts, no PII), steps and the verify call. Pass the project to get its state; the secret itself only comes from usertrack_create_integration.",
    scope: "integrations:read",
    readOnly: true,
    input: { source: z.enum(NATIVE_SOURCES).optional().describe("SDK adapter; defaults to the project's existing integration or better-auth"), ...nativeSetupInput },
    run: (auth, a) => fetchQuery(api.gateway.nativeSetupPlan, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_better_auth_setup",
    title: "Better Auth plugin setup (deprecated)",
    description: "Deprecated alias of usertrack_get_native_setup { source: \"better-auth\" }: install plan for the official UserTrack plugin for Better Auth (@usertrack/better-auth). Prefer usertrack_get_native_setup.",
    scope: "integrations:read",
    readOnly: true,
    input: nativeSetupInput,
    run: (auth, a) => fetchQuery(api.gateway.nativeSetupPlan, { auth, source: "better-auth", ...a }),
  }),
  tool({
    name: "usertrack_create_integration",
    title: "Create native integration",
    description: "Create the native SDK integration for a project and receive its credential: USERTRACK_PROJECT_ID and the USERTRACK_SECRET (ut_int_…). The secret is returned ONLY in this response — put it into the app's environment immediately, never print, log or commit it. Idempotent: an existing integration is returned without a secret (secret: null); pass rotate: true to issue a new secret (the old one stops working). Then install the package (usertrack_get_native_setup), deploy and call usertrack_verify_integration. Activation and conversion roles reported by the same handler are attached automatically after the first sync.",
    scope: "integrations:write",
    readOnly: false,
    input: {
      ...ref,
      provider: z.enum(["native", "better_auth"]).describe("native — only native sources have UserTrack-generated credentials (better_auth is a deprecated alias of native + source better-auth); other providers use usertrack_configure_integration"),
      source: z.enum(NATIVE_SOURCES).optional().describe("SDK adapter: better-auth | prisma | drizzle | convex | authjs | custom (default: better-auth for provider better_auth, else custom)"),
      url: z.string().optional().describe("Public base URL where the app answers: Better Auth baseURL + basePath (default <websiteUrl>/api/auth); otherwise where the handler is mounted (default <websiteUrl>/api/usertrack, metrics at <base>/metrics); Convex: the .convex.site URL"),
      rotate: z.boolean().optional().describe("Issue a new secret, invalidating the previous one"),
    },
    run: (auth, a) => fetchMutation(api.gateway.createIntegrationTool, { auth, ...a }),
  }),
];
TOOLS.push(...TOOLS_NATIVE);

const TOOLS_SHARE: Tool[] = [
  tool({
    name: "usertrack_get_profile",
    title: "Get founder profile",
    description: "The founder's public profile (name, username, bio, links, X handle + connection state, location, visibility), founder-level aggregates across public projects (total users, new users 30d, weighted activation rate, best rank, trending count, biggest-growth project — formulas included), the public project list and the profile / card / API URLs.",
    scope: "profile:read",
    readOnly: true,
    input: {},
    run: (auth) => fetchQuery(api.gateway.profileTool, { auth }),
  }),
  tool({
    name: "usertrack_export_account",
    title: "Export account data",
    description: "GDPR Art. 20 export of everything UserTrack stores about this account as one JSON document: account, founder profile, projects with settings, integrations (public configuration only — never credentials), milestones, follows, webhook endpoints (secrets masked), developer tokens (masked), email preferences, X connection summary. Same document as the 'Download my data' button in Settings. Deleting the account is deliberately not available through MCP.",
    scope: "profile:read",
    readOnly: true,
    input: {},
    run: (auth) => fetchQuery(api.gateway.exportAccountTool, { auth }),
  }),
  tool({
    name: "usertrack_update_profile",
    title: "Update founder profile",
    description: "Edit the founder profile: displayName, bio (≤160), website (https), x (accepts '@name', 'name' or an x.com URL — stored canonically as 'name'), github, linkedin, location, avatarUrl (https), profilePublic. Only the fields you pass change. Never touches tokens or the username.",
    scope: "profile:write",
    readOnly: false,
    input: {
      displayName: z.string().min(2).max(60).optional(),
      bio: z.string().max(160).optional(),
      website: z.string().optional(),
      x: z.string().optional().describe("X / Twitter handle, with or without @"),
      github: z.string().optional(),
      linkedin: z.string().optional(),
      location: z.string().max(60).optional(),
      avatarUrl: z.string().optional(),
      profilePublic: z.boolean().optional().describe("false hides /u/<username> from the public, search and the API"),
    },
    run: (auth, a) => fetchMutation(api.gateway.updateProfileTool, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_share_events",
    title: "Share-ready events",
    description: "Share-ready events for this account (optionally one project): significant milestones, records, rank achievements, spikes and top-10% benchmarks that UserTrack turned into cards automatically. Each comes with score (strongest first), card URLs (page, 1200×630 image, 1080×1080 square) and an X draft + intent link. Use `strongest` to answer 'my best milestone this month'.",
    scope: "metrics:read",
    readOnly: true,
    input: { ...ref, status: z.enum(["ready", "shared", "dismissed"]).optional().describe("Default ready"), limit: z.number().int().min(1).max(100).optional() },
    run: (auth, a) => fetchQuery(api.gateway.shareEventsTool, { auth, ...a }),
  }),
  tool({
    name: "usertrack_create_share_card",
    title: "Create share card",
    description: "Build a share card configuration and get its deterministic PNG URLs: pass a project + kind (users, growth, week, rank, trending, activation, conversion, benchmark, milestone-<id>, spike-<id>) or a shareEventId, plus optional style (blueprint | aurora | minimal), size (og | square), range (7d | 30d | 90d | 1y | all, for the chart), chart / logo / founder / verified / dates toggles and a short custom title. Returns page, image and square URLs, the X draft and the verification wording. Referencing a share event marks it as shared.",
    scope: "profile:write",
    readOnly: false,
    input: {
      ...ref,
      kind: z.string().optional(),
      shareEventId: z.string().optional(),
      style: z.enum(CARD_STYLES).optional(),
      size: z.enum(["og", "square"]).optional(),
      range: z.enum(CARD_RANGES).optional(),
      chart: z.boolean().optional(),
      logo: z.boolean().optional(),
      founder: z.boolean().optional().describe("Show the founder's @handle on the card"),
      verified: z.boolean().optional().describe("Show the 'Verified by UserTrack' / 'Tracked on UserTrack' line"),
      dates: z.boolean().optional(),
      title: z.string().max(60).optional(),
    },
    run: (auth, a) => fetchMutation(api.gateway.createShareCardTool, { auth, ...a, shareEventId: a.shareEventId as Id<"shareEvents"> | undefined }),
  }),
  tool({
    name: "usertrack_get_x_draft",
    title: "X post draft",
    description: "A concise, data-driven X post for a share event or a card kind (users, growth, week, rank, trending, activation), with the share URL and a ready x.com intent link. Wording rotates per event and only says 'verified' for verified sources.",
    scope: "metrics:read",
    readOnly: true,
    input: { ...ref, shareEventId: z.string().optional(), kind: z.string().optional() },
    run: (auth, a) => fetchQuery(api.gateway.xDraftTool, { auth, ...a, shareEventId: a.shareEventId as Id<"shareEvents"> | undefined }),
  }),
  tool({
    name: "usertrack_get_founder_url",
    title: "Founder URLs",
    description: "Public founder profile URL (/u/<username>), the founder card PNG, the OG image and the public API endpoints for the profile and its aggregate history.",
    scope: "profile:read",
    readOnly: true,
    input: {},
    run: (auth) => fetchQuery(api.gateway.founderUrlTool, { auth }),
  }),
];
TOOLS.push(...TOOLS_SHARE);

const WEBHOOK_EVENT_TYPES = WEBHOOK_EVENTS.map((e) => e.type) as [string, ...string[]];
const WINDOWS = DATASET_WINDOWS;
const DATASET_TOOL_NAMES = ["trending", "fastest-growing", "new-and-rising", "hidden-gems", "movers", "category", "rankings"] as const;
const endpointId = z.string().describe("Webhook endpoint id (from usertrack_get_webhooks)");

const TOOLS_V09: Tool[] = [
  tool({
    name: "usertrack_discover",
    title: "Discover",
    description: "Public discovery sections in one call — trending, fastest growing, new & rising, hidden gems, biggest movers (7-day leaderboard climbs) and mobile — plus the activity feed and the public hidden-gem / new-rising rules. Optional category and window. Public data, not owner-scoped; requires metrics:read.",
    scope: "metrics:read",
    readOnly: true,
    input: { category: z.string().optional().describe("Category slug, e.g. 'developer-tools'"), window: z.enum(WINDOWS).optional().describe("24h | 7d (default) | 30d for the trending and fastest sections") },
    run: (auth, a) => fetchQuery(api.gateway.discover, { auth, ...a }),
  }),
  tool({
    name: "usertrack_follow_project",
    title: "Follow project",
    description: "Add a public product to the founder's watchlist by slug or project id. Idempotent: following an already-followed product returns created: false. Requires follows:write.",
    scope: "follows:write",
    readOnly: false,
    input: { slug: z.string().optional().describe("Public project slug, e.g. 'acme'"), projectId: z.string().optional().describe("Project id — slug or projectId is required") },
    run: (auth, a) => fetchMutation(api.gateway.followTool, { auth, targetType: "saas", slug: a.slug, targetId: a.projectId }),
  }),
  tool({
    name: "usertrack_unfollow_project",
    title: "Unfollow project",
    description: "Remove a product from the founder's watchlist by slug or project id. Safe to repeat (removed: false when it was not followed). Requires follows:write.",
    scope: "follows:write",
    readOnly: false,
    input: { slug: z.string().optional(), projectId: z.string().optional() },
    run: (auth, a) => fetchMutation(api.gateway.unfollowTool, { auth, targetType: "saas", slug: a.slug, targetId: a.projectId }),
  }),
  tool({
    name: "usertrack_follow_founder",
    title: "Follow founder",
    description: "Follow a public founder by username (with or without @): every public project they publish lands on the watchlist and in the personal feed. Idempotent. Requires follows:write.",
    scope: "follows:write",
    readOnly: false,
    input: { username: z.string().describe("Founder username, e.g. 'jane' or '@jane'") },
    run: (auth, a) => fetchMutation(api.gateway.followTool, { auth, targetType: "profile", username: a.username }),
  }),
  tool({
    name: "usertrack_unfollow_founder",
    title: "Unfollow founder",
    description: "Stop following a founder by username. Safe to repeat. Requires follows:write.",
    scope: "follows:write",
    readOnly: false,
    input: { username: z.string() },
    run: (auth, a) => fetchMutation(api.gateway.unfollowTool, { auth, targetType: "profile", username: a.username }),
  }),
  tool({
    name: "usertrack_get_watchlist",
    title: "Get watchlist",
    description: "Everything the founder follows: products (direct follows plus public projects of followed founders) with 7-day leaderboard / trending movement, followed founders, and the personal feed (milestones, spikes, launches, verifications, rank jumps, benchmarks) for the last days. Requires follows:read.",
    scope: "follows:read",
    readOnly: true,
    input: { days: z.number().int().min(1).max(90).optional().describe("Feed window, default 30"), limit: z.number().int().min(1).max(200).optional().describe("Feed length, default 60") },
    run: (auth, a) => fetchQuery(api.gateway.watchlist, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_rank_history",
    title: "Rank history",
    description: "Stored daily leaderboard or trending positions of one owned project (private projects included): one point per UTC day since the project was first ranked, plus current, best and 7-days-ago position with the 7-day movement. Graph-ready. Requires metrics:read.",
    scope: "metrics:read",
    readOnly: true,
    input: { ...ref, kind: z.enum(["leaderboard", "trending"]).optional().describe("leaderboard (default, 30d window) | trending (7d window)"), window: z.enum(WINDOWS).optional(), days: z.number().int().min(7).max(730).optional().describe("Default 90") },
    run: (auth, a) => fetchQuery(api.gateway.rankHistoryTool, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_benchmark_history",
    title: "Benchmark history",
    description: "Weekly benchmark standings of one owned project for the last weeks (private owner view: every cohort and metric, with value and median), plus the current cards' change insights ('Top 12% now, up from Top 27% last month'). Requires metrics:read.",
    scope: "metrics:read",
    readOnly: true,
    input: { ...ref, weeks: z.number().int().min(4).max(52).optional().describe("Default 26") },
    run: (auth, a) => fetchQuery(api.gateway.benchmarkHistoryTool, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_dataset",
    title: "Get dataset",
    description: "A public dataset as rows: trending, fastest-growing, new-and-rising, hidden-gems, movers, category (needs category; any board via board) or rankings (frozen monthly rankings: period YYYY-MM + optional board / category; without period, the list of available periods). Filters: window, category, platform (web | mobile | hybrid), limit (≤100). Returns the JSON and CSV URLs of the same dataset on the public API. Requires metrics:read.",
    scope: "metrics:read",
    readOnly: true,
    input: {
      dataset: z.enum(DATASET_TOOL_NAMES).describe("trending | fastest-growing | new-and-rising | hidden-gems | movers | category | rankings"),
      category: z.string().optional(),
      window: z.enum(WINDOWS).optional(),
      platform: z.enum(PROJECT_TYPES).optional(),
      limit: z.number().int().min(1).max(100).optional().describe("Default 50"),
      period: z.string().optional().describe("rankings only: YYYY-MM"),
      board: z.string().optional().describe("rankings / category only: leaderboard board, default most-new"),
    },
    run: (auth, a) => fetchQuery(api.gateway.dataset, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_webhooks",
    title: "List webhooks",
    description: "The founder's webhook endpoints (URL, subscribed events, project scope, status, masked secret, last delivery), the catalog of event types that can be subscribed to, the endpoint limit and the owned projects an endpoint can be scoped to. Secrets are never returned here. Requires webhooks:read.",
    scope: "webhooks:read",
    readOnly: true,
    input: {},
    run: (auth) => fetchQuery(api.gateway.webhooksList, { auth }),
  }),
  tool({
    name: "usertrack_create_webhook",
    title: "Create webhook",
    description: "Create a webhook endpoint: a public https URL, the event types to receive (milestone.reached, rank.changed, trending.rank_changed, growth.spike, integration.failed, integration.recovered, project.verified), an optional description and an optional project scope. The signing secret (whsec_…) is returned ONLY in this response — hand it to the founder for their environment, never print or log it. Then call usertrack_test_webhook. Requires webhooks:write.",
    scope: "webhooks:write",
    readOnly: false,
    input: {
      url: z.string().describe("Public https URL; localhost, private networks and internal hosts are rejected"),
      events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).describe("Event types to subscribe to"),
      description: z.string().max(120).optional(),
      ...ref,
    },
    run: (auth, a) => fetchMutation(api.gateway.createWebhookTool, { auth, ...a }),
  }),
  tool({
    name: "usertrack_update_webhook",
    title: "Update webhook",
    description: "Change an endpoint's URL, subscribed events, description, status (active | disabled — re-enabling resets the failure counter) or project scope (projectId, or null for all projects). Only the fields you pass change. Requires webhooks:write.",
    scope: "webhooks:write",
    readOnly: false,
    input: {
      endpointId,
      url: z.string().optional(),
      events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).optional(),
      description: z.string().max(120).optional(),
      status: z.enum(["active", "disabled"]).optional(),
      projectId: z.string().nullable().optional().describe("Scope to one owned project (id or slug); null = every project"),
    },
    run: (auth, a) => fetchMutation(api.gateway.updateWebhookTool, { auth, ...a }),
  }),
  tool({
    name: "usertrack_test_webhook",
    title: "Test webhook",
    description: "Send a signed webhook.test event through the normal delivery pipeline (signature headers, retries, delivery log) to one endpoint, regardless of its subscriptions. Returns the delivery id; check the result with usertrack_get_webhook_deliveries. Requires webhooks:write.",
    scope: "webhooks:write",
    readOnly: false,
    input: { endpointId },
    run: (auth, a) => fetchMutation(api.gateway.testWebhookTool, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_webhook_deliveries",
    title: "Webhook deliveries",
    description: "Recent deliveries of one endpoint: event type, attempt, status (pending | success | failed | exhausted), HTTP status, latency, error and next retry time. failedOnly narrows to failed / exhausted deliveries. Response bodies are never stored. Requires webhooks:read.",
    scope: "webhooks:read",
    readOnly: true,
    input: { endpointId, limit: z.number().int().min(1).max(100).optional().describe("Default 25"), failedOnly: z.boolean().optional() },
    run: (auth, a) => fetchQuery(api.gateway.webhookDeliveriesTool, { auth, ...a }),
  }),
];
TOOLS.push(...TOOLS_V09);

export const WEBHOOK_WORKFLOW = [
  "usertrack_get_webhooks (existing endpoints + the event catalog)",
  "usertrack_create_webhook { url, events, projectId? } → the secret is returned once: hand it to the founder for their environment, never log it",
  "usertrack_test_webhook { endpointId } → a signed webhook.test event",
  "usertrack_get_webhook_deliveries { endpointId } → confirm status success (or read the error and fix the receiver)",
];

export const SHARE_WORKFLOW = [
  "usertrack_get_share_events (strongest first; or usertrack_get_milestones for the raw list)",
  "usertrack_create_share_card { shareEventId, style, size, range } → image / square PNG URLs + draft",
  "usertrack_get_x_draft if the founder wants alternative wording; hand back the intent link — never post without an explicit ask",
];

export const SETUP_WORKFLOW = [
  "usertrack_get_account",
  "usertrack_get_provider_recommendation (pass detectedProviders / detectedAuth / detectedAnalytics / detectedPayments + framework + projectType from the repo: native SDK (Better Auth plugin, or @usertrack/node for Auth.js / Convex / Prisma / Drizzle / custom) → Supabase → Clerk → Firebase → PostgreSQL → endpoint for users; Sign in with Apple / Google are auth methods, never the users source)",
  "usertrack_create_project (idempotent by domain)",
  "usertrack_get_integration_setup (recommended provider)",
  "native: usertrack_create_integration { provider: \"native\", source } → usertrack_get_native_setup { source } → install @usertrack/better-auth (add userTrack() to the existing plugins array) or @usertrack/node (add the route file with a count source; optionally activation / conversion sources), set USERTRACK_PROJECT_ID / USERTRACK_SECRET (never commit the secret), typecheck, deploy",
  "other providers: edit the repo only if the instructions say so (endpoint provider), then usertrack_configure_integration",
  "usertrack_verify_integration (wait ~5s, retry ≤3×)",
  "usertrack_update_project { isPublic: true }",
  "optional: usertrack_get_activation_setup → configure an activation source (PostHog event, Supabase/Postgres table) so the funnel shows activated users",
  "optional: usertrack_get_conversion_setup → configure a conversion source with role \"conversion\" (Stripe, RevenueCat, Paddle, Lemon Squeezy, Chargebee or endpoint) for Trial → Converted — payment providers are read for conversion state only, never revenue; private until the founder publishes it",
  "optional: usertrack_get_identity_mapping → carry one user id across sources so cohorts become Cohort Verified",
  "usertrack_get_share_url → hand the public URL to the founder",
];

export const SERVER_INSTRUCTIONS = `UserTrack is the growth data layer for SaaS and apps: public growth pages, leaderboards and lifecycle metrics (Reached → Signed up → Activated → Trial → Converted) fed by read-only data sources. UserTrack tracks users, not revenue.

To add a SaaS repository to UserTrack, run this workflow in order:
${SETUP_WORKFLOW.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Mobile flow ("Add this iOS app to UserTrack"): projectType "mobile"; users from where accounts are stored (Firebase Auth, Supabase, Auth0, a database or a backend JSON endpoint) — Sign in with Apple / Google are auth methods, never the users source; activation from PostHog (identify(uid) + an outcome event); Trial / Converted from RevenueCat (or Stripe / endpoint); then usertrack_update_project with projectType, appStoreUrl / playStoreUrl and authMethods.

Native SDK flow ("Add this project to UserTrack" when the repo owns its user store — Better Auth, Auth.js / NextAuth, Convex, Prisma, Drizzle or a custom database): usertrack_create_project → usertrack_create_integration { provider: "native", source } (the secret is returned once) → usertrack_get_native_setup { source } → install the package with the repo's package manager (@usertrack/better-auth: append userTrack({ projectId: process.env.USERTRACK_PROJECT_ID!, secret: process.env.USERTRACK_SECRET! }) to the existing plugins array without touching other options; @usertrack/node: add app/api/usertrack/metrics/route.ts exporting createUserTrackHandler with a users count source, optionally activation / conversion), add both variables to .env.example and the local env, typecheck, deploy → usertrack_verify_integration → usertrack_sync_project → usertrack_get_share_url.

Share flow ("Create a share card for my best milestone this month"): ${SHARE_WORKFLOW.join(" → ")}. Founder identity: usertrack_get_profile / usertrack_update_profile (X handle accepted as @name or name), usertrack_get_founder_url for the public profile.

Discovery & watchlist flow ("What is trending in developer tools?", "Follow the products I compete with"): usertrack_discover { category?, window? } or usertrack_get_dataset { dataset } for public rows → usertrack_follow_project { slug } / usertrack_follow_founder { username } (idempotent) → usertrack_get_watchlist { days } for movement and the personal feed; usertrack_get_rank_history / usertrack_get_benchmark_history for the founder's own projects over time.

Webhook flow ("Notify my Slack when we hit a milestone"): ${WEBHOOK_WORKFLOW.join(" → ")}. Endpoints must be public https URLs; the secret signs every payload (UserTrack-Signature = v1=hex(HMAC-SHA256(secret, timestamp.body))) and is shown only at creation or rotation.

Rules: never print or log credentials; prefer verified providers over manual numbers; only aggregate counts are ever sent to UserTrack; payment providers are read for conversion state only, never revenue (no amounts, prices, invoices or MRR); never send emails, names or phone numbers — identities are stable ids only; ask the founder for any credential you cannot find in the repo's env files.`;
