// UserTrack MCP endpoint (Streamable HTTP, stateless). Auth: `Authorization: Bearer ut_mcp_…`.
import { bearer } from "@/lib/api/gateway";
import { looksLikeSecret, tokenTypeOf } from "@convex/lib/tokens";
import { handleMcpRequest, MCP_VERSION } from "@/lib/mcp/server";
import { SETUP_WORKFLOW, TOOLS } from "@/lib/mcp/tools";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID", "Access-Control-Expose-Headers": "Mcp-Session-Id" };

function unauthorized(message: string) {
  const ascii = message.replace(/[^\x20-\x7e]/g, "").replace(/"/g, "'");
  return Response.json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }, { status: 401, headers: { ...CORS, "WWW-Authenticate": `Bearer realm="UserTrack MCP", error="invalid_token", error_description="${ascii}"` } });
}

export async function POST(req: Request) {
  const secret = bearer(req);
  if (!secret) return unauthorized("Missing MCP token. Send Authorization: Bearer ut_mcp_… (create one at /app/developer).");
  if (!looksLikeSecret(secret) || tokenTypeOf(secret) !== "mcp") return unauthorized("Invalid MCP token. Public API keys (ut_api_) cannot be used for MCP.");
  const res = await handleMcpRequest(req, secret);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

// Discovery for humans and crawlers. MCP clients only ever POST.
export async function GET(req: Request) {
  if (req.headers.get("accept")?.includes("text/event-stream")) {
    return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "This server is stateless; server-initiated streams are not supported. POST JSON-RPC requests instead." }, id: null }, { status: 405, headers: CORS });
  }
  return Response.json(
    {
      name: "usertrack",
      version: MCP_VERSION,
      transport: "streamable-http",
      endpoint: `${SITE_URL}/mcp`,
      auth: { type: "bearer", tokenPrefix: "ut_mcp_", createAt: `${SITE_URL}/app/developer` },
      docs: `${SITE_URL}/developers#mcp`,
      tools: TOOLS.map((t) => ({ name: t.name, scope: t.scope, readOnly: t.readOnly, description: t.description })),
      setupWorkflow: SETUP_WORKFLOW,
    },
    { headers: { ...CORS, "Cache-Control": "public, s-maxage=3600" } },
  );
}

export async function DELETE() {
  return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Stateless server: there is no session to delete." }, id: null }, { status: 405, headers: CORS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}
