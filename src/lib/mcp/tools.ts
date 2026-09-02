// The UserTrack MCP tool set. Each tool is a thin, typed adapter over one Convex gateway function.
import { z } from "zod";
import { fetchAction, fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { RANGES } from "@convex/lib/time";
import { TIMEFRAMES } from "@convex/domain/metrics";
import type { Scope } from "@convex/lib/tokens";

type Auth = { hash: string; gateway?: string };
const ROLES = ["users", "activation", "traffic", "revenue"] as const;
const PROVIDERS = ["clerk", "supabase", "firebase", "auth0", "posthog", "plausible", "ga4", "stripe", "postgres", "endpoint", "manual"] as const;

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
      name: z.string().min(2).max(60).describe("Product name"),
      websiteUrl: z.string().describe("Product website, e.g. https://acme.com — used for duplicate detection and verification"),
      description: z.string().max(160).optional().describe("One-line description shown on the public page"),
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
    description: "Safe metadata changes: name, description, website, category, tags, logo, slug, and publishing (isPublic). Never deletes.",
    scope: "projects:write",
    readOnly: false,
    input: {
      ...ref,
      name: z.string().min(2).max(60).optional(),
      description: z.string().max(160).optional(),
      websiteUrl: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).max(5).optional(),
      logoUrl: z.string().optional(),
      newSlug: z.string().optional().describe("Change the public slug (/s/<slug>)"),
      isPublic: z.boolean().optional().describe("true publishes the growth page and makes it eligible for leaderboards"),
    },
    run: (auth, a) => fetchMutation(api.gateway.updateProjectTool, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_supported_integrations",
    title: "Supported integrations",
    description: "Catalog of supported data sources (Supabase, Clerk, Firebase, Auth0, PostgreSQL read-only, PostHog, Plausible, GA4, Stripe, JSON endpoint, manual) with roles, trust level, required credentials and what is read. Pass what you detected to get a recommendation.",
    scope: "integrations:read",
    readOnly: true,
    input: {
      detectedProviders: z.array(z.string()).optional().describe("e.g. ['supabase', 'posthog', 'prisma']"),
      framework: z.string().optional().describe("e.g. 'nextjs', 'express', 'rails'"),
    },
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
      provider: z.enum(PROVIDERS),
      role: z.enum(ROLES).optional().describe("users (default) | activation | traffic | revenue"),
      framework: z.string().optional(),
      detectedProviders: z.array(z.string()).optional(),
    },
    run: (auth, a) => fetchQuery(api.gateway.setupInstructions, { auth, ...a }),
  }),
  tool({
    name: "usertrack_configure_integration",
    title: "Configure integration",
    description: "Store a data-source configuration for a project and start the first sync. Secrets are validated, encrypted at rest and never returned. Re-running replaces the source for that role (idempotent).",
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
    description: "Given what you detected in the repo (packages, env vars, framework), returns the best UserTrack integration path in priority order — Supabase, Clerk, Firebase, PostgreSQL, then the universal JSON endpoint — with reasoning and optional extras (activation, traffic, revenue). Call before creating or configuring.",
    scope: "integrations:read",
    readOnly: true,
    input: {
      detectedProviders: z.array(z.string()).optional().describe("e.g. ['@supabase/supabase-js', 'posthog-js', 'DATABASE_URL']"),
      framework: z.string().optional(),
    },
    run: (auth, a) => fetchQuery(api.gateway.providerRecommendation, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_activation_setup",
    title: "Activation setup",
    description: "How to track activated users (the first meaningful value in the product) for a project: definition, example events, recommended source given the detected stack (PostHog event, Supabase/Postgres table or SQL, endpoint) and the exact next calls. Optional step after the users source works.",
    scope: "integrations:read",
    readOnly: true,
    input: { ...ref, detectedProviders: z.array(z.string()).optional(), candidateEvents: z.array(z.string()).optional().describe("Event names found in the repo, e.g. from posthog.capture(...) calls") },
    run: (auth, a) => fetchQuery(api.gateway.activationSetup, { auth, ...a }),
  }),
  tool({
    name: "usertrack_get_funnel",
    title: "Get funnel",
    description: "Visitors → Signups → Activated → Paying for one project over 7d / 30d / 90d with conversion rates, previous-window comparison and per-stage provenance. Only stages with a connected source are returned.",
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
    description: "Copy-paste HTML and Markdown for a live badge or mini growth chart (types: users, growth, trending, verified, chart; dark/light; 7d/30d; compact). Public metrics only, cached, no API key involved.",
    scope: "metrics:read",
    readOnly: true,
    input: { ...ref, type: z.enum(["users", "growth", "trending", "verified", "chart"]).optional(), theme: z.enum(["dark", "light"]).optional(), window: z.enum(["7d", "30d"]).optional(), compact: z.boolean().optional() },
    run: (auth, a) => fetchQuery(api.gateway.embedCode, { auth, ...a }),
  }),
];
TOOLS.push(...TOOLS_V04);

export const SETUP_WORKFLOW = [
  "usertrack_get_account",
  "usertrack_get_provider_recommendation (pass detectedProviders + framework from the repo: Supabase → Clerk → Firebase → PostgreSQL → endpoint)",
  "usertrack_create_project (idempotent by domain)",
  "usertrack_get_integration_setup (recommended provider)",
  "edit the repo only if the instructions say so (endpoint provider)",
  "usertrack_configure_integration",
  "usertrack_verify_integration (wait ~5s, retry ≤3×)",
  "usertrack_update_project { isPublic: true }",
  "optional: usertrack_get_activation_setup → configure an activation source (PostHog event, Supabase/Postgres table) so the funnel shows activated users",
  "usertrack_get_share_url → hand the public URL to the founder",
];

export const SERVER_INSTRUCTIONS = `UserTrack is the growth data layer for SaaS: public growth pages, leaderboards and metrics fed by read-only data sources.

To add a SaaS repository to UserTrack, run this workflow in order:
${SETUP_WORKFLOW.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Rules: never print or log credentials; prefer verified providers over manual numbers; only aggregate counts are ever sent to UserTrack; ask the founder for any credential you cannot find in the repo's env files.`;
