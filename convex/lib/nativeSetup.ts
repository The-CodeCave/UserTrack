// Everything a founder or coding agent needs to install a native UserTrack source (@usertrack/better-auth or
// @usertrack/node with an adapter). Pure data; shared by the dashboard wizard, the public docs and the MCP tools.
import { NATIVE_PACKAGE, NATIVE_SOURCE_LABEL, NATIVE_SOURCES, type NativeSource, normalizeSource } from "./nativeProtocol";

export { NATIVE_PACKAGE, NATIVE_SOURCE_LABEL, NATIVE_SOURCES, type NativeSource, normalizeSource };
export const PACKAGE_NAME = "@usertrack/better-auth";
export const NODE_PACKAGE_NAME = "@usertrack/node";
export const PLUGIN_MIN_BETTER_AUTH = "1.3.0";
export const ENV_PROJECT_ID = "USERTRACK_PROJECT_ID";
export const ENV_SECRET = "USERTRACK_SECRET";
export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

// Floors, not decoration: @usertrack/protocol < 0.1.1 carries a `node:crypto` fallback that breaks every
// isolate-runtime bundler (Convex, Workers, Deno, Edge). Installing below these versions cannot be deployed there.
export const MINIMUM_PACKAGE_VERSION: Record<string, string> = { "@usertrack/better-auth": "0.2.1", "@usertrack/node": "0.1.1", "@usertrack/protocol": "0.1.1" };

const ADD: Record<PackageManager, string> = { npm: "npm install", pnpm: "pnpm add", yarn: "yarn add", bun: "bun add" };
// `@latest` on purpose: a bare add can be satisfied from a stale packument cache or lockfile entry and silently
// resolve a pre-0.1.1 transitive @usertrack/protocol.
export const installCommands = (source: NativeSource): Record<PackageManager, string> => Object.fromEntries(PACKAGE_MANAGERS.map((pm) => [pm, `${ADD[pm]} ${NATIVE_PACKAGE[source]}@latest`])) as Record<PackageManager, string>;
export const INSTALL_COMMANDS = installCommands("better-auth");

export const detectPackageManager = (hint?: string): PackageManager => {
  const h = (hint ?? "").toLowerCase();
  if (h.includes("pnpm")) return "pnpm";
  if (h.includes("yarn")) return "yarn";
  if (h.includes("bun")) return "bun";
  return "npm";
};

export const PLUGIN_SNIPPET = `import { betterAuth } from "better-auth";
import { userTrack } from "@usertrack/better-auth";

export const auth = betterAuth({
  // ...your existing options stay unchanged
  plugins: [
    // ...your existing plugins stay unchanged
    userTrack({
      projectId: process.env.USERTRACK_PROJECT_ID!,
      secret: process.env.USERTRACK_SECRET!,
    }),
  ],
});`;

const ROUTE_PATH = "app/api/usertrack/metrics/route.ts";
const route = (imports: string, users: string, source: NativeSource) => `// ${ROUTE_PATH} — signed, read-only aggregate counts for UserTrack (no user records)
import { createUserTrackHandler } from "@usertrack/node";
${imports}
export const POST = createUserTrackHandler({
  projectId: process.env.USERTRACK_PROJECT_ID!,
  secret: process.env.USERTRACK_SECRET!,
  source: "${source}",
  users: ${users},
  // optional: activation: <count source of activated users>, conversion: { converted: <count source> }
});`;

export interface SetupFile { path: string; language: "typescript" | "dotenv" | "bash"; code: string; optional?: boolean; title: string }

