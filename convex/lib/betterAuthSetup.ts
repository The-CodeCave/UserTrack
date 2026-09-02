// Everything a founder or coding agent needs to install @usertrack/better-auth. Pure data; shared by the dashboard,
// the public docs and the MCP tool usertrack_get_better_auth_setup.
export const PACKAGE_NAME = "@usertrack/better-auth";
export const PLUGIN_MIN_BETTER_AUTH = "1.3.0";
export const ENV_PROJECT_ID = "USERTRACK_PROJECT_ID";
export const ENV_SECRET = "USERTRACK_SECRET";
export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export const INSTALL_COMMANDS: Record<PackageManager, string> = {
  npm: `npm install ${PACKAGE_NAME}`,
  pnpm: `pnpm add ${PACKAGE_NAME}`,
  yarn: `yarn add ${PACKAGE_NAME}`,
  bun: `bun add ${PACKAGE_NAME}`,
};

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

export const WHAT_IS_SENT = [
  "Total registered users and new users in 24h / 7d / 30d, plus a daily series on first sync (aggregate counts only).",
  "Optional lifecycle events user.created / user.deleted with a pseudonymous HMAC-derived subject — never the user id, email, name or profile.",
  "Never: emails, names, passwords, password hashes, session tokens, verification tokens, account or provider metadata.",
];

export interface BetterAuthSetupInput {
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
export function betterAuthSetup(input: BetterAuthSetupInput) {
  const pm = detectPackageManager(input.packageManager);
  const supported = !input.betterAuthVersion || versionGte(input.betterAuthVersion, PLUGIN_MIN_BETTER_AUTH);
  const projectRef = input.projectId ?? "<projectId>";
  const steps = [
    ...(input.integrationExists ? [] : [{ id: "create", title: "Create the Better Auth integration in UserTrack", detail: `Call usertrack_create_integration with { projectId: "${projectRef}", provider: "better_auth", url: "<https://your-app.com/api/auth>" }. The response contains ${ENV_PROJECT_ID} and ${ENV_SECRET} exactly once; if you lose the secret call it again with rotate: true.`, action: "call_tool" as const, tool: "usertrack_create_integration" }]),
    { id: "install", title: `Install ${PACKAGE_NAME}`, detail: `${INSTALL_COMMANDS[pm]} (peer dependency better-auth >=${PLUGIN_MIN_BETTER_AUTH}).`, action: "modify_repo" as const },
    { id: "config", title: "Register the plugin", detail: `${input.authConfigPath ? `Edit ${input.authConfigPath}: ` : ""}import userTrack and append userTrack({ projectId: process.env.${ENV_PROJECT_ID}!, secret: process.env.${ENV_SECRET}! }) to the plugins array. Keep everything else untouched.`, action: "modify_repo" as const },
    { id: "env", title: "Declare the environment variables", detail: `Add ${ENV_PROJECT_ID} and ${ENV_SECRET} to .env.example (empty) and set the real values in the git-ignored local env file and in the hosting provider (all environments serving the product). Never commit the secret.`, action: "modify_repo" as const },
    { id: "check", title: "Typecheck and test", detail: "Run the repository's typecheck/test commands. Fix only errors caused by this change.", action: "modify_repo" as const },
    { id: "deploy", title: "Deploy", detail: `The metrics endpoint must be reachable at ${input.metricsUrl ?? "<Better Auth base URL>/usertrack/metrics"} with the new env vars. If you cannot deploy, tell the founder exactly what to deploy and stop before verifying.`, action: "deploy" as const },
    { id: "verify", title: "Verify", detail: `Call usertrack_verify_integration with { projectId: "${projectRef}", role: "users" }. On success UserTrack records the first verified snapshot and schedules syncs every 4 hours. Errors are actionable (missing plugin → 404, wrong secret → signature rejected, clock skew → stale).`, action: "verify" as const, tool: "usertrack_verify_integration" },
    { id: "sync", title: "Trigger the first sync", detail: `Call usertrack_sync_project with { projectId: "${projectRef}" } (the verify step already started one; this is only needed if you re-deployed).`, action: "call_tool" as const, tool: "usertrack_sync_project" },
    { id: "publish", title: "Publish and share", detail: `usertrack_update_project { projectId: "${projectRef}", isPublic: true } then usertrack_get_share_url.`, action: "call_tool" as const, tool: "usertrack_update_project" },
  ];
  return {
    provider: "better_auth" as const,
    package: PACKAGE_NAME,
    packageManager: pm,
    installCommand: INSTALL_COMMANDS[pm],
    installCommands: INSTALL_COMMANDS,
    minimumBetterAuthVersion: PLUGIN_MIN_BETTER_AUTH,
    detectedBetterAuthVersion: input.betterAuthVersion,
    supported,
    ...(supported ? {} : { unsupportedReason: `better-auth ${input.betterAuthVersion} is below ${PLUGIN_MIN_BETTER_AUTH}. Upgrade better-auth first (the plugin uses createAuthEndpoint, databaseHooks and adapter.count).` }),
    environmentVariables: [ENV_PROJECT_ID, ENV_SECRET],
    envExample: ENV_EXAMPLE_SNIPPET,
    configExample: PLUGIN_SNIPPET,
    codeModificationRules: CODE_MODIFICATION_RULES,
    whatIsSent: WHAT_IS_SENT,
    endpoint: { path: "/usertrack/metrics", method: "POST", auth: "HMAC-SHA256 request + response signatures with the integration secret; 5-minute timestamp window; nonce replay protection" },
    steps,
    verification: { nextTool: "usertrack_verify_integration", args: { projectId: projectRef, role: "users" } },
    nextTool: input.integrationExists ? (input.awaitingVerification ? "usertrack_verify_integration" : "usertrack_sync_project") : "usertrack_create_integration",
  };
}

function versionGte(version: string, min: string) {
  const a = version.replace(/^[^\d]*/, "").split(/[.-]/).slice(0, 3).map((x) => Number(x) || 0);
  const b = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}
