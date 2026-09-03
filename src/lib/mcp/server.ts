// Stateless MCP server over Streamable HTTP. One server + transport per request; auth is the founder's ut_mcp_ token.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { fetchMutation } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { AGENT_PROMPT, BETTER_AUTH_AGENT_PROMPT, MOBILE_AGENT_PROMPT, NATIVE_AGENT_PROMPT } from "./snippets";
import { SERVER_INSTRUCTIONS, TOOLS } from "./tools";
import { authorize, gatewayAuth, toFailure, type GatewayFailure } from "@/lib/api/gateway";
import { hashSecret } from "@/lib/api/gateway";
import { limit } from "@/lib/api/rate-limit";

export const MCP_VERSION = "1.0.0";

function textResult(value: unknown, isError = false) {
  // structuredContent must be a JSON object; list results (e.g. projects) are wrapped so they still validate.
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: (value && typeof value === "object" && !Array.isArray(value) ? value : { items: value ?? null }) as Record<string, unknown>, isError };
}

function errorResult(f: GatewayFailure) {
  const hint =
    f.code === "rate_limited" ? `Wait ${f.retryAfterSec ?? 60}s before retrying; do not loop.`
    : f.code === "forbidden" ? `Ask the founder for a token with the ${f.requiredScope} scope (UserTrack → Developer → MCP tokens).`
    : f.code === "revoked" || f.code === "expired" || f.code === "unauthorized" ? "Ask the founder to create a new MCP token at /app/developer and update the MCP configuration."
    : f.code === "not_found" ? "Call usertrack_get_projects to see the projects this token can access."
    : undefined;
  return textResult({ error: { ...f, hint } }, true);
}

export function createMcpServer(req: Request, secret: string) {
  const server = new McpServer({ name: "usertrack", version: MCP_VERSION }, { instructions: SERVER_INSTRUCTIONS });
  const auth = gatewayAuth(secret);
  for (const t of TOOLS) {
    server.registerTool(
      t.name,
      { title: t.title, description: `${t.description} Requires scope ${t.scope}.`, inputSchema: t.input, annotations: { readOnlyHint: t.readOnly, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      async (args: Record<string, unknown>) => {
        const burst = await limit(req, "mcp", hashSecret(secret));
        if (!burst.allowed) return errorResult({ code: "rate_limited", message: `Burst limit of ${burst.limit} tool calls per minute exceeded`, retryAfterSec: burst.retryAfterSec });
        try {
          await authorize(secret, "mcp", t.name, t.scope);
          return textResult(await t.run(auth, args));
        } catch (e) {
          const f = toFailure(e);
          if (f && !t.readOnly && !["unauthorized", "revoked", "expired", "forbidden"].includes(f.code)) {
            void fetchMutation(api.gateway.auditFailure, { auth, action: t.name, detail: f.message, projectId: args.projectId as string | undefined, slug: args.slug as string | undefined }).catch(() => {});
          }
          if (f) return errorResult(f);
          console.error("[mcp]", t.name, e);
          return textResult({ error: { code: "internal", message: (e as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0] } }, true);
        }
      },
    );
  }
  server.registerPrompt("add_project_to_usertrack", { title: "Add this project to UserTrack", description: "The end-to-end onboarding prompt: detect the stack, create the project, configure and verify tracking, publish, return the URL." }, () => ({
    messages: [{ role: "user", content: { type: "text", text: AGENT_PROMPT } }],
  }));
  server.registerPrompt("add_mobile_app_to_usertrack", { title: "Add this iOS / Android app to UserTrack", description: "Mobile onboarding: identity source (never Sign in with Apple), PostHog activation, RevenueCat conversion (read-only, no revenue), store URLs, publish, return the URL." }, () => ({
    messages: [{ role: "user", content: { type: "text", text: MOBILE_AGENT_PROMPT } }],
  }));
  server.registerPrompt("add_better_auth_project_to_usertrack", { title: "Add this Better Auth project to UserTrack", description: "Native plugin onboarding: create the integration, install @usertrack/better-auth, register the plugin safely, set env vars, deploy, verify, sync, return the URL." }, () => ({
    messages: [{ role: "user", content: { type: "text", text: BETTER_AUTH_AGENT_PROMPT } }],
  }));
  server.registerPrompt("add_native_sdk_project_to_usertrack", { title: "Add this project to UserTrack with the native SDK", description: "Native SDK onboarding for Prisma / Drizzle / Convex / Auth.js / custom apps: create the integration, install @usertrack/node, mount one signed count handler, set env vars, deploy, verify, sync, return the URL." }, () => ({
    messages: [{ role: "user", content: { type: "text", text: NATIVE_AGENT_PROMPT } }],
  }));
  return server;
}

export async function handleMcpRequest(req: Request, secret: string) {
  const server = createMcpServer(req, secret);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } finally {
    // Stateless: tear down after the response so nothing lingers between requests.
    void transport.close().catch(() => {});
  }
}