// Per-source code: the route (or plugin registration) UserTrack pulls from, plus an optional push hook.
export const SOURCE_FILES: Record<NativeSource, { route: SetupFile; push?: SetupFile; notes: string[] }> = {
  "better-auth": {
    route: { path: "lib/auth.ts (your Better Auth config)", language: "typescript", title: "Register the plugin", code: PLUGIN_SNIPPET },
    notes: ["The plugin adds POST <basePath>/usertrack/metrics to your Better Auth instance and pushes user.created / user.deleted events itself.", `Peer dependency better-auth >= ${PLUGIN_MIN_BETTER_AUTH}. Anonymous-plugin users are excluded automatically.`],
  },
  prisma: {
    route: { path: ROUTE_PATH, language: "typescript", title: "Mount the handler", code: route(`import { prismaUsers } from "@usertrack/node/prisma";\nimport { prisma } from "@/lib/prisma";\n`, "prismaUsers(prisma.user)", "prisma") },
    push: { path: "lib/prisma.ts", language: "typescript", title: "Optional: push signups between syncs", optional: true, code: `import { PrismaClient } from "@prisma/client";\nimport { userTrackPrismaExtension } from "@usertrack/node/prisma";\n\nexport const prisma = new PrismaClient().$extends(userTrackPrismaExtension({ projectId: process.env.USERTRACK_PROJECT_ID!, secret: process.env.USERTRACK_SECRET! }));` },
    notes: ["prismaUsers(prisma.user) runs count() with createdAt filters only — no rows are read. Pass { createdAtField: null } if the model has no timestamp, or { where: { deletedAt: null } } to exclude soft-deleted users.", "Any model works as a source: prismaUsers(prisma.workspace) for activation, prismaUsers(prisma.subscription, { where: { status: \"active\" } }) for conversion."],
  },
  drizzle: {
    route: { path: ROUTE_PATH, language: "typescript", title: "Mount the handler", code: route(`import { drizzleUsers } from "@usertrack/node/drizzle";\nimport { db } from "@/db";\nimport { users } from "@/db/schema";\n`, "drizzleUsers(db, users, { createdAt: users.createdAt })", "drizzle") },
    push: { path: "where you insert users", language: "typescript", title: "Optional: push signups between syncs", optional: true, code: `import { createTracker } from "@usertrack/node";\nconst usertrack = createTracker({ projectId: process.env.USERTRACK_PROJECT_ID!, secret: process.env.USERTRACK_SECRET!, source: "drizzle" });\n\nconst [user] = await db.insert(users).values(values).returning();\nusertrack.track("user.created", { id: user.id }); // fire-and-forget, never throws` },
    notes: ["drizzleUsers runs select count(*) with created_at >= $1 / < $2 — any driver (pg, mysql2, better-sqlite3, neon, planetscale).", "Omit createdAt for totals only; add where: isNull(users.deletedAt) to exclude soft-deleted rows."],
  },
  convex: {
    route: { path: "convex/http.ts + convex/usertrack.ts", language: "typescript", title: "Mount the HTTP action", code: `// convex/usertrack.ts
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { countWithCap } from "@usertrack/node/convex";

export const countUsers = internalQuery({
  args: { createdAtGte: v.optional(v.number()), createdAtLt: v.optional(v.number()) },
  handler: (ctx, { createdAtGte = 0, createdAtLt = Number.MAX_SAFE_INTEGER }) =>
    countWithCap(ctx.db.query("users").withIndex("by_creation_time", (q) => q.gte("_creationTime", createdAtGte).lt("_creationTime", createdAtLt))),
});

// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { convexHandler } from "@usertrack/node/convex";

const http = httpRouter();
http.route({ path: "/usertrack/metrics", method: "POST", handler: httpAction(convexHandler({ projectId: process.env.USERTRACK_PROJECT_ID!, secret: process.env.USERTRACK_SECRET!, users: internal.usertrack.countUsers })) });
export default http;` },
    notes: ["Convex has no cheap count: countWithCap reads up to 10,000 documents and reports exact: false beyond that (shown as approximate). Use @convex-dev/aggregate for exact counts at scale.", "The base URL in UserTrack is your Convex site URL (https://<deployment>.convex.site); env vars are set with npx convex env set."],
  },
  authjs: {
    route: { path: ROUTE_PATH, language: "typescript", title: "Mount the handler", code: route(`import { prismaUsers } from "@usertrack/node/prisma"; // or drizzleUsers from "@usertrack/node/drizzle"\nimport { prisma } from "@/lib/prisma";\n`, "prismaUsers(prisma.user, { createdAtField: null })", "authjs") },
    push: { path: "auth.ts", language: "typescript", title: "Optional: push signups between syncs", optional: true, code: `import { userTrackAuthjsEvents } from "@usertrack/node/authjs";\n\nexport const { handlers, auth } = NextAuth({\n  // ...your existing options stay unchanged\n  events: { ...userTrackAuthjsEvents({ projectId: process.env.USERTRACK_PROJECT_ID!, secret: process.env.USERTRACK_SECRET! }) },\n});` },
    notes: ["Auth.js adapters expose no count method, so counting goes through your database adapter's User model (Prisma or Drizzle).", "The default Auth.js User model has no createdAt column: add one (createdAt DateTime @default(now())) and drop createdAtField: null to unlock 24h / 7d / 30d signups and history."],
  },
  custom: {
    route: { path: ROUTE_PATH, language: "typescript", title: "Mount the handler", code: route("", `{ count: ({ createdAtGte, createdAtLt }) => countUsers({ createdAtGte, createdAtLt }) } // your own aggregate query`, "custom") },
    push: { path: "where you create users", language: "typescript", title: "Optional: push signups between syncs", optional: true, code: `import { createTracker } from "@usertrack/node";\nconst usertrack = createTracker({ projectId: process.env.USERTRACK_PROJECT_ID!, secret: process.env.USERTRACK_SECRET! });\nusertrack.track("user.created", { id: user.id }); // after your insert; fire-and-forget` },
    notes: ["A count source is { count({ createdAtGte?, createdAtLt? }) => Promise<number | { count, exact }> }. Return counts only — never rows.", "Express: app.post(\"/api/usertrack/metrics\", toNodeHandler(handler)); Hono: app.post(\"/api/usertrack/metrics\", (c) => handler(c.req.raw))."],
  },
};

