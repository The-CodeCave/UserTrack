// OpenAPI 3.1 description of the public API. Kept in code so it can never drift from the routes.
import { SITE_URL } from "@/lib/site";
import { PLANS } from "@convex/lib/tokens";

const RANGES = ["24h", "7d", "30d", "90d", "1y", "all"];
const BOARDS = ["trending", "fastest", "most-users", "most-new", "most-activated", "activation-rate", "new-rising", "best-conversion", "best-trial-conversion", "converted-growth"];

const envelope = (ref: string) => ({ type: "object", required: ["data", "meta"], properties: { data: { $ref: ref }, meta: { $ref: "#/components/schemas/Meta" } } });
const errorRes = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });
const okRes = (ref: string, description = "OK") => ({ description, content: { "application/json": { schema: envelope(ref) } }, headers: { "X-RateLimit-Limit": { schema: { type: "integer" } }, "X-RateLimit-Remaining": { schema: { type: "integer" } }, "X-RateLimit-Window": { schema: { type: "string", enum: ["minute", "day"] } } } });
const slugParam = { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "usertrack" };
const std = { 401: errorRes("Invalid, revoked or expired API key"), 404: errorRes("Not found"), 429: errorRes("Rate limited (see Retry-After)") };

export function openapi() {
  return {
    openapi: "3.1.0",
    info: {
      title: "UserTrack Public API",
      version: "1.0.0",
      description: "Read-only growth data for every public SaaS on UserTrack: profiles, metrics, history, milestones, leaderboards and founder profiles. Free. Anonymous: 60 req/min per IP. With an API key (ut_api_…): 1,000 req/day.",
      contact: { url: `${SITE_URL}/developers` },
    },
    servers: [{ url: `${SITE_URL}/api/v1` }],
    security: [{}, { ApiKey: [] }],
    tags: [{ name: "saas" }, { name: "leaderboard" }, { name: "discover" }, { name: "users" }],
    paths: {
      "/saas/{slug}": { get: { tags: ["saas"], operationId: "getSaas", summary: "Public SaaS profile with metrics, ranks and milestones", parameters: [slugParam], responses: { 200: okRes("#/components/schemas/Saas"), ...std } } },
      "/saas/{slug}/metrics": { get: { tags: ["saas"], operationId: "getSaasMetrics", summary: "Compact current growth metrics", parameters: [slugParam], responses: { 200: okRes("#/components/schemas/Metrics"), ...std } } },
      "/saas/{slug}/history": { get: { tags: ["saas"], operationId: "getSaasHistory", summary: "Historical growth series", parameters: [slugParam, { name: "range", in: "query", schema: { type: "string", enum: RANGES, default: "30d" } }], responses: { 200: okRes("#/components/schemas/History"), 400: errorRes("Invalid range"), ...std } } },
      "/saas/{slug}/milestones": { get: { tags: ["saas"], operationId: "getSaasMilestones", summary: "Public milestones", parameters: [slugParam], responses: { 200: okRes("#/components/schemas/Milestones"), ...std } } },
      "/saas/{slug}/funnel": { get: { tags: ["saas"], operationId: "getSaasFunnel", summary: "Lifecycle funnel (reached → signed_up → activated → trial → converted): only published stages, strategic rates, per-stage provenance", parameters: [slugParam, { name: "timeframe", in: "query", schema: { type: "string", enum: ["7d", "30d", "90d"], default: "30d" } }], responses: { 200: okRes("#/components/schemas/Funnel"), 400: errorRes("Invalid timeframe"), ...std } } },
      "/saas/{slug}/conversion": { get: { tags: ["saas"], operationId: "getSaasConversion", summary: "Conversion metrics (converted users, Signup/Activated/Trial → Converted) when published; never amounts", parameters: [slugParam], responses: { 200: okRes("#/components/schemas/Conversion"), ...std } } },
      "/saas/{slug}/engagement": { get: { tags: ["saas"], operationId: "getSaasEngagement", summary: "Engagement metrics (activated users, activation rate, retention) when published", parameters: [slugParam], responses: { 200: okRes("#/components/schemas/Engagement"), ...std } } },
      "/saas/{slug}/cohorts": { get: { tags: ["saas"], operationId: "getSaasCohorts", summary: "Monthly signup cohorts traced through the lifecycle (identity-matched), with identity quality", parameters: [slugParam], responses: { 200: okRes("#/components/schemas/Cohorts"), ...std } } },
      "/saas/{slug}/benchmarks": { get: { tags: ["saas"], operationId: "getSaasBenchmarks", summary: "Public benchmark statement (top-quarter positions only)", parameters: [slugParam], responses: { 200: okRes("#/components/schemas/BenchmarkHighlight"), ...std } } },
      "/discover": { get: { tags: ["discover"], operationId: "getDiscover", summary: "Discovery sections (trending, fastest, new, verified, movers, hidden gems) and the activity feed", parameters: [{ name: "category", in: "query", schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 30 } }], responses: { 200: okRes("#/components/schemas/Discover"), 400: errorRes("Invalid parameter"), ...std } } },
      "/compare": { get: { tags: ["discover"], operationId: "compare", summary: "Compare 2–4 products: absolute and indexed daily series", parameters: [{ name: "s", in: "query", required: true, schema: { type: "string" }, example: "acme,globex" }, { name: "days", in: "query", schema: { type: "string", enum: ["7", "30", "90", "365", "all"], default: "30" } }], responses: { 200: okRes("#/components/schemas/Compare"), 400: errorRes("Invalid parameter"), ...std } } },
      "/leaderboard": {
        get: {
          tags: ["leaderboard"], operationId: "getLeaderboard", summary: "Any leaderboard board with filters",
          parameters: [
            { name: "board", in: "query", schema: { type: "string", enum: BOARDS, default: "most-new" } },
            { name: "window", in: "query", schema: { type: "string", enum: ["24h", "7d", "30d"] } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "size", in: "query", schema: { type: "string", enum: ["0-100", "100-1k", "1k-10k", "10k-100k", "100k+"] } },
            { name: "verified", in: "query", schema: { type: "boolean", default: true } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
          ],
          responses: { 200: okRes("#/components/schemas/Leaderboard"), 400: errorRes("Invalid parameter"), ...std },
        },
      },
      "/trending": { get: { tags: ["leaderboard"], operationId: "getTrending", summary: "Alias for /leaderboard?board=trending", parameters: [{ name: "window", in: "query", schema: { type: "string", enum: ["24h", "7d", "30d"], default: "7d" } }, { name: "limit", in: "query", schema: { type: "integer", default: 50 } }], responses: { 200: okRes("#/components/schemas/Leaderboard"), ...std } } },
      "/categories": { get: { tags: ["leaderboard"], operationId: "getCategories", summary: "Categories with counts", responses: { 200: okRes("#/components/schemas/Categories"), ...std } } },
      "/users/{username}": { get: { tags: ["users"], operationId: "getUser", summary: "Public founder profile and public SaaS projects", parameters: [{ name: "username", in: "path", required: true, schema: { type: "string" } }], responses: { 200: okRes("#/components/schemas/Profile"), ...std } } },
    },
    components: {
      securitySchemes: { ApiKey: { type: "http", scheme: "bearer", bearerFormat: "ut_api_…", description: `Optional. Create keys at ${SITE_URL}/app/developer. Raises the limit to ${PLANS.free.api.perDay} requests/day (burst ${PLANS.free.api.burstPerMinute}/min).` } },
      schemas: {
        Meta: { type: "object", properties: { version: { type: "string", const: "v1" }, generatedAt: { type: "string", format: "date-time" } } },
        Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string", enum: ["bad_request", "unauthorized", "revoked", "expired", "forbidden", "not_found", "rate_limited", "internal"] }, message: { type: "string" } } } } },
        Trust: { type: "object", properties: { level: { type: "string", enum: ["verified", "unverified", "pending"] }, label: { type: "string" }, score: { type: "number" } } },
        Saas: {
          type: "object",
          properties: {
            slug: { type: "string" }, name: { type: "string" }, description: { type: "string" }, websiteUrl: { type: "string" }, logoUrl: { type: "string" }, category: { type: "string" }, tags: { type: "array", items: { type: "string" } }, demo: { type: "boolean" },
            projectType: { type: "string", enum: ["web", "mobile", "hybrid"] },
            stores: { type: "object", properties: { appStore: { type: "string" }, googlePlay: { type: "string" } } },
            trust: { $ref: "#/components/schemas/Trust" },
            metrics: { type: "object", properties: { totalUsers: { type: "integer" }, newUsers24h: { type: "integer" }, newUsers7d: { type: "integer" }, newUsers30d: { type: "integer" }, growth7dPct: { type: "number" }, growth30dPct: { type: "number" }, activated: { type: "object" }, retention: { type: "object" }, traffic: { type: "object" }, conversion: { $ref: "#/components/schemas/ConversionMetrics" }, revenue: { type: "object", deprecated: true, description: "Alias of conversion.convertedUsers as payingUsers; no amounts" } } },
            identityQuality: { $ref: "#/components/schemas/IdentityQuality" },
            ranks: { type: "object", properties: { leaderboard: { type: "integer" }, previousLeaderboard: { type: "integer" }, trending: { type: "integer" }, previousTrending: { type: "integer" }, trendingScore7d: { type: "number" } } },
            followers: { type: "integer" },
            owner: { type: "object", properties: { username: { type: "string" }, displayName: { type: "string" } } },
            timestamps: { type: "object", properties: { firstSnapshotAt: { type: "string", format: "date-time" }, lastSyncedAt: { type: "string", format: "date-time" } } },
            urls: { type: "object", properties: { page: { type: "string" }, badge: { type: "string" } } },
            milestones: { type: "array", items: { $ref: "#/components/schemas/Milestone" } },
          },
        },
        Metrics: { type: "object", properties: { slug: { type: "string" }, name: { type: "string" }, verification: { type: "string", enum: ["verified", "unverified", "pending"] }, metrics: { type: "object", properties: { totalUsers: { type: "integer" }, newUsers24h: { type: "integer" }, newUsers7d: { type: "integer" }, newUsers30d: { type: "integer" }, growth7dPercentage: { type: "number" }, growth30dPercentage: { type: "number" }, activatedUsers: { type: "integer" }, activationRatePercentage: { type: "number" }, trendingRank: { type: "integer" }, overallRank: { type: "integer" } } }, updatedAt: { type: "string", format: "date-time" }, urls: { type: "object" } } },
        History: { type: "object", properties: { range: { type: "string", enum: RANGES }, points: { type: "array", items: { type: "object", properties: { t: { type: "string", format: "date-time" }, totalUsers: { type: "integer" }, newUsers: { type: "integer" }, activatedUsers: { type: "integer" } } } } } },
        Milestone: { type: "object", properties: { id: { type: "string" }, kind: { type: "string" }, title: { type: "string" }, copy: { type: "string" }, value: { type: "number" }, achievedAt: { type: "string", format: "date-time" } } },
        Milestones: { type: "array", items: { $ref: "#/components/schemas/Milestone" } },
        Leaderboard: { type: "object", properties: { board: { type: "string", enum: BOARDS }, window: { type: "string" }, rows: { type: "array", items: { allOf: [{ type: "object", properties: { position: { type: "integer" }, movement: { type: "object", nullable: true } } }, { $ref: "#/components/schemas/Saas" }] } } } },
        IdentityQuality: { type: "string", enum: ["aggregate_only", "partially_mapped", "cohort_verified"] },
        ConversionMetrics: { type: "object", properties: { convertedUsers: { type: "integer" }, newConverted7d: { type: "integer" }, newConverted30d: { type: "integer" }, convertedGrowth30dPct: { type: "number" }, trialUsers: { type: "integer" }, signupToConvertedPct: { type: "number" }, activatedToConvertedPct: { type: "number" }, trialToConvertedPct: { type: "number" } } },
        Conversion: { type: "object", properties: { slug: { type: "string" }, name: { type: "string" }, verification: { type: "string", enum: ["verified", "unverified", "pending"] }, basis: { type: "string", const: "aggregate" }, identityQuality: { $ref: "#/components/schemas/IdentityQuality" }, conversion: { oneOf: [{ $ref: "#/components/schemas/ConversionMetrics" }, { type: "null" }] }, note: { type: "string" }, updatedAt: { type: "string", format: "date-time" }, urls: { type: "object" } } },
        Engagement: { type: "object", properties: { slug: { type: "string" }, name: { type: "string" }, verification: { type: "string", enum: ["verified", "unverified", "pending"] }, engagement: { type: "object", nullable: true, properties: { activatedUsers: { type: "integer" }, activated7d: { type: "integer" }, activated30d: { type: "integer" }, activationRatePct: { type: "number" }, retention: { type: "object" } } }, note: { type: "string" }, updatedAt: { type: "string", format: "date-time" }, urls: { type: "object" } } },
        Cohorts: { type: "object", properties: { slug: { type: "string" }, basis: { type: "string", const: "cohort" }, identityQuality: { $ref: "#/components/schemas/IdentityQuality" }, identityQualityLabel: { type: "string" }, explanation: { type: "string" }, cohorts: { type: "array", items: { type: "object", properties: { cohort: { type: "string", example: "2026-08" }, signedUp: { type: "integer", nullable: true }, activated: { type: "integer", nullable: true }, activationPct: { type: "number" }, activatedD7Pct: { type: "number" }, trial: { type: "integer", nullable: true }, trialPct: { type: "number" }, converted: { type: "integer", nullable: true }, convertedPct: { type: "number" }, convertedD30Pct: { type: "number" }, trialToConvertedPct: { type: "number" }, medianTimeToActivationMs: { type: "integer" }, medianTimeToConversionMs: { type: "integer" }, computedAt: { type: "string", format: "date-time" } } } }, note: { type: "string" } } },
        Funnel: { type: "object", properties: { timeframe: { type: "string", enum: ["7d", "30d", "90d"] }, days: { type: "integer" }, verification: { type: "string", enum: ["verified", "mixed", "self_reported", "none"] }, coverageDays: { type: "integer" }, basis: { type: "string", const: "aggregate" }, identityQuality: { $ref: "#/components/schemas/IdentityQuality" }, stages: { type: "array", items: { type: "object", properties: { key: { type: "string", enum: ["reached", "signed_up", "activated", "trial", "converted"] }, label: { type: "string" }, value: { type: "integer", nullable: true, description: "null when the owner publishes the rate but not the count" }, previous: { type: "integer" }, changePct: { type: "number" }, conversionPct: { type: "number" }, previousConversionPct: { type: "number" }, kind: { type: "string", enum: ["flow", "stock"] }, verified: { type: "boolean" }, health: { type: "string", enum: ["healthy", "attention", "stale"] }, updatedAt: { type: "string", format: "date-time" }, source: { type: "object", properties: { provider: { type: "string" }, label: { type: "string" }, verification: { type: "string", enum: ["verified", "partially_verified", "self_reported"] } } } } } }, rates: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string" }, pct: { type: "number" }, previousPct: { type: "number" }, adjacent: { type: "boolean" } } } } } },
        BenchmarkHighlight: { type: "object", properties: { slug: { type: "string" }, highlight: { type: "object", nullable: true, properties: { statement: { type: "string" }, metric: { type: "string" }, cohort: { type: "string" }, percentile: { type: "integer" }, sampleSize: { type: "integer" } } }, note: { type: "string" } } },
        FeedItem: { type: "object", properties: { id: { type: "string" }, kind: { type: "string", enum: ["milestone", "spike", "activation_spike", "launched", "verified"] }, subkind: { type: "string" }, at: { type: "string", format: "date-time" }, title: { type: "string" }, detail: { type: "string" }, value: { type: "number" }, saas: { type: "object" }, urls: { type: "object" } } },
        Discover: { type: "object", properties: { sections: { type: "object", additionalProperties: { type: "array", items: { $ref: "#/components/schemas/Saas" } } }, hiddenGemRules: { type: "object" }, categories: { type: "array", items: { type: "object" } }, feed: { type: "array", items: { $ref: "#/components/schemas/FeedItem" } } } },
        Compare: { type: "object", properties: { days: { oneOf: [{ type: "integer" }, { type: "string", const: "all" }] }, products: { type: "array", items: { allOf: [{ $ref: "#/components/schemas/Saas" }, { type: "object", properties: { series: { type: "array", items: { type: "object", properties: { day: { type: "string" }, totalUsers: { type: "integer" }, newUsers: { type: "integer" }, activatedUsers: { type: "integer" }, index: { type: "number" } } } } } }] } }, urls: { type: "object" } } },
        Categories: { type: "array", items: { type: "object", properties: { slug: { type: "string" }, label: { type: "string" }, count: { type: "integer" }, url: { type: "string" } } } },
        Profile: { type: "object", properties: { username: { type: "string" }, displayName: { type: "string" }, avatarUrl: { type: "string" }, bio: { type: "string" }, links: { type: "object" }, followers: { type: "integer" }, urls: { type: "object" }, saas: { type: "array", items: { $ref: "#/components/schemas/Saas" } } } },
      },
    },
  };
}