export const envSnippet = (projectId: string, secret = "ut_int_…") => `${ENV_PROJECT_ID}=${projectId}\n${ENV_SECRET}=${secret}`;
export const ENV_EXAMPLE_SNIPPET = `# UserTrack (https://usertrack.dev) — registered-user growth metrics, no PII\n${ENV_PROJECT_ID}=\n${ENV_SECRET}=`;

export const CODE_MODIFICATION_RULES = [
  "Locate the file that calls betterAuth({ ... }) (commonly lib/auth.ts, src/lib/auth.ts, auth.ts, server/auth.ts, or convex/auth.ts). Do not create a second Better Auth instance.",
  `Add the import { userTrack } from "${PACKAGE_NAME}" next to the existing imports.`,
  "If a plugins array exists, append userTrack({ ... }) to it; never replace, reorder or remove existing plugins. If none exists, add plugins: [userTrack({ ... })].",
  `Read projectId and secret from process.env.${ENV_PROJECT_ID} / process.env.${ENV_SECRET} (or the framework's env helper). Never hardcode the secret and never commit it.`,
  `Add both variable names to .env.example (values empty) and the real values to the local env file that is git-ignored (.env.local / .env). Add them to the hosting provider's environment for every environment that serves the app.`,
  "Preserve every existing Better Auth option: baseURL, database adapter, emailAndPassword, socialProviders, session settings, hooks and trustedOrigins stay exactly as they were.",
  "Do not change login, signup or session behaviour. The plugin is observational: it adds one signed endpoint (POST <basePath>/usertrack/metrics) and fire-and-forget lifecycle events.",
  "Run the project's typecheck and tests after the change; the plugin ships its own types.",
  "Deploy. UserTrack can only verify once the new build with the env vars is live.",
];

export const NODE_MODIFICATION_RULES = [
  "Install with the @latest suffix and check `npm ls @usertrack/protocol` resolves to 0.1.1 or newer before writing code. Older versions bundle a node:crypto fallback that breaks Convex, Workers, Deno and Edge builds; if the lockfile pins an older one, update it rather than patching or aliasing the builtin.",
  "Add exactly one route file that exports the UserTrack handler; do not change authentication, billing or database code beyond that (and the optional push hook).",
  "The users count source must count registered users only (exclude anonymous / soft-deleted rows with a where filter) and must never return rows.",
  `Read projectId and secret from process.env.${ENV_PROJECT_ID} / process.env.${ENV_SECRET}. Never hardcode the secret and never commit it.`,
  "Add both variable names to .env.example (values empty) and the real values to the git-ignored local env file and to the hosting provider for every environment that serves the app.",
  "Optional sources: activation = a table with one row per activated user; conversion.converted = users with an active paid subscription (conversion state only — never amounts).",
  "Run the project's typecheck and tests after the change; the SDK ships its own types.",
  "Deploy. UserTrack can only verify once the route with the env vars is live.",
];

export const WHAT_IS_SENT = [
  "Total registered users and new users in 24h / 7d / 30d, plus a daily series on first sync (aggregate counts only).",
  "Optionally activated users and converted / trial users from the same handler (counts only — never amounts, prices or MRR).",
  "Optional lifecycle events user.created / user.deleted / user.activated / trial.started / user.converted with a pseudonymous HMAC-derived subject — never the user id, email, name or profile.",
  "Never: emails, names, passwords, password hashes, session tokens, verification tokens, account or provider metadata.",
];

// Failure modes an agent can hit and fix without a human. `symptom` carries the literal error text so a search over
// this plan matches what the toolchain printed.
export const KNOWN_ISSUES = [
  {
    id: "node-crypto-bundle",
    symptom: 'Could not resolve "node:crypto" — or `npx convex deploy` / any Workers, Deno or Edge build failing on a node builtin while bundling the UserTrack handler.',
    cause: "@usertrack/protocol below 0.1.1 reached for node:crypto when globalThis.crypto.subtle was absent. That branch never runs on an isolate runtime, but bundlers resolve dynamic imports statically, so the build fails before it ever executes.",
    fix: "Install the current versions and make sure the transitive @usertrack/protocol is >= 0.1.1: `npm install @usertrack/node@latest --prefer-online` (pnpm/bun/yarn equivalent), then confirm with `npm ls @usertrack/protocol`. A lockfile pinned to 0.1.0 needs `npm update @usertrack/protocol`. Do not vendor, patch or alias node:crypto — the fixed package needs no polyfill.",
  },
  {
    id: "web-crypto-missing",
    symptom: "UserTrack requires the Web Crypto API (globalThis.crypto.subtle)",
    cause: "The runtime predates unflagged Web Crypto — in practice Node 18 or older. Every supported runtime (Node 20+, Convex, Deno, Bun, Workers, Edge) provides it.",
    fix: "Upgrade the runtime to Node 20 or newer. Node 18 reached end of life on 2025-04-30 and is not supported.",
  },
] as const;

export interface NativeSetupInput {
  source?: string;
  projectId?: string;
  projectSlug?: string;
  packageManager?: string;
  betterAuthVersion?: string;
  framework?: string;
  authConfigPath?: string;
  metricsUrl?: string;
  integrationExists?: boolean;
  awaitingVerification?: boolean;
}

// The structured plan returned to agents. Never contains the secret; that only exists in the usertrack_create_integration response.
export function nativeSetup(input: NativeSetupInput) {
  const source = normalizeSource(input.source ?? "better-auth");
  const pm = detectPackageManager(input.packageManager);
  const pkg = NATIVE_PACKAGE[source];
  const files = SOURCE_FILES[source];
  const ba = source === "better-auth";
  const supported = !ba || !input.betterAuthVersion || versionGte(input.betterAuthVersion, PLUGIN_MIN_BETTER_AUTH);
  const projectRef = input.projectId ?? "<projectId>";
  const defaultUrl = ba ? "<https://your-app.com/api/auth>" : source === "convex" ? "<https://your-deployment.convex.site>" : "<https://your-app.com/api/usertrack>";
  const steps = [
    ...(input.integrationExists ? [] : [{ id: "create", title: `Create the ${NATIVE_SOURCE_LABEL[source]} integration in UserTrack`, detail: `Call usertrack_create_integration with { projectId: "${projectRef}", provider: "native", source: "${source}", url: "${defaultUrl}" }. The response contains ${ENV_PROJECT_ID} and ${ENV_SECRET} exactly once; if you lose the secret call it again with rotate: true.`, action: "call_tool" as const, tool: "usertrack_create_integration" }]),
    { id: "install", title: `Install ${pkg}`, detail: `${installCommands(source)[pm]}${ba ? ` (peer dependency better-auth >=${PLUGIN_MIN_BETTER_AUTH})` : ""}. Requires ${pkg} >= ${MINIMUM_PACKAGE_VERSION[pkg]} and a transitive @usertrack/protocol >= ${MINIMUM_PACKAGE_VERSION["@usertrack/protocol"]}; keep the @latest suffix so a stale cache or lockfile cannot resolve an older one. Verify with \`npm ls @usertrack/protocol\` (or the equivalent) before moving on — anything below ${MINIMUM_PACKAGE_VERSION["@usertrack/protocol"]} fails to bundle on Convex, Workers, Deno and Edge. Runtime: Node 20+ or any runtime with globalThis.crypto.subtle.`, action: "modify_repo" as const },
    { id: "config", title: files.route.title, detail: ba ? `${input.authConfigPath ? `Edit ${input.authConfigPath}: ` : ""}import userTrack and append userTrack({ projectId: process.env.${ENV_PROJECT_ID}!, secret: process.env.${ENV_SECRET}! }) to the plugins array. Keep everything else untouched.` : `Add ${files.route.path} from the code template (users = registered users; optionally activation / conversion sources). ${files.notes[0]}`, action: "modify_repo" as const },
    { id: "env", title: "Declare the environment variables", detail: `Add ${ENV_PROJECT_ID} and ${ENV_SECRET} to .env.example (empty) and set the real values in the git-ignored local env file and in the hosting provider (all environments serving the product). Never commit the secret.`, action: "modify_repo" as const },
    ...(files.push ? [{ id: "push", title: files.push.title, detail: `${files.push.path}: ${files.push.code.split("\n").slice(-1)[0]} — fire-and-forget, never blocks a signup. Skip if you prefer pull-only.`, action: "modify_repo" as const }] : []),
    { id: "check", title: "Typecheck and test", detail: "Run the repository's typecheck/test commands. Fix only errors caused by this change.", action: "modify_repo" as const },
    { id: "deploy", title: "Deploy", detail: `The metrics endpoint must be reachable at ${input.metricsUrl ?? (ba ? "<Better Auth base URL>/usertrack/metrics" : "<base URL>/metrics")} with the new env vars. If you cannot deploy, tell the founder exactly what to deploy and stop before verifying.`, action: "deploy" as const },
    { id: "verify", title: "Verify", detail: `Call usertrack_verify_integration with { projectId: "${projectRef}", role: "users" }. On success UserTrack records the first verified snapshot, schedules syncs every 4 hours and attaches activation / conversion automatically when the handler reports them. Errors are actionable (missing handler → 404, wrong secret → signature rejected, clock skew → stale).`, action: "verify" as const, tool: "usertrack_verify_integration" },
    { id: "sync", title: "Trigger the first sync", detail: `Call usertrack_sync_project with { projectId: "${projectRef}" } (the verify step already started one; this is only needed if you re-deployed).`, action: "call_tool" as const, tool: "usertrack_sync_project" },
    { id: "publish", title: "Publish and share", detail: `usertrack_update_project { projectId: "${projectRef}", isPublic: true } then usertrack_get_share_url.`, action: "call_tool" as const, tool: "usertrack_update_project" },
  ];
  const codeFiles: SetupFile[] = [files.route, ...(files.push ? [files.push] : []), { path: ".env.example", language: "dotenv", title: "Environment", code: ENV_EXAMPLE_SNIPPET }];
  return {
    provider: "native" as const,
    source,
    sourceLabel: NATIVE_SOURCE_LABEL[source],
    package: pkg,
    packageManager: pm,
    installCommand: installCommands(source)[pm],
    installCommands: installCommands(source),
    ...(ba ? { minimumBetterAuthVersion: PLUGIN_MIN_BETTER_AUTH, detectedBetterAuthVersion: input.betterAuthVersion } : {}),
    supported,
    ...(supported ? {} : { unsupportedReason: `better-auth ${input.betterAuthVersion} is below ${PLUGIN_MIN_BETTER_AUTH}. Upgrade better-auth first (the plugin uses createAuthEndpoint, databaseHooks and adapter.count).` }),
    environmentVariables: [ENV_PROJECT_ID, ENV_SECRET],
    envExample: ENV_EXAMPLE_SNIPPET,
    configExample: files.route.code,
    files: codeFiles,
    notes: files.notes,
    minimumPackageVersion: MINIMUM_PACKAGE_VERSION[pkg],
    minimumProtocolVersion: MINIMUM_PACKAGE_VERSION["@usertrack/protocol"],
    runtimeRequirement: "Node 20+, or any runtime exposing globalThis.crypto.subtle (Convex, Deno, Bun, Cloudflare Workers, Vercel Edge). The SDK contains no Node builtins and needs no polyfill.",
    knownIssues: KNOWN_ISSUES,
    codeModificationRules: ba ? CODE_MODIFICATION_RULES : NODE_MODIFICATION_RULES,
    whatIsSent: WHAT_IS_SENT,
    endpoint: { path: ba ? "/usertrack/metrics" : "/metrics", method: "POST", auth: "HMAC-SHA256 request + response signatures with the integration secret; 5-minute timestamp window; nonce replay protection" },
    steps,
    verification: { nextTool: "usertrack_verify_integration", args: { projectId: projectRef, role: "users" } },
    nextTool: input.integrationExists ? (input.awaitingVerification ? "usertrack_verify_integration" : "usertrack_sync_project") : "usertrack_create_integration",
  };
}

// Deprecated alias kept for the usertrack_get_better_auth_setup tool.
export const betterAuthSetup = (input: Omit<NativeSetupInput, "source">) => nativeSetup({ ...input, source: "better-auth" });

function versionGte(version: string, min: string) {
  const a = version.replace(/^[^\d]*/, "").split(/[.-]/).slice(0, 3).map((x) => Number(x) || 0);
  const b = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}
